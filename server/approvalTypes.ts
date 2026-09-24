/**
 * 审批类型规格表 —— 五类审批（请假/补卡/转正/离职/加班）的差异只允许写在这一个文件里。
 *
 * 重构前的形态：POST /approvals 是一条 110 行的五分支链（每支自己校验、自己拼落库字段），
 * 通知文案是两层三元式，通过后的领域动作是 decideApproval 里的 if 链，
 * 类型标签在服务端和客户端各存一份。加一类要同时改四处，漏一处就是"提交能过、通知文案错、
 * 通过后不执行动作"这类静默不一致。
 *
 * 现在的形状：
 *  - `toDraft`  校验 + 归一化（返回中文错误或落库字段）
 *  - `requiredRole`  审批门槛（原先藏在 createApproval 内部）
 *  - `notify`   给申请人的文案主语与详情（纯字符串拼装）
 *  - 领域动作**不在这里**：实现留在 approvalsDb（那里才有台账/档案/打卡的写路径），
 *    由 `DOMAIN_ACTIONS` 这张 `Record<ApprovalKind, fn | null>` 显式穷举 ——
 *    新增类型时必须当场表态"通过后做什么"或"什么都不做"，不允许静默漏掉。
 *
 * 本文件刻意不碰数据库：需要档案/余额的校验通过 ctx 的惰性取值拿，便于直接单测。
 */
import type { SystemRole } from "./authDb.ts";
import type { ApprovalRow } from "./approvalsDb.ts";

export const APPROVAL_KINDS = ["leave", "makeup", "conversion", "resign", "overtime"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const LEAVE_TYPES = ["事假", "病假", "年假", "调休"] as const;
export const PUNCH_KINDS = ["上班卡", "下班卡"] as const;

/** 一次请假/加班的时长口径：8 小时 = 1 天调休额度 */
export const COMP_HOURS_PER_DAY = 8;
/** P2 多级审批门槛：请假达到这个天数就要 ADMIN 终审 */
export const ADMIN_REVIEW_LEAVE_DAYS = 3;

export interface ApprovalInput {
  type?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string | null;
  reason?: string;
  punchDate?: string;
  punchTime?: string;
  punchKind?: string;
  hours?: number | string;
}

/** 归一化后的落库字段（与 createApproval 的入参同形） */
export interface ApprovalDraft {
  type: ApprovalKind;
  leaveType: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  punchDate?: string;
  punchTime?: string;
  punchKind?: string;
  hours?: number;
}

export type DraftResult = { ok: true; draft: ApprovalDraft } | { ok: false; error: string; code?: string };

/**
 * 提交时能拿到的申请人上下文。全部惰性取值：补卡这类不需要档案的分支不会触发任何查询。
 */
export interface ApplicantContext {
  username: string;
  employeeId(): string | null;
  employeeStatus(employeeId: string): string;
  /** 加班累计出来的调休额度（小时），未扣待审占用 */
  compLedgerHours(): number;
  /** 同一申请人还在待审的调休占用（小时） */
  pendingCompHours(): number;
  /** 今天（YYYY-MM-DD）；由调用方给，避免规格表里直接读时钟 */
  today(): string;
}

export interface ApprovalTypeSpec {
  kind: ApprovalKind;
  /** 列表与通知里的类型名；请假用行内的 leaveType（事假/病假/…），所以这里返回函数 */
  label(row: Pick<ApprovalRow, "leaveType">): string;
  toDraft(input: ApprovalInput, ctx: ApplicantContext): DraftResult;
  requiredRole(input: ApprovalInput): SystemRole;
  /** 给申请人的通知文案：标题 = 「你的{subject}已通过/被驳回」 */
  notify(row: ApprovalRow): { subject: string; detail: string };
}

function bad(error: string, code?: string): DraftResult {
  return code ? { ok: false, error, code } : { ok: false, error };
}

/**
 * 请假天数（含首尾两天；无结束日期按 1 天计）。
 * 提交校验、审批门槛与调休额度扣减共用这一个口径 —— 原先它住在 approvalsDb 里，
 * 而这里也要用，重复一份就会出现"额度按 A 算、门槛按 B 判"，所以整条搬过来由 approvalsDb 再导出。
 */
export function leaveDaysBetween(startDate?: string | null, endDate?: string | null): number {
  const start = Date.parse(`${startDate ?? ""}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : start;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** 请假（默认类型）：天数口径与额度扣减一致 */
const leaveSpec: ApprovalTypeSpec = {
  kind: "leave",
  label: (row) => row.leaveType,
  toDraft: (input, ctx) => {
    if (!input.startDate) return bad("开始日期不能为空");
    if (input.leaveType === "调休") {
      const days = leaveDaysBetween(input.startDate, input.endDate);
      const pending = ctx.pendingCompHours();
      const employeeId = ctx.employeeId();
      const balance = employeeId ? ctx.compLedgerHours() - pending : 0;
      if (days * COMP_HOURS_PER_DAY > balance) {
        return bad(
          `调休余额不足：需 ${days} 天（${days * COMP_HOURS_PER_DAY}h），当前可用 ${Math.max(balance, 0)}h（另有 ${pending}h 待审批占用）`,
          "COMP_BALANCE_INSUFFICIENT"
        );
      }
    }
    return {
      ok: true,
      draft: {
        type: "leave",
        leaveType: input.leaveType ?? "事假",
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        reason: input.reason ?? "",
      },
    };
  },
  requiredRole: (input) =>
    input.endDate && leaveDaysBetween(input.startDate, input.endDate) >= ADMIN_REVIEW_LEAVE_DAYS ? "ADMIN" : "HR",
  notify: (row) => ({
    subject: `你的${row.leaveType}申请`,
    detail: `${row.startDate} 提交的申请`,
  }),
};

const makeupSpec: ApprovalTypeSpec = {
  kind: "makeup",
  label: () => "补卡",
  toDraft: (input) => {
    const { punchDate, punchTime, punchKind } = input;
    if (!punchDate || !punchTime || !punchKind) return bad("补卡申请需填写日期、时间与卡类型");
    return {
      ok: true,
      // startDate 复用为补卡日期：保持列表排序与展示兼容（沿用既有约定）
      draft: {
        type: "makeup",
        leaveType: "补卡",
        startDate: punchDate,
        endDate: null,
        reason: input.reason ?? "",
        punchDate,
        punchTime,
        punchKind,
      },
    };
  },
  requiredRole: () => "HR",
  notify: (row) => ({
    subject: `你的${row.punchKind || "补卡"}申请`,
    detail: `${row.punchDate} ${row.punchTime} 的补卡`,
  }),
};

const conversionSpec: ApprovalTypeSpec = {
  kind: "conversion",
  label: () => "转正",
  toDraft: (input, ctx) => {
    const employeeId = ctx.employeeId();
    if (!employeeId) return bad("你的账号未关联员工档案，无法申请转正");
    if (ctx.employeeStatus(employeeId) !== "试用期") return bad("当前员工状态不是试用期，无需转正申请");
    return {
      ok: true,
      draft: {
        type: "conversion",
        leaveType: "转正",
        startDate: ctx.today(),
        endDate: null,
        reason: input.reason ?? "",
      },
    };
  },
  requiredRole: () => "HR",
  notify: (row) => ({ subject: "你的转正申请", detail: `${row.startDate} 提交的申请` }),
};

const resignSpec: ApprovalTypeSpec = {
  kind: "resign",
  label: () => "离职",
  toDraft: (input) => {
    if (!input.startDate) return bad("请填写最后工作日");
    return {
      ok: true,
      draft: {
        type: "resign",
        leaveType: "离职",
        startDate: input.startDate,
        endDate: null,
        reason: input.reason ?? "",
      },
    };
  },
  requiredRole: () => "HR",
  notify: (row) => ({ subject: "你的离职申请", detail: `最后工作日 ${row.startDate}` }),
};

const overtimeSpec: ApprovalTypeSpec = {
  kind: "overtime",
  label: () => "加班",
  toDraft: (input) => {
    const hours = Number(input.hours);
    if (!input.startDate) return bad("请填写加班日期");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return bad("加班时长需为 0~24 之间的数字（小时）");
    return {
      ok: true,
      draft: {
        type: "overtime",
        leaveType: "加班",
        startDate: input.startDate,
        endDate: null,
        reason: input.reason ?? "",
        hours: Math.round(hours * 2) / 2,
      },
    };
  },
  requiredRole: () => "HR",
  notify: (row) => ({
    subject: `你的加班申请（${row.hours} 小时）`,
    detail: `${row.startDate} 共 ${row.hours} 小时，已计入调休额度`,
  }),
};

export const APPROVAL_TYPES: Record<ApprovalKind, ApprovalTypeSpec> = {
  leave: leaveSpec,
  makeup: makeupSpec,
  conversion: conversionSpec,
  resign: resignSpec,
  overtime: overtimeSpec,
};

/** 未识别的 type 一律按请假处理（与重构前的默认分支一致） */
export function approvalKindOf(type: string | null | undefined): ApprovalKind {
  return (APPROVAL_KINDS as readonly string[]).includes(String(type)) ? (type as ApprovalKind) : "leave";
}
