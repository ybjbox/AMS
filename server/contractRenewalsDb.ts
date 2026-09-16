/**
 * 合同续签数据层（P1：合同续签流程）。
 *
 * 设计：
 * - 续签历史单独建表（contract_renewals），保留每次续签的前后期限对比与操作人
 * - 续签动作原子性：更新员工合同字段 + 写入历史，包在事务里
 * - 权限：写操作走默认写策略（HR+）；历史读取默认读策略（EMPLOYEE+）
 */
import { db } from "./db.ts";
import { type DbRow, asString, asNumber } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";

export interface ContractRenewalRow {
  id: string;
  employeeId: string;
  employeeName: string;
  /** 续签后的合同年限 */
  contractYears: number;
  /** 续签后的签订日期 */
  contractSignDate: string;
  /** 续签后的到期日期 */
  contractExpiry: string;
  /** 续签前的到期日期（对比留痕） */
  prevExpiry: string;
  renewedBy: string;
  createdAt: string;
}

function ensureRenewalsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_renewals (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      employeeName TEXT NOT NULL DEFAULT '',
      contractYears INTEGER NOT NULL DEFAULT 1,
      contractSignDate TEXT NOT NULL DEFAULT '',
      contractExpiry TEXT NOT NULL DEFAULT '',
      prevExpiry TEXT NOT NULL DEFAULT '',
      renewedBy TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT ''
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_renewals_employee ON contract_renewals(employeeId)`);
}
ensureRenewalsTable();

function rowToRenewal(row: DbRow): ContractRenewalRow {
  return {
    id: asString(row.id),
    employeeId: asString(row.employeeId),
    employeeName: asString(row.employeeName),
    contractYears: asNumber(row.contractYears) || 1,
    contractSignDate: asString(row.contractSignDate),
    contractExpiry: asString(row.contractExpiry),
    prevExpiry: asString(row.prevExpiry),
    renewedBy: asString(row.renewedBy),
    createdAt: asString(row.createdAt),
  };
}

/** 员工续签历史（新→旧） */
export function listRenewals(employeeId: string): ContractRenewalRow[] {
  return db
    .prepare("SELECT * FROM contract_renewals WHERE employeeId = ? ORDER BY createdAt DESC, rowid DESC")
    .all(employeeId)
    .map(rowToRenewal);
}

/**
 * 执行续签：更新员工合同字段 + 追加历史（事务）。
 * 返回更新后的历史记录行；员工不存在时返回 null（由路由先行校验）。
 */
export function renewContract(
  employee: { id: string; name: string; contractExpiry?: string },
  input: { contractYears: number; contractSignDate: string; contractExpiry: string },
  renewedBy: string
): ContractRenewalRow {
  const id = randomUUID();
  const now = new Date().toISOString();
  const daysToExpiry = Math.ceil(
    (new Date(input.contractExpiry).getTime() - Date.now()) / 86400000
  );

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE employees
          SET contractYears = ?, contractSignDate = ?, contractExpiry = ?, daysToExpiry = ?, updatedAt = ?
        WHERE id = ?`
    ).run(
      input.contractYears,
      input.contractSignDate,
      input.contractExpiry,
      Number.isFinite(daysToExpiry) ? daysToExpiry : 0,
      now,
      employee.id
    );
    db.prepare(
      `INSERT INTO contract_renewals (id, employeeId, employeeName, contractYears, contractSignDate, contractExpiry, prevExpiry, renewedBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      employee.id,
      employee.name,
      input.contractYears,
      input.contractSignDate,
      input.contractExpiry,
      employee.contractExpiry ?? "",
      renewedBy,
      now
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  const row = db.prepare("SELECT * FROM contract_renewals WHERE id = ?").get(id);
  if (!row) throw new Error(`renewContract: 写入后未找到续签记录 ${id}`);
  return rowToRenewal(row);
}
