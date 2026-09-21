/**
 * 待办数据层 — 待办是「用户级」数据，按 createdBy / assignee(username) 隔离，
 * 支持跨设备同步与「张三给李四派单」式协作（P2-7）。
 *
 * 归属规则：
 *  - 任何人可创建 todo；默认 assignee = createdBy（自己给自己）。
 *  - 列表返回「我创建的 + 派给我的」。
 *  - 编辑（含勾选完成、改派）需是创建者、被派者，或 HR/ADMIN 及以上。
 *  - 删除需是创建者，或 HR/ADMIN 及以上。
 */
import { db } from './db.ts';
import { randomUUID } from 'node:crypto';
import { createNotification } from './notificationsDb.ts';

export type TodoType = 'contract' | 'probation' | 'manual';

export interface TodoRow {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: number; // 0 | 1
  type: string;
  targetId: string | null;
  createdBy: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoInput {
  title: string;
  description?: string;
  dueDate?: string;
  type?: TodoType;
  targetId?: string | null;
  createdBy: string;
  assignee?: string;
}

const ALLOWED_TYPES = new Set(['contract', 'probation', 'manual']);

/** 幂等建表，供迁移调用。 */
export function ensureTodosTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      description TEXT DEFAULT '',
      dueDate    TEXT DEFAULT '',
      completed  INTEGER DEFAULT 0,
      type       TEXT DEFAULT 'manual',
      targetId   TEXT,
      createdBy TEXT NOT NULL,
      assignee  TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_todos_createdBy ON todos(createdBy)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_todos_assignee ON todos(assignee)`);
}
// 与其它 *Db 模块一致：加载即建表。此前只有 migrate 会建，导致「没跑过迁移就 import」
// 的进程（精简启动、单个测试文件）里 createTodo / 清理语句直接抛 no such table: todos。
ensureTodosTable();

export function rowToTodo(row: TodoRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    completed: !!row.completed,
    type: (ALLOWED_TYPES.has(row.type) ? row.type : 'manual') as TodoType,
    targetId: row.targetId ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    assignee: row.assignee,
  };
}

export function getTodoRaw(id: string): TodoRow | undefined {
  return db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as unknown as TodoRow | undefined;
}

/** 列出与某用户相关的待办：自己创建的 + 派给自己的（最新在前）。 */
export function listTodos(username: string) {
  const rows = db
    .prepare(
      `SELECT * FROM todos
       WHERE createdBy = ? OR assignee = ?
       ORDER BY createdAt DESC, id DESC`
    )
    .all(username, username) as unknown as TodoRow[];
  return rows.map(rowToTodo);
}

/**
 * 创建待办。
 * - 系统类（非 manual）且同一创建者已存在同 type+targetId 未完成项时，直接返回已有项（去重，
 *   避免多设备/多会话重复生成合同到期/转正提醒）。
 * - 若指派给他人（assignee != createdBy），自动给被派单人生成一条通知。
 */
export function createTodo(input: TodoInput) {
  if (!input.title?.trim()) throw new Error('待办标题不能为空');
  if (!input.createdBy?.trim()) throw new Error('待办创建人不能为空');
  const assignee = input.assignee?.trim() || input.createdBy;
  const type = (ALLOWED_TYPES.has(input.type ?? '') ? input.type : 'manual') as TodoType;

  if (type !== 'manual' && input.targetId) {
    const existing = db
      .prepare(
        `SELECT * FROM todos WHERE createdBy = ? AND type = ? AND targetId = ? AND completed = 0 LIMIT 1`
      )
      .get(input.createdBy, type, input.targetId) as unknown as TodoRow | undefined;
    if (existing) return rowToTodo(existing);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO todos (id, title, description, dueDate, completed, type, targetId, createdBy, assignee, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    input.title.trim(),
    input.description ?? '',
    input.dueDate ?? '',
    type,
    input.targetId ?? null,
    input.createdBy,
    assignee
  );

  if (assignee !== input.createdBy) {
    createNotification({
      title: '新的待办指派',
      message: `${input.createdBy} 给你派了一条待办：${input.title.trim()}`,
      type: 'info',
      recipient: assignee,
    });
  }

  return rowToTodo(getTodoRaw(id)!);
}

/** 更新待办，返回更新后的对象；无权限或不存在返回 null。 */
export function updateTodo(
  id: string,
  patch: Partial<Pick<TodoInput, 'title' | 'description' | 'dueDate' | 'assignee'>> & {
    completed?: boolean;
  },
  username: string,
  isPrivileged: boolean
): ReturnType<typeof rowToTodo> | null {
  const row = getTodoRaw(id);
  if (!row) return null;
  if (!isPrivileged && row.createdBy !== username && row.assignee !== username) return null;

  const nextAssignee = patch.assignee?.trim() || row.assignee;
  const changedAssignee =
    patch.assignee !== undefined && nextAssignee !== row.assignee && nextAssignee !== row.createdBy;

  db.prepare(
    `UPDATE todos
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         dueDate = COALESCE(?, dueDate),
         completed = COALESCE(?, completed),
         assignee = COALESCE(?, assignee),
         updatedAt = datetime('now')
     WHERE id = ?`
  ).run(
    patch.title !== undefined ? patch.title : null,
    patch.description !== undefined ? patch.description : null,
    patch.dueDate !== undefined ? patch.dueDate : null,
    patch.completed !== undefined ? (patch.completed ? 1 : 0) : null,
    patch.assignee !== undefined ? nextAssignee : null,
    id
  );

  if (changedAssignee) {
    createNotification({
      title: '待办重新指派',
      message: `${username} 把待办「${row.title}」指派给了你`,
      type: 'info',
      recipient: nextAssignee,
    });
  }

  return rowToTodo(getTodoRaw(id)!);
}

/** 删除待办，返回是否命中；仅创建者或 HR/ADMIN 及以上可删。 */
export function deleteTodo(id: string, username: string, isPrivileged: boolean): boolean {
  const row = getTodoRaw(id);
  if (!row) return false;
  if (!isPrivileged && row.createdBy !== username) return false;
  const info = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  return info.changes > 0;
}
