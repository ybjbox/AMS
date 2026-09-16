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
import {
  createApproval,
  listMine,
  listPending,
  decideApproval,
  getCompBalance,
} from "./approvalsDb.ts";

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
    // 补卡分支：日期/时间/卡类型必填；startDate 复用为补卡日期（保持列表排序与展示兼容）
    if (req.body.type === "makeup") {
      const { punchDate, punchTime, punchKind, reason } = req.body;
      if (!punchDate || !punchTime || !punchKind) {
        return res.status(400).json({ error: "补卡申请需填写日期、时间与卡类型" });
      }
      const row = createApproval({
        applicant: req.auth!.username,
        type: "makeup",
        leaveType: "补卡",
        startDate: punchDate,
        endDate: null,
        reason,
        punchDate,
        punchTime,
        punchKind,
      });
      return res.status(201).json(row);
    }

    // 转正分支：申请人须为「试用期」状态的已关联员工
    if (req.body.type === "conversion") {
      const accountRow = db
        .prepare("SELECT employeeId FROM accounts WHERE username = ?")
        .get(req.auth!.username);
      const employeeId = asString(accountRow?.employeeId);
      if (!employeeId) {
        return res.status(400).json({ error: "你的账号未关联员工档案，无法申请转正" });
      }
      const empRow = db.prepare("SELECT status FROM employees WHERE id = ?").get(employeeId);
      if (asString(empRow?.status) !== "试用期") {
        return res.status(400).json({ error: "当前员工状态不是试用期，无需转正申请" });
      }
      const row = createApproval({
        applicant: req.auth!.username,
        type: "conversion",
        leaveType: "转正",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: null,
        reason: req.body.reason,
      });
      return res.status(201).json(row);
    }

    // 离职分支：最后工作日（startDate）+ 原因必填
    if (req.body.type === "resign") {
      if (!req.body.startDate) {
        return res.status(400).json({ error: "请填写最后工作日" });
      }
      const row = createApproval({
        applicant: req.auth!.username,
        type: "resign",
        leaveType: "离职",
        startDate: req.body.startDate,
        endDate: null,
        reason: req.body.reason,
      });
      return res.status(201).json(row);
    }

    // P2 加班分支：日期 + 时长必填，时长 0.5~24h；startDate 复用为加班日期
    if (req.body.type === "overtime") {
      const hours = Number(req.body.hours);
      if (!req.body.startDate) return res.status(400).json({ error: "请填写加班日期" });
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return res.status(400).json({ error: "加班时长需为 0~24 之间的数字（小时）" });
      }
      const row = createApproval({
        applicant: req.auth!.username,
        type: "overtime",
        leaveType: "加班",
        startDate: req.body.startDate,
        endDate: null,
        reason: req.body.reason,
        hours: Math.round(hours * 2) / 2,
      });
      return res.status(201).json(row);
    }

    // 请假分支（默认）
    if (!req.body.startDate) {
      return res.status(400).json({ error: "开始日期不能为空" });
    }
    // P2：调休假需校验余额（overtime_ledger 累计的加班时长，8h=1 天）
    if (req.body.leaveType === "调休") {
      const accountRow = db
        .prepare("SELECT employeeId FROM accounts WHERE username = ?")
        .get(req.auth!.username);
      const employeeId = asString(accountRow?.employeeId);
      const start = new Date(req.body.startDate);
      const end = req.body.endDate ? new Date(req.body.endDate) : start;
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const balance = employeeId ? getCompBalance(employeeId) : 0;
      if (days * 8 > balance) {
        return res.status(400).json({
          error: `调休余额不足：需 ${days} 天（${days * 8}h），当前余额 ${balance}h`,
          code: "COMP_BALANCE_INSUFFICIENT",
        });
      }
    }
    const row = createApproval({
      applicant: req.auth!.username,
      type: "leave",
      leaveType: req.body.leaveType,
      startDate: req.body.startDate,
      endDate: req.body.endDate ?? null,
      reason: req.body.reason,
    });
    res.status(201).json(row);
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
