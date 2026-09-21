import { Router, json } from "express";
import { callModel, chargeQuota, gate } from "./aiGate.ts";
import { getEmployee } from "./db.ts";
import { canViewPii } from "./employeesRouter.ts";
import { createBusinessForm, listBusinessForms } from "./businessFormsDb.ts";
import { validateBody, businessFormRecordSchema } from "./validation.ts";

/**
 * 业务单生成模块后端。
 *
 * 端点：
 * - POST /api/form/polish   业务单正文润色（可选步骤，模板打底文本由前端生成）
 * - GET  /api/form/records?employeeId=  某员工已归档的业务单
 * - POST /api/form/records  把业务单归档进该员工档案
 *
 * 业务单的版面与句式由前端模板保证（与纸质原件一致），AI 只负责措词润色，
 * 因此这里不生成结构、不套模板，也不得改动金额等事实信息。
 * 准入与额度与微信通知生成器完全一致（见 aiGate：个人模型优先、系统模型按角色档位限额）。
 *
 * 归档读写沿用合同信息同一口径（canViewPii：本人或 HR 及以上）——业务单挂着姓名、
 * 部门、金额与事由，属于同一类员工个人信息；/form/* 的策略是「登录即可」，
 * 所以这条边界必须在路由内自己判。
 */
export const businessFormRouter = Router();

businessFormRouter.use("/polish", json({ limit: "64kb" }));
businessFormRouter.use("/records", json({ limit: "64kb" }));

const POLISH_SYSTEM_PROMPT = `你是企业行政公文写作助手。用户给出一张「业务单」中“需办理的业务”栏的正文草稿，请在不改变事实的前提下润色措词。
硬性要求：
- 只输出润色后的正文本身，不要标题、称呼、落款、日期、解释说明，也不要使用 Markdown；
- 金额、数字、人名、单位、部门、日期、银行账号等事实信息必须原样保留，不得改动、不得新增；
- 保持简体中文公文体，语气庄重平实，删除口语与冗余，长度不长于原文；
- 单独成行的「呈上级领导批示。」等呈批语保持独立成段、文字不变；
- 段落之间空一行，段首不要缩进（系统统一排版）。`;

/** 去掉模型偶尔包裹的 ``` 代码块围栏 */
function stripFences(text: string): string {
  return text.replace(/^```[a-z]*\n?/iu, "").replace(/\n?```\s*$/u, "").trim();
}

businessFormRouter.post("/polish", async (req, res, next) => {
  const gated = gate(req, res);
  if (!gated) return;
  const { config, effective } = gated;

  const { text } = (req.body ?? {}) as { text?: unknown };
  const draft = typeof text === "string" ? text.trim() : "";
  if (!draft) return res.status(400).json({ error: "请提供待润色的正文" });
  if (draft.length > 4000) return res.status(400).json({ error: "正文过长（上限 4000 字）" });

  if (!chargeQuota(req, res, config)) return;

  try {
    const polished = stripFences(
      await callModel(effective, `正文草稿：\n${draft}`, POLISH_SYSTEM_PROMPT)
    );
    if (!polished) return res.status(502).json({ error: "模型未返回内容，请重试" });
    res.json({ text: polished, sourceChars: draft.length });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return res.status(504).json({ error: "模型响应超时（60 秒），请稍后重试" });
    }
    if (e instanceof Error && e.message.startsWith("模型服务")) {
      return res.status(502).json({ error: e.message });
    }
    next(e);
  }
});

const DEFAULT_KIND_LABEL: Record<string, string> = {
  condolence: "亲属逝世慰问金",
  wedding: "员工结婚贺喜红包",
  custom: "自定义业务",
};

// GET /api/form/records?employeeId= — 该员工已归档的业务单（本人或 HR+）
businessFormRouter.get("/records", (req, res) => {
  const employeeId = String(req.query.employeeId ?? "");
  if (!employeeId) return res.status(400).json({ error: "缺少员工" });
  if (!getEmployee(employeeId)) return res.status(404).json({ error: "User not found" });
  if (!canViewPii(req.auth, employeeId)) {
    return res.status(403).json({ error: "无权查看该员工的业务单" });
  }
  res.json(listBusinessForms(employeeId));
});

// POST /api/form/records — 归档进员工档案（本人或 HR+；归属员工以库内记录为准）
businessFormRouter.post(
  "/records",
  validateBody(businessFormRecordSchema),
  (req, res) => {
    const { employeeId, kind, kindLabel, department, relation, date, amount, body } = req.body;
    const employee = getEmployee(employeeId);
    if (!employee) return res.status(404).json({ error: "User not found" });
    if (!canViewPii(req.auth, employeeId)) {
      return res.status(403).json({ error: "无权为该员工归档业务单" });
    }
    res.status(201).json(
      createBusinessForm(
        {
          employeeId,
          employeeName: employee.name,
          kind,
          kindLabel: kindLabel || DEFAULT_KIND_LABEL[kind] || kind,
          department,
          relation,
          date,
          amount,
          body,
        },
        req.auth?.username ?? ""
      )
    );
  }
);
