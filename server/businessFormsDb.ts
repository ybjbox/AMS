/**
 * 业务单留痕数据层：生成的业务单按 employeeId 归档，供员工档案页回看。
 *
 * 设计对齐 contract_renewals（同样挂在单个员工名下、模块加载时建表、无外键约束、
 * 删除员工时显式清理）。单据版面与正文由前端模板生成，这里只存事实字段，
 * 不做二次加工；employeeName 一律由路由从员工表回填，不接受前端传入（防止伪造归属）。
 */
import { db } from "./db.ts";
import { formatLocalDateTime } from "./localDate.ts";
import { type DbRow, asString, asNumber } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";

export interface BusinessFormRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  /** condolence | wedding | custom */
  kind: string;
  /** 单据名称，如「亲属逝世慰问金」（存快照，模板改名后历史仍可读） */
  kindLabel: string;
  department: string;
  relation: string;
  /** 单据日期 YYYY-MM-DD */
  date: string;
  amount: number;
  body: string;
  /** 归档操作人 username */
  operator: string;
  /** 归档时间 ISO */
  createdAt: string;
}

export interface BusinessFormInput {
  employeeId: string;
  employeeName: string;
  kind: string;
  kindLabel: string;
  department?: string;
  relation?: string;
  date: string;
  amount?: number;
  body: string;
}

function ensureBusinessFormsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_forms (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      employeeName TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      kindLabel TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      relation TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      body TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT ''
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_business_forms_employee ON business_forms(employeeId)`);
}
ensureBusinessFormsTable();

function rowToRecord(row: DbRow): BusinessFormRecord {
  return {
    id: asString(row.id),
    employeeId: asString(row.employeeId),
    employeeName: asString(row.employeeName),
    kind: asString(row.kind),
    kindLabel: asString(row.kindLabel),
    department: asString(row.department),
    relation: asString(row.relation),
    date: asString(row.date),
    amount: asNumber(row.amount) || 0,
    body: asString(row.body),
    operator: asString(row.operator),
    createdAt: asString(row.createdAt),
  };
}

/** 某员工名下的业务单（新→旧） */
export function listBusinessForms(employeeId: string): BusinessFormRecord[] {
  return db
    .prepare(
      "SELECT * FROM business_forms WHERE employeeId = ? ORDER BY createdAt DESC, rowid DESC"
    )
    .all(employeeId)
    .map(rowToRecord);
}

export function createBusinessForm(
  input: BusinessFormInput,
  operator: string
): BusinessFormRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO business_forms
       (id, employeeId, employeeName, kind, kindLabel, department, relation, date, amount, body, operator, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.employeeId,
    input.employeeName,
    input.kind,
    input.kindLabel ?? "",
    input.department ?? "",
    input.relation ?? "",
    input.date,
    Number(input.amount) || 0,
    input.body,
    operator,
    formatLocalDateTime()
  );
  const row = db.prepare("SELECT * FROM business_forms WHERE id = ?").get(id);
  if (!row) throw new Error(`createBusinessForm: 写入后未找到业务单记录 ${id}`);
  return rowToRecord(row);
}
