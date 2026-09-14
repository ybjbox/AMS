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
import {
  createApproval,
  listMine,
  listPending,
  decideApproval,
} from "./approvalsDb.ts";

export const approvalsRouter = Router();
approvalsRouter.use(json());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    type: z.enum(["leave"]).optional(),
    leaveType: z.enum(["事假", "病假", "年假", "调休"]).optional(),
    startDate: z
      .string({ error: "开始日期不能为空" })
      .regex(DATE_RE, "开始日期格式应为 YYYY-MM-DD"),
    endDate: z
      .string()
      .regex(DATE_RE, "结束日期格式应为 YYYY-MM-DD")
      .optional(),
    reason: z.string({ error: "请填写申请事由" }).min(1, "请填写申请事由"),
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
    const row = createApproval({
      applicant: req.auth!.username,
      type: req.body.type,
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
      typeof req.body.comment === "string" ? req.body.comment : ""
    );
    if (result.notFound) return res.status(404).json({ error: "申请不存在" });
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
