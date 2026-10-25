/**
 * 账号认领申请（v15）。
 *
 * 这套系统里员工账号从来不是"注册"出来的，而是"认领"——提交申请、HR 当面核对花名册、
 * 批准后把 username 与 employeeId 绑在一起。原因写在 docs 与 Frame 锚点里：
 * 没有短信/邮箱/企微凭据可做校验介质，所以**审批动作本身就是校验**。
 *
 * 表只存"申请"与"谁批的"，不存口令。批准时由路由层生成一次性口令、只回显一次，
 * 并且强制首登改密（accounts.mustChangePassword）。
 */
import crypto from "node:crypto";
import { db } from "./db.ts";
import { formatLocalDateTime } from "./localDate.ts";

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface ClaimRow {
  id: string;
  desiredUsername: string;
  employeeId: string;
  displayName: string;
  phoneTail: string;
  note: string;
  status: ClaimStatus;
  rejectReason: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export function ensureClaimsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_claims (
      id               TEXT PRIMARY KEY,
      desiredUsername  TEXT NOT NULL,
      employeeId       TEXT NOT NULL,
      displayName      TEXT NOT NULL DEFAULT '',
      phoneTail        TEXT NOT NULL DEFAULT '',
      note             TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'pending',
      rejectReason     TEXT NOT NULL DEFAULT '',
      reviewedBy       TEXT,
      reviewedAt       TEXT,
      createdAt        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claims_status ON account_claims(status, createdAt DESC);
    -- 同一条档案只允许一条待核对申请：否则同一个人会被重复开号或者反复骚扰队列。
    CREATE UNIQUE INDEX IF NOT EXISTS uq_claims_pending_employee
      ON account_claims(employeeId) WHERE status = 'pending';
  `);
}

const toRow = (r: Record<string, unknown>): ClaimRow => ({
  id: String(r.id),
  desiredUsername: String(r.desiredUsername),
  employeeId: String(r.employeeId),
  displayName: String(r.displayName ?? ""),
  phoneTail: String(r.phoneTail ?? ""),
  note: String(r.note ?? ""),
  status: String(r.status) as ClaimStatus,
  rejectReason: String(r.rejectReason ?? ""),
  reviewedBy: r.reviewedBy == null ? null : String(r.reviewedBy),
  reviewedAt: r.reviewedAt == null ? null : String(r.reviewedAt),
  createdAt: String(r.createdAt),
});

export class ClaimError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CreateClaimInput {
  desiredUsername: string;
  employeeId: string;
  displayName: string;
  phoneTail: string;
  note?: string;
}

export function createClaim(input: CreateClaimInput): ClaimRow {
  const employee = db
    .prepare("SELECT id, name, phone FROM employees WHERE id = ?")
    .get(input.employeeId) as { id: string; name: string; phone: string | null } | undefined;
  if (!employee) throw new ClaimError(404, "花名册里没有这个工号，请核对后重填");

  const bound = db
    .prepare("SELECT username FROM accounts WHERE employeeId = ? LIMIT 1")
    .get(input.employeeId) as { username: string } | undefined;
  if (bound) throw new ClaimError(409, "这条档案已经开通过账号了；忘记口令请让管理员重置");

  const pending = db
    .prepare("SELECT id FROM account_claims WHERE employeeId = ? AND status = 'pending'")
    .get(input.employeeId);
  if (pending) throw new ClaimError(409, "这条档案已经有一条申请在等核对，不用重复提交");

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO account_claims
       (id, desiredUsername, employeeId, displayName, phoneTail, note, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    id,
    input.desiredUsername,
    input.employeeId,
    input.displayName || employee.name,
    input.phoneTail,
    input.note ?? "",
    formatLocalDateTime()
  );
  return getClaim(id)!;
}

export function getClaim(id: string): ClaimRow | null {
  const row = db.prepare("SELECT * FROM account_claims WHERE id = ?").get(id);
  return row ? toRow(row as Record<string, unknown>) : null;
}

export function listClaims(status?: ClaimStatus): ClaimRow[] {
  const rows = status
    ? db.prepare("SELECT * FROM account_claims WHERE status = ? ORDER BY createdAt DESC").all(status)
    : db.prepare("SELECT * FROM account_claims ORDER BY createdAt DESC").all();
  return rows.map((r) => toRow(r as Record<string, unknown>));
}

/**
 * 申请人自助查询：工号 + 手机尾号取**最近一条**申请。
 *
 * 查不到一律返回 null（不区分"工号不存在"与"尾号不对"），路由层对两者给同一句
 * 提示，避免这个免登录接口变成员工/申请枚举器。
 */
export function findLatestClaimForApplicant(employeeId: string, phoneTail: string): ClaimRow | null {
  const row = db
    .prepare(
      `SELECT * FROM account_claims
        WHERE employeeId = ? AND phoneTail = ?
        ORDER BY createdAt DESC LIMIT 1`
    )
    .get(employeeId, phoneTail);
  return row ? toRow(row as Record<string, unknown>) : null;
}

/**
 * 批准/驳回。只改状态，不建账号——建账号要用 authDb，放在路由层，
 * 避免 claimsDb 与 authDb 互相 import 形成环。
 * 返回 conflict=true 表示这条申请已经被处理过（并发下防双批）。
 */
export function decideClaim(
  id: string,
  decision: "approved" | "rejected",
  reviewer: string,
  reason = ""
): { claim: ClaimRow; conflict: boolean } {
  const row = getClaim(id);
  if (!row) throw new ClaimError(404, "申请不存在");
  if (row.status !== "pending") return { claim: row, conflict: true };
  if (decision === "rejected" && !reason.trim()) throw new ClaimError(400, "驳回必须写原因");

  const info = db
    .prepare(
      `UPDATE account_claims
          SET status = ?, rejectReason = ?, reviewedBy = ?, reviewedAt = ?
        WHERE id = ? AND status = 'pending'`
    )
    .run(decision, decision === "rejected" ? reason.trim() : "", reviewer, formatLocalDateTime(), id);
  if (info.changes === 0) return { claim: getClaim(id)!, conflict: true };
  return { claim: getClaim(id)!, conflict: false };
}

/** 档案侧对照信息：HR 核对时一眼看到"他自称的那条档案在公司记录里长什么样" */
export function getClaimEmployee(id: string): {
  id: string;
  name: string;
  department: string;
  joinDate: string;
  phoneTail: string;
} | null {
  const row = db
    .prepare(
      `SELECT e.id, e.name, e.department, e.joinDate, e.phone
         FROM account_claims c JOIN employees e ON e.id = c.employeeId
        WHERE c.id = ?`
    )
    .get(id) as { id: string; name: string; department: string; joinDate: string; phone: string | null } | undefined;
  if (!row) return null;
  const phone = String(row.phone ?? "").replace(/\s+/g, "");
  return {
    id: row.id,
    name: row.name,
    department: row.department ?? "",
    joinDate: row.joinDate ?? "",
    phoneTail: phone.slice(-4),
  };
}
