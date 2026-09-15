/**
 * 组织架构数据层 — departments（树形，parentId 关联）+ roles 两张表。
 * 前端语义是整树替换（setDepartments / setRoles），因此写入时扁平化落库，读取时重建树。
 */
import { db } from "./db.ts";

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    parentId TEXT
  );
  CREATE TABLE IF NOT EXISTS roles (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    departmentId TEXT NOT NULL,
    priority     INTEGER DEFAULT 0
  );
`);

type DeptNode = { id: string; name: string; priority?: number; children?: DeptNode[] };

// ---------- Departments（树 <-> 扁平） ----------
export function listDepartmentsTree(): DeptNode[] {
  // rows 已按 priority DESC 排序，children 挂载顺序即展示顺序
  const rows: any[] = db.prepare("SELECT * FROM departments ORDER BY priority DESC, rowid").all();
  const byId = new Map<string, DeptNode>();
  for (const r of rows) {
    byId.set(r.id, { id: r.id, name: r.name, priority: r.priority });
  }
  const roots: DeptNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) {
      const parent = byId.get(r.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * 整树替换部门。
 *
 * 注意：departments.parentId 现在是自引用外键（ON DELETE CASCADE），
 * employees.departmentId / roles.departmentId 也指向 departments（SET NULL）。
 * 因此这里不能用「DELETE FROM departments 再全量 INSERT」——那会把所有员工的
 * departmentId 级联置空。改为差量更新：
 *   1. 先把传入的整棵树 upsert 进去（新增/改名/改父级一次性搞定）；
 *   2. 再删除「数据库里有、但新树里没有」的部门（被真正删除的部门）；
 *   3. 清理「部门名在树中已不存在」的陈旧部门名（避免显示幽灵部门）；
 *   4. 按名称回填：把「有合法部门名但还没挂上 departmentId」的员工接上外键。
 *      这一步专门覆盖首次种子的时序问题（db.ts 先于本模块加载，播种员工时
 *      departments 表还不存在，departmentId 必然为空），也兼容旧数据迁移后的补挂。
 * 第 2 步会触发外键：被删部门的员工 departmentId 置空，随后第 3 步把那些
 * 已无有效部门引用的员工的陈旧部门名清空。
 *
 * 【修复记录 2026-09-15】此前第 3 步的条件是「departmentId IS NULL 且 department
 * 非空即清空」，会把「部门名合法、只是尚未回填外键」的员工一并误清（首次启动全部
 * 45 名员工的部门信息就是这样被清掉的）。现改为按名称存在性判断——只有名称确实
 * 不在当前部门树里的才清空，并在其后补一次回填。
 */
export function replaceDepartmentsTree(tree: DeptNode[]): DeptNode[] {
  const incoming = flattenTree(tree);
  const existingIds = new Set(
    (db.prepare("SELECT id FROM departments").all() as { id: string }[]).map((r) => r.id)
  );
  const incomingIds = new Set(incoming.map((d) => d.id));
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));

  // 1) upsert 传入的整树 + 2) 删除被移除部门 + 3) 清理陈旧部门名 —— 包在事务里，
  //    避免中途失败留下「树改了一半」的悬空状态
  const upsert = db.prepare(
    `INSERT INTO departments (id, name, priority, parentId) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, priority = excluded.priority, parentId = excluded.parentId`
  );
  db.exec("BEGIN");
  try {
    for (const d of incoming) {
      upsert.run(d.id, d.name, d.priority ?? 0, d.parentId ?? null);
    }

    // 删除真正被移除的部门（外键会把相关员工/职位的引用置空）
    if (toDelete.length > 0) {
      const ph = toDelete.map(() => "?").join(", ");
      db.prepare(`DELETE FROM departments WHERE id IN (${ph})`).run(...toDelete);
    }

    // 3) 清理「部门名在树中已不存在」的陈旧部门名（FK 已把被删部门的departmentId置空）
    db.prepare(
      `UPDATE employees SET department = ''
        WHERE departmentId IS NULL AND department != ''
          AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = employees.department)`
    ).run();

    // 4) 按名称回填：有合法部门名但缺 departmentId 的员工补挂外键
    //    （首次种子时 db.ts 先于本模块加载，播种的员工没有 departmentId；
    //     这里在部门树就绪后统一补挂，保证部门列可读且外键完整）
    db.prepare(
      `UPDATE employees
          SET departmentId = (SELECT d.id FROM departments d WHERE d.name = employees.department)
        WHERE (departmentId IS NULL OR departmentId = '')
          AND department != ''
          AND EXISTS (SELECT 1 FROM departments d WHERE d.name = employees.department)`
    ).run();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return listDepartmentsTree();
}

function flattenTree(
  nodes: DeptNode[],
  parentId: string | null = null
): { id: string; name: string; priority: number; parentId: string | null }[] {
  const out: { id: string; name: string; priority: number; parentId: string | null }[] = [];
  for (const n of nodes || []) {
    out.push({ id: n.id, name: n.name, priority: n.priority ?? 0, parentId });
    if (n.children?.length) out.push(...flattenTree(n.children, n.id));
  }
  return out;
}

// ---------- Roles ----------
export function listRoles() {
  return db.prepare("SELECT * FROM roles ORDER BY priority DESC, rowid").all();
}

export function replaceRoles(roles: any[]) {
  const insert = db.prepare("INSERT INTO roles (id, name, departmentId, priority) VALUES (?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM roles");
    for (const r of roles || []) {
      insert.run(r.id, r.name, r.departmentId, r.priority ?? 0);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return listRoles();
}

// ---------- 首次播种（与原静态种子一致） ----------
(function seedIfEmpty() {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM departments").get() as any).c;
  if (count > 0) return;

  replaceDepartmentsTree([
    {
      id: "1", name: "集团总部", priority: 100,
      children: [
        { id: "2", name: "总经办", priority: 90 },
        { id: "3", name: "财务中心", priority: 80 },
        { id: "4", name: "人力资源中心", priority: 70 },
        { id: "5", name: "法务部", priority: 60 },
        { id: "6", name: "行政部", priority: 50 },
      ],
    },
    {
      id: "7", name: "北京分公司", priority: 90,
      children: [
        { id: "8", name: "研发部", priority: 90 },
        { id: "9", name: "产品部", priority: 80 },
        { id: "10", name: "设计部", priority: 70 },
        { id: "11", name: "市场部", priority: 60 },
      ],
    },
    {
      id: "12", name: "上海分公司", priority: 80,
      children: [
        { id: "13", name: "销售部", priority: 90 },
        { id: "14", name: "客户成功部", priority: 80 },
        { id: "15", name: "运营部", priority: 70 },
      ],
    },
  ]);

  replaceRoles([
    { id: "1", name: "前端工程师", departmentId: "8", priority: 10 },
    { id: "2", name: "后端工程师", departmentId: "8", priority: 20 },
    { id: "3", name: "产品经理", departmentId: "9", priority: 10 },
    { id: "4", name: "UI设计师", departmentId: "10", priority: 10 },
    { id: "5", name: "HR", departmentId: "4", priority: 10 },
    { id: "6", name: "财务经理", departmentId: "3", priority: 10 },
    { id: "7", name: "销售总监", departmentId: "13", priority: 10 },
  ]);
  console.log("[db] Seeded departments & roles into SQLite");
})();

// ---------- 启动时数据自修复（幂等，只补不删） ----------
// 覆盖场景：departments 表已有数据，但员工因历史时序问题（播种早于部门表建立）
// 未挂上 departmentId（部门名尚在）。每次启动执行一次；只做「补齐外键」，绝不删除数据。
(function backfillEmployeeDepartmentIds() {
  try {
    const res = db
      .prepare(
        `UPDATE employees
            SET departmentId = (SELECT d.id FROM departments d WHERE d.name = employees.department)
          WHERE (departmentId IS NULL OR departmentId = '')
            AND department != ''
            AND EXISTS (SELECT 1 FROM departments d WHERE d.name = employees.department)`
      )
      .run();
    if (res.changes > 0) {
      console.log(`[db] 启动自修复：已回填 ${res.changes} 名员工的部门外键`);
    }
  } catch (e) {
    // 自修复失败不应阻断启动（例如表结构尚处迁移中间态）
    console.error("[db] 部门外键回填失败（不影响启动）：", e);
  }
})();
