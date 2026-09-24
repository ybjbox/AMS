/**
 * 审批 API（/api/approvals）— R1 审批流 v1（请假申请闭环）+ R2 员工自助提交。
 *
 *   POST /            提交申请（任何登录用户；authGate POLICIES 对 POST /approvals 放行 EMPLOYEE）
 *   GET  /mine        我的申请
 *   GET  /pending     待审批列表（HR+，requireRole 纵深防御）
 *   PUT  /:id/decide  审批决定（HR+；仅 pending 可决定，重复/并发决定返回 409）
 */
import { Router, json } from "express";
import { z } from "zod";
import { validateBody } from "./validation.ts";
import { requireRole } from "./authMiddleware.ts";
import { db } from "./db.ts";
import { asString } from "./sqliteUtil.ts";
import { localToday } from "./localDate.ts";
import {
  createApproval,
  listMine,
  listPending,
  listApprovals,
  decideApproval,
  withdrawApproval,
  getCompBalance,
  getPendingCompUsedHours,
} from "./approvalsDb.ts";
import { APPROVAL_TYPES, approvalKindOf, type ApplicantContext, type ApprovalInput } from "./approvalTypes.ts";

export const approvalsRouter = Router();
approvalsRouter.use(json());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    /** 'leave' 请假（默认） | 'makeup' 补卡 | 'conversion' 转正 | 'resign' 离职 */
    type: z.enum(["leave", "makeup", "conversion", "resign", "overtime"]).optional(),
    leaveType: z.enum(["事假", "病假", "年假", "调休"]).optional(),
    startDate: z
      .string()
      .regex(DATE_RE, "开始日期格式应为 YYYY-MM-DD")
      .optional(),
    endDate: z
      .string()
      .regex(DATE_RE, "结束日期格式应为 YYYY-MM-DD")
      .optional(),
    reason: z.string({ error: "请填写申请事由" }).min(1, "请填写申请事由"),
    // 补卡专用字段（type='makeup' 时必填，由处理函数分支校验）
    punchDate: z.string().regex(DATE_RE, "补卡日期格式应为 YYYY-MM-DD").optional(),
    punchTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "补卡时间格式应为 HH:mm")
      .optional(),
    punchKind: z.enum(["上班卡", "下班卡"]).optional(),
    // 加班时长（小时，type='overtime' 时必填）
    hours: z.number().optional(),
  })
  .loose();

const decideSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    comment: z.string().optional(),
  })
  .loose();

approvalsRouter.post("/", validateBody(createSchema), (req, res, next) => {
  try {
    const input = req.body as ApprovalInput;
    const username = req.auth!.username;
    const spec = APPROVAL_TYPES[approvalKindOf(input.type)];
    // 惰性上下文：只有需要档案/余额的分支才会去查（补卡、离职一次都不查）
    const ctx: ApplicantContext = {
      username,
      employeeId: () => asString(db.prepare("SELECT employeeId FROM accounts WHERE username = ?").get(username)?.employeeId),
      employeeStatus: (employeeId) => asString(db.prepare("SELECT status FROM employees WHERE id = ?").get(employeeId)?.status),
      compLedgerHours: () => {
        const employeeId = ctx.employeeId();
        return employeeId ? getCompBalance(employeeId) : 0;
      },
      pendingCompHours: () => getPendingCompUsedHours(username),
      today: () => localToday(),
    };
    const result = spec.toDraft(input, ctx);
    if (!result.ok) {
      return res.status(400).json(result.code ? { error: result.error, code: result.code } : { error: result.error });
    }
    res.status(201).json(createApproval({ applicant: username, ...result.draft }));
  } catch (e) {
    next(e);
  }
});

approvalsRouter.get("/mine", (req, res, next) => {
  try {
    res.json(listMine(req.auth!.username));
  } catch (e) {
    next(e);
  }
});

approvalsRouter.get("/pending", requireRole("HR"), (_req, res, next) => {
  try {
    res.json(listPending());
  } catch (e) {
    next(e);
  }
});

// 审批台账（HR+）：?status=&month=YYYY-MM=&applicant=&limit=
approvalsRouter.get("/all", requireRole("HR"), (req, res, next) => {
  try {
    res.json(listApprovals(req.query));
  } catch (e) {
    next(e);
  }
});

// 我的调休余额：小时数口径与审批校验完全一致（已批扣减 + 待审预占）
approvalsRouter.get("/comp-balance", (req, res, next) => {
  try {
    const accountRow = db.prepare("SELECT employeeId FROM accounts WHERE username = ?").get(req.auth!.username);
    const employeeId = asString(accountRow?.employeeId);
    if (!employeeId) return res.json({ linked: false, hours: 0, pendingHours: 0 });
    const used = getPendingCompUsedHours(req.auth!.username);
    res.json({
      linked: true,
      employeeId,
      hours: getCompBalance(employeeId),
      pendingHours: used,
    });
  } catch (e) {
    next(e);
  }
});

// 撤回自己的申请（任何登录用户可试，归属在函数里校验；非 pending 返回 409）
approvalsRouter.put("/:id/withdraw", (req, res, next) => {
  try {
    const result = withdrawApproval(req.params.id, req.auth!.username);
    if (result.notFound) return res.status(404).json({ error: "申请不存在" });
    if (result.forbidden) return res.status(403).json({ error: "只能撤回本人提交的申请" });
    if (result.conflict) return res.status(409).json({ error: "该申请已被处理，无法撤回" });
    res.json(result.row);
  } catch (e) {
    next(e);
  }
});

// 批量决定（HR+）：逐条走同一个 decideApproval，单条失败不影响其余（返回明细）
const batchDecideSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, "请至少选择一条申请").max(100, "单次最多处理 100 条"),
    status: z.enum(["approved", "rejected"]),
    comment: z.string().optional(),
  })
  .loose();

approvalsRouter.put("/batch-decide", requireRole("HR"), validateBody(batchDecideSchema), (req, res, next) => {
  try {
    const { ids, status, comment } = req.body as { ids: string[]; status: "approved" | "rejected"; comment?: string };
    const decided: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of new Set(ids)) {
      const result = decideApproval(
        id,
        status,
        req.auth!.username,
        typeof comment === "string" ? comment : "",
        req.auth!.systemRole
      );
      // 顺序要紧：forbidden / conflict 的返回值里同样带着 row（原样回显用），
      // 先看 result.row 会把"不能审批自己的申请"误报成已办成功。
      if (result.notFound) failed.push({ id, error: "申请不存在" });
      else if (result.forbidden) failed.push({ id, error: result.reason ?? "无权审批该申请" });
      else if (result.conflict) failed.push({ id, error: "已被处理" });
      else if (result.row) decided.push(id);
      else failed.push({ id, error: result.reason ?? "未处理" });
    }
    res.json({ decided, failed });
  } catch (e) {
    next(e);
  }
});

approvalsRouter.put("/:id/decide", requireRole("HR"), validateBody(decideSchema), (req, res, next) => {
  try {
    const result = decideApproval(
      req.params.id,
      req.body.status,
      req.auth!.username,
      typeof req.body.comment === "string" ? req.body.comment : "",
      req.auth!.systemRole
    );
    if (result.notFound) return res.status(404).json({ error: "申请不存在" });
    if (result.forbidden) {
      return res
        .status(403)
        .json({ error: result.reason ?? "无权审批该申请", code: "APPROVAL_FORBIDDEN" });
    }
    if (result.conflict) {
      return res
        .status(409)
        .json({ error: "该申请已被处理", code: "ALREADY_DECIDED" });
    }
    res.json(result.row);
  } catch (e) {
    next(e);
  }
});
