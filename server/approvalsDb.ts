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
 * P2 增强：
 *  - 多级审批：leave ≥3 天 requiredRole 升 ADMIN（HR 决定被拦截，提示须 ADMIN 终审）；
 *  - 加班（type='overtime'）：通过后按小时累计进 overtime_ledger（调休额度来源）；
 *  - 调休（leave 且 leaveType='调休'）：通过时从 overtime_ledger 扣减（天数×8h），
 *    决定与全部领域动作在同一事务内原子提交，失败整体回滚。
 */
import { db, transact } from "./db.ts";
import { type DbRow, asString, asNullableString, asNumber } from "./sqliteUtil.ts";
import { randomUUID } from "node:crypto";
import { createNotification } from "./notificationsDb.ts";
import { upsertRecord, analyzeAnomalies } from "./attendanceDb.ts";
import { ROLE_LEVEL, type SystemRole } from "./authDb.ts";
import { APPROVAL_TYPES, approvalKindOf, leaveDaysBetween, type ApprovalKind } from "./approvalTypes.ts";
import { formatLocalDateTime } from "./localDate.ts";

/** 天数口径的唯一实现住在 approvalTypes，这里再导出给既有调用方（路由校验、测试） */
export { leaveDaysBetween };

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
  /** 多级审批：决定该申请需要的最低角色（leave ≥3 天自动升 ADMIN） */
  requiredRole: SystemRole;
  /** 加班时长（小时，type='overtime' 时有效） */
  hours: number;
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
  // P2：多级审批门槛 + 加班时长
  if (!cols.includes("requiredRole")) {
    db.exec("ALTER TABLE approvals ADD COLUMN requiredRole TEXT DEFAULT 'HR'");
  }
  if (!cols.includes("hours")) {
    db.exec("ALTER TABLE approvals ADD COLUMN hours REAL DEFAULT 0");
  }

  // P2：加班调休台账（审批通过的小时数按员工累计）
  db.exec(`
    CREATE TABLE IF NOT EXISTS overtime_ledger (
      employeeId TEXT PRIMARY KEY,
      employeeName TEXT DEFAULT '',
      hours REAL DEFAULT 0,
      updatedAt TEXT
    )
  `);
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
    requiredRole: (asString(row.requiredRole) || "HR") as SystemRole,
    hours: asNumber(row.hours),
  };
}

export function getApproval(id: string): ApprovalRow | undefined {
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return row ? rowToApproval(row) : undefined;
}

/** 请假天数（含首尾两天）的口径见 approvalTypes.leaveDaysBetween —— 校验、门槛、额度扣减共用一份 */

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
  hours?: number;
}): ApprovalRow {
  const id = randomUUID();
  const requiredRole = APPROVAL_TYPES[approvalKindOf(input.type)].requiredRole(input);
  db.prepare(
    `INSERT INTO approvals (id, applicant, type, leaveType, startDate, endDate, reason, punchDate, punchTime, punchKind, hours, requiredRole)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    input.punchKind ?? "",
    input.hours ?? 0,
    requiredRole
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
  /** P2：自审拦截 / 多级审批门槛拦截 */
  forbidden?: boolean;
  reason?: string;
}

/** 审批决定：仅 pending 可决定（并发下用 status='pending' 条件防双审） */
export function decideApproval(
  id: string,
  decision: Exclude<ApprovalStatus, "pending">,
  approver: string,
  comment = "",
  approverRole?: SystemRole
): DecideResult {
  const row = getApproval(id);
  if (!row) return { notFound: true };

  // P2 多级审批：申请人不能自审；低于门槛角色的决定被拦截（HR 提交的长假须 ADMIN 终审）
  if (row.status === "pending") {
    if (row.applicant === approver) return { forbidden: true, row, reason: "不能审批自己的申请" };
    const level = ROLE_LEVEL[approverRole ?? "HR"] ?? ROLE_LEVEL.HR;
    if (level < (ROLE_LEVEL[row.requiredRole] ?? ROLE_LEVEL.HR)) {
      return {
        forbidden: true,
        row,
        reason: `该申请需要 ${row.requiredRole} 及以上角色终审`,
      };
    }
  }

  // 决定 + 领域动作 + 通知在同一事务内原子提交：
  // 任何一步失败整体回滚（路由层得到 500，审批人重试即可），
  // 杜绝旧实现「决定已落库但补卡/入账丢失、仅控制台 warn」的永久不一致
  return transact<DecideResult>(() => {
    const info = db
      .prepare(
        `UPDATE approvals
         SET status = ?, approver = ?, comment = ?, decidedAt = datetime('now', 'localtime')
         WHERE id = ? AND status = 'pending'`
      )
      .run(decision, approver, comment, id);
    if (Number(info.changes ?? 0) === 0) return { conflict: true, row };

    const updated = getApproval(id)!;

    // 领域动作：审批通过后自动执行（闭环）。动作表在文件末尾显式穷举，见 DOMAIN_ACTIONS。
    if (decision === "approved") {
      DOMAIN_ACTIONS[approvalKindOf(updated.type)]?.(updated);
    }

    // 通知申请人（recipients=申请人；同内容未读去重由 notificationsDb 负责）
    const spec = APPROVAL_TYPES[approvalKindOf(updated.type)];
    const { subject, detail } = spec.notify(updated);
    createNotification({
      title: `${subject}已${decision === "approved" ? "通过" : "被驳回"}`,
      message: `${detail}，审批人：${approver}${comment ? `，意见：${comment}` : ""}`,
      type: decision === "approved" ? "success" : "warning",
      recipient: updated.applicant,
    });

    return { row: updated };
  });
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
 * P2 加班领域动作：通过后把加班小时数计入调休台账（overtime_ledger）。
 * 调休额度按员工累计，请假类型「调休」在提交时校验余额（见 approvalsRouter）。
 */
function applyOvertime(approval: ApprovalRow): void {
  const hours = approval.hours;
  if (!hours || hours <= 0) return;
  const emp = findApplicantEmployee(approval.applicant);
  if (!emp) {
    createNotification({
      title: "加班时长未计入调休",
      message: "你的账号未关联员工档案，加班时长无法累计，请联系管理员完成关联。",
      type: "warning",
      recipient: approval.applicant,
    });
    return;
  }
  db.prepare(
    `INSERT INTO overtime_ledger (employeeId, employeeName, hours, updatedAt)
     VALUES (?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(employeeId) DO UPDATE SET
       hours = hours + excluded.hours,
       employeeName = excluded.employeeName,
       updatedAt = excluded.updatedAt`
  ).run(emp.employeeId, emp.employeeName, hours);
}

/** 调休余额（小时） */
export function getCompBalance(employeeId: string): number {
  try {
    const row = db.prepare("SELECT hours FROM overtime_ledger WHERE employeeId = ?").get(employeeId);
    return asNumber(row?.hours);
  } catch {
    return 0;
  }
}

/** 待审「调休」申请已占用的小时数（提交时预占校验用，防止多笔 pending 同时通过余额检查） */
export function getPendingCompUsedHours(applicant: string): number {
  const rows = db
    .prepare(
      `SELECT startDate, endDate FROM approvals
        WHERE applicant = ? AND status = 'pending' AND type = 'leave' AND leaveType = '调休'`
    )
    .all(applicant) as { startDate: string; endDate: string | null }[];
  return rows.reduce((sum, r) => sum + leaveDaysBetween(asString(r.startDate), r.endDate) * 8, 0);
}

/**
 * 调休领域动作：通过后从 overtime_ledger 扣减（天数 × 8h）。
 * 此前只校验不扣减，一笔加班可支撑无限次调休——余额只增不减。
 * 条件更新（hours >= 扣减量）失败意味着并发场景下额度被其他已批申请抢占：
 * 保留批准结果（人员管理优先），但通知双方需要人工核销。
 */
function applyCompLeave(approval: ApprovalRow): void {
  const hours = leaveDaysBetween(approval.startDate, approval.endDate) * 8;
  const emp = findApplicantEmployee(approval.applicant);
  if (!emp || hours <= 0) return;
  const info = db
    .prepare(
      `UPDATE overtime_ledger
          SET hours = hours - ?, updatedAt = datetime('now', 'localtime')
        WHERE employeeId = ? AND hours >= ?`
    )
    .run(hours, emp.employeeId, hours);
  if (Number(info.changes ?? 0) === 0) {
    createNotification({
      title: "调休余额扣减未成功",
      message: `你的调休申请已通过，但调休台账余额不足以扣减 ${hours}h（可能被并发申请占用），请联系行政人工核销。`,
      type: "warning",
      recipient: approval.applicant,
    });
    console.warn(
      `[approvals] 调休扣减失败（余额不足/并发占用）：approval=${approval.id} need=${hours}h`
    );
  }
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
    formatLocalDateTime(),
    emp.employeeId
  );
}

/**
 * 离职领域动作：通过后员工状态置「离职」，账号停用并吊销全部会话。
 * 说明：最后工作日为信息性字段（流程审批时已确认），停用动作立即执行——
 * 避免"已批准离职但账号仍可登录"的权限悬空。
 */
function applyResign(approval: ApprovalRow): void {
  const now = formatLocalDateTime();

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

/**
 * 审批台账（HR+）：按状态 / 月份 / 申请人筛选。
 * 月份取的是"处理月份"——已决定的按 decidedAt，未决定的按 createdAt，
 * 这样"这个月批掉了哪些"和"这个月还压着哪些"能被同一次查询覆盖。
 * 默认 200 条、上限 500：审批历史只增不减，不给上限迟早把首屏拖垮。
 */
export function listApprovals(
  query: { status?: unknown; month?: unknown; applicant?: unknown; limit?: unknown } = {}
): ApprovalRow[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const status = typeof query.status === "string" ? query.status : "";
  if (["pending", "approved", "rejected", "withdrawn"].includes(status)) {
    clauses.push("status = ?");
    params.push(status);
  } else if (status === "decided") {
    clauses.push("status IN ('approved','rejected','withdrawn')");
  }

  const month = typeof query.month === "string" ? query.month : "";
  if (/^\d{4}-\d{2}$/.test(month)) {
    clauses.push("strftime('%Y-%m', COALESCE(decidedAt, createdAt)) = ?");
    params.push(month);
  }

  const applicant = typeof query.applicant === "string" ? query.applicant.trim() : "";
  if (applicant) {
    clauses.push("applicant = ?");
    params.push(applicant);
  }

  let limit = Number(query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 200;
  limit = Math.min(500, Math.round(limit));

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT * FROM approvals ${where}
        ORDER BY COALESCE(decidedAt, createdAt) DESC, id DESC
        LIMIT ?`
    )
    .all(...params, limit)
    .map(rowToApproval);
}

/**
 * 撤回自己的申请：只有本人、且仍在待审时可撤。
 * 撤回不触发任何领域动作（调休额度本来就只是"预占"，status 一旦离开 pending 就自动释放），
 * decidedAt 记时间是为了让它落进对应月份的台账里。
 */
export function withdrawApproval(
  id: string,
  username: string
): { row?: ApprovalRow; notFound?: boolean; forbidden?: boolean; conflict?: boolean } {
  const row = getApproval(id);
  if (!row) return { notFound: true };
  if (row.applicant !== username) return { forbidden: true };
  if (row.status !== "pending") return { conflict: true };

  db.prepare(
    `UPDATE approvals
        SET status = 'withdrawn', decidedAt = datetime('now', 'localtime'),
            comment = CASE WHEN comment = '' THEN '本人撤回' ELSE comment END
      WHERE id = ? AND status = 'pending'`
  ).run(id);
  return { row: getApproval(id)! };
}

/**
 * 通过后的领域动作：**每个类型都必须在这里显式表态**。
 *
 * 用 Record<ApprovalKind, …| null> 而不是 if 链，是为了让"新增一个审批类型却忘了决定
 * 通过后做什么"变成编译期错误 —— 原来那条 if 链加一类不改就静默什么都不做。
 * 实现留在本模块（它们要写台账/档案/打卡），规格表只管文案与校验，避免模块互相引用成环。
 */
const DOMAIN_ACTIONS: Record<ApprovalKind, ((approval: ApprovalRow) => void) | null> = {
  // 请假里只有「调休」有账务动作，其余假别只留档
  leave: (approval) => {
    if (approval.leaveType === "调休") applyCompLeave(approval);
  },
  makeup: applyMakeupPunch,
  conversion: applyConversion,
  resign: applyResign,
  overtime: applyOvertime,
};

/** 测试与排障用：某个类型是否有领域动作（null = 通过后只留档） */
export function domainActionOf(kind: ApprovalKind): ((approval: ApprovalRow) => void) | null {
  return DOMAIN_ACTIONS[kind];
}
