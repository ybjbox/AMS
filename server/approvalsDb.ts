/**
 * 审批数据层（R1 审批流 v1：请假 + 补卡申请闭环）。
 *
 * 归属与权限：
 *  - 任何登录用户可提交申请（R2 员工自助的最小形态）；
 *  - HR 及以上可审批（路由层 requireRole 纵深防御）；
 *  - 决定即落库，并通过通知中心告知申请人（复用 notificationsDb 的幂等去重）。
 *
 * 领域动作（审批通过后自动执行，P0 闭环）：
 *  - 补卡（type='makeup'）：通过后自动补写打卡记录并刷新异常分析，
 *    打通「异常发现 → 补卡申请 → 审批 → 异常消除」链路。
 *
 * 演进方向（ROADMAP R1 完整版）：多级审批链、审批模板、抄送、撤回。
 */
import { db } from "./db.ts";
import { type DbRow, asString, asNullableString } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";
import { createNotification } from "./notificationsDb.ts";
import { upsertRecord, analyzeAnomalies } from "./attendanceDb.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRow {
  id: string;
  applicant: string;
  /** 'leave' 请假 | 'makeup' 补卡 */
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
  /** 补卡字段（type='makeup' 时有效）：补卡日期 / 时间 / 卡类型 */
  punchDate: string;
  punchTime: string;
  punchKind: string;
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

  // 兼容老库：补补卡字段（SQLite 不支持 ADD COLUMN IF NOT EXISTS，故先探列）
  const cols = db
    .prepare("PRAGMA table_info(approvals)")
    .all()
    .map((r) => asString(r.name));
  if (!cols.includes("punchDate")) {
    db.exec("ALTER TABLE approvals ADD COLUMN punchDate TEXT DEFAULT ''");
  }
  if (!cols.includes("punchTime")) {
    db.exec("ALTER TABLE approvals ADD COLUMN punchTime TEXT DEFAULT ''");
  }
  if (!cols.includes("punchKind")) {
    db.exec("ALTER TABLE approvals ADD COLUMN punchKind TEXT DEFAULT ''");
  }
}
ensureApprovalsTable();

function rowToApproval(row: DbRow): ApprovalRow {
  return {
    id: asString(row.id),
    applicant: asString(row.applicant),
    type: asString(row.type),
    leaveType: asString(row.leaveType),
    startDate: asString(row.startDate),
    endDate: asNullableString(row.endDate),
    reason: asString(row.reason),
    status: asString(row.status),
    approver: asNullableString(row.approver),
    comment: asString(row.comment),
    createdAt: asString(row.createdAt),
    decidedAt: asNullableString(row.decidedAt),
    punchDate: asString(row.punchDate),
    punchTime: asString(row.punchTime),
    punchKind: asString(row.punchKind),
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
  punchDate?: string;
  punchTime?: string;
  punchKind?: string;
}): ApprovalRow {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO approvals (id, applicant, type, leaveType, startDate, endDate, reason, punchDate, punchTime, punchKind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.applicant,
    input.type ?? "leave",
    input.leaveType ?? "事假",
    input.startDate,
    input.endDate ?? null,
    input.reason,
    input.punchDate ?? "",
    input.punchTime ?? "",
    input.punchKind ?? ""
  );
  return getApproval(id)!;
}

/** 我的申请（按提交时间倒序） */
export function listMine(username: string): ApprovalRow[] {
  return db
    .prepare("SELECT * FROM approvals WHERE applicant = ? ORDER BY createdAt DESC, id DESC")
    .all(username)
    .map(rowToApproval);
}

/** 待审批列表（HR+ 使用；路由层 requireRole 收紧） */
export function listPending(): ApprovalRow[] {
  return db
    .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY createdAt DESC")
    .all()
    .map(rowToApproval);
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

  // 领域动作：审批通过后自动执行（闭环）
  if (decision === "approved") {
    try {
      if (updated.type === "makeup") {
        applyMakeupPunch(updated);
      } else if (updated.type === "conversion") {
        applyConversion(updated);
      } else if (updated.type === "resign") {
        applyResign(updated);
      }
    } catch (e) {
      // 领域动作失败不回滚审批（审批决定本身有效），但必须留下告警
      console.warn(`[approvals] 领域动作失败（${updated.type}）：`, e);
    }
  }

  // 通知申请人（ recipients=申请人；同内容未读去重由 notificationsDb 负责）
  const typeLabel: Record<string, string> = {
    makeup: "补卡",
    conversion: "转正",
    resign: "离职",
  };
  const subject =
    updated.type === "makeup"
      ? `你的${updated.punchKind || "补卡"}申请`
      : `你的${typeLabel[updated.type] ?? updated.leaveType}申请`;
  const detail =
    updated.type === "makeup"
      ? `${updated.punchDate} ${updated.punchTime} 的补卡`
      : updated.type === "resign"
        ? `最后工作日 ${updated.startDate}`
        : `${updated.startDate} 提交的申请`;
  createNotification({
    title: `${subject}已${decision === "approved" ? "通过" : "被驳回"}`,
    message: `${detail}，审批人：${approver}${comment ? `，意见：${comment}` : ""}`,
    type: decision === "approved" ? "success" : "warning",
    recipient: updated.applicant,
  });

  return { row: updated };
}

/** 申请人账号 → 员工档案映射（accounts.employeeId 关联） */
function findApplicantEmployee(applicant: string): { employeeId: string; employeeName: string } | null {
  const accountRow = db
    .prepare("SELECT employeeId FROM accounts WHERE username = ?")
    .get(applicant);
  const employeeId = asString(accountRow?.employeeId);
  if (!employeeId) return null;
  const emp = db.prepare("SELECT id, name FROM employees WHERE id = ?").get(employeeId);
  if (!emp) return null;
  return { employeeId: asString(emp.id), employeeName: asString(emp.name) };
}

/**
 * 转正领域动作：通过后员工状态「试用期」→「在职」。
 * 提交时已校验试用期状态；此处做二次确认防并发变更。
 */
function applyConversion(approval: ApprovalRow): void {
  const emp = findApplicantEmployee(approval.applicant);
  if (!emp) {
    createNotification({
      title: "转正未自动生效",
      message: "你的账号未关联员工档案，请联系管理员在「账号管理」中完成关联。",
      type: "warning",
      recipient: approval.applicant,
    });
    console.warn(`[approvals] 转正跳过：账号 ${approval.applicant} 未关联员工档案（approval=${approval.id}）`);
    return;
  }
  const row = db.prepare("SELECT status FROM employees WHERE id = ?").get(emp.employeeId);
  const status = asString(row?.status);
  if (status !== "试用期") {
    createNotification({
      title: "转正未变更（状态已变化）",
      message: `员工的当前状态为「${status || "未知"}」，非试用期，无需变更。`,
      type: "info",
      recipient: approval.applicant,
    });
    return;
  }
  db.prepare("UPDATE employees SET status = '在职', updatedAt = ? WHERE id = ?").run(
    new Date().toISOString(),
    emp.employeeId
  );
}

/**
 * 离职领域动作：通过后员工状态置「离职」，账号停用并吊销全部会话。
 * 说明：最后工作日为信息性字段（流程审批时已确认），停用动作立即执行——
 * 避免"已批准离职但账号仍可登录"的权限悬空。
 */
function applyResign(approval: ApprovalRow): void {
  const now = new Date().toISOString();

  const emp = findApplicantEmployee(approval.applicant);
  if (emp) {
    db.prepare("UPDATE employees SET status = '离职', updatedAt = ? WHERE id = ?").run(now, emp.employeeId);
  }

  // 账号面动作：停用 + 吊销会话（无论是否关联员工档案都执行）
  db.prepare("UPDATE accounts SET enabled = 0, updatedAt = ? WHERE username = ?").run(now, approval.applicant);
  db.prepare("DELETE FROM sessions WHERE username = ?").run(approval.applicant);

  createNotification({
    title: "离职流程已完成",
    message: `最后工作日：${approval.startDate || "未填写"}。账号已停用，如需办理交接请联系行政。`,
    type: "info",
    recipient: approval.applicant,
  });
}

/**
 * 补卡领域动作：把审批通过的补卡落为真实打卡记录，并重算异常。
 * 申请人 → 员工映射：账号关联 employeeId 时精确匹配；否则以用户名兜底（保持流转不断）。
 */
function applyMakeupPunch(approval: ApprovalRow): void {
  if (!approval.punchDate || !approval.punchTime) return;

  const accountRow = db
    .prepare("SELECT employeeId, displayName FROM accounts WHERE username = ?")
    .get(approval.applicant);
  const employeeId = asString(accountRow?.employeeId);

  // 补卡必须落到真实员工档案（punch_records.employeeId 有外键约束）。
  // 账号未关联员工时：不写入（避免脏数据），向申请人说明原因。
  let employeeName = "";
  if (employeeId) {
    const emp = db.prepare("SELECT id, name FROM employees WHERE id = ?").get(employeeId);
    if (emp) employeeName = asString(emp.name);
  }

  if (!employeeId || !employeeName) {
    createNotification({
      title: "补卡未能自动写入打卡记录",
      message: `你的账号未关联员工档案（补卡日期 ${approval.punchDate}），请联系管理员在「账号管理」中完成关联后重新申请。`,
      type: "warning",
      recipient: approval.applicant,
    });
    console.warn(
      `[approvals] 补卡跳过：账号 ${approval.applicant} 未关联员工档案（approval=${approval.id}）`
    );
    return;
  }

  upsertRecord({
    employeeId,
    employeeName,
    date: approval.punchDate,
    time: approval.punchTime,
  });

  // 刷新异常分析：新增打卡后，相应缺卡异常自动消除
  analyzeAnomalies();
}
