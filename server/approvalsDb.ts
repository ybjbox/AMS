/**
 * 审批数据层（R1 审批流 v1：请假申请闭环）。
 *
 * 归属与权限：
 *  - 任何登录用户可提交申请（R2 员工自助的最小形态）；
 *  - HR 及以上可审批（路由层 requireRole 纵深防御）；
 *  - 决定即落库，并通过通知中心告知申请人（复用 notificationsDb 的幂等去重）。
 *
 * 演进方向（ROADMAP R1 完整版）：多级审批链、审批模板、抄送、撤回。
 */
import { db } from "./db.ts";
import { randomUUID } from "node:crypto";
import { createNotification } from "./notificationsDb.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRow {
  id: string;
  applicant: string;
  type: string;
  leaveType: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  status: string;
  approver: string | null;
  comment: string;
  createdAt: string;
  decidedAt: string | null;
}

/** 幂等建表，供模块加载时调用。 */
export function ensureApprovalsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id         TEXT PRIMARY KEY,
      applicant  TEXT NOT NULL,
      type       TEXT DEFAULT 'leave',
      leaveType  TEXT DEFAULT '事假',
      startDate  TEXT NOT NULL,
      endDate    TEXT,
      reason     TEXT DEFAULT '',
      status     TEXT DEFAULT 'pending',
      approver   TEXT,
      comment    TEXT DEFAULT '',
      createdAt  TEXT DEFAULT (datetime('now', 'localtime')),
      decidedAt  TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_approvals_applicant ON approvals(applicant)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`);
}
ensureApprovalsTable();

function rowToApproval(row: any): ApprovalRow {
  return {
    id: row.id,
    applicant: row.applicant,
    type: row.type,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    reason: row.reason,
    status: row.status,
    approver: row.approver ?? null,
    comment: row.comment ?? "",
    createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? null,
  };
}

export function getApproval(id: string): ApprovalRow | undefined {
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return row ? rowToApproval(row) : undefined;
}

export function createApproval(input: {
  applicant: string;
  type?: string;
  leaveType?: string;
  startDate: string;
  endDate?: string | null;
  reason: string;
}): ApprovalRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO approvals (id, applicant, type, leaveType, startDate, endDate, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.applicant,
    input.type ?? "leave",
    input.leaveType ?? "事假",
    input.startDate,
    input.endDate ?? null,
    input.reason
  );
  return getApproval(id)!;
}

/** 我的申请（按提交时间倒序） */
export function listMine(username: string): ApprovalRow[] {
  return (
    db
      .prepare("SELECT * FROM approvals WHERE applicant = ? ORDER BY createdAt DESC, id DESC")
      .all(username) as any[]
  ).map(rowToApproval);
}

/** 待审批列表（HR+ 使用；路由层 requireRole 收紧） */
export function listPending(): ApprovalRow[] {
  return (
    db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY createdAt DESC").all() as any[]
  ).map(rowToApproval);
}

export interface DecideResult {
  row?: ApprovalRow;
  notFound?: boolean;
  conflict?: boolean;
}

/** 审批决定：仅 pending 可决定（并发下用 status='pending' 条件防双审） */
export function decideApproval(
  id: string,
  decision: Exclude<ApprovalStatus, "pending">,
  approver: string,
  comment = ""
): DecideResult {
  const row = getApproval(id);
  if (!row) return { notFound: true };

  const info = db
    .prepare(
      `UPDATE approvals
       SET status = ?, approver = ?, comment = ?, decidedAt = datetime('now', 'localtime')
       WHERE id = ? AND status = 'pending'`
    )
    .run(decision, approver, comment, id);
  if (Number(info.changes ?? 0) === 0) return { conflict: true, row };

  const updated = getApproval(id)!;

  // 通知申请人（ recipients=申请人；同内容未读去重由 notificationsDb 负责）
  createNotification({
    title: `你的${updated.leaveType}申请已${decision === "approved" ? "通过" : "被驳回"}`,
    message: `${updated.startDate} 提交的申请，审批人：${approver}${comment ? `，意见：${comment}` : ""}`,
    type: decision === "approved" ? "success" : "warning",
    recipient: updated.applicant,
  });

  return { row: updated };
}
