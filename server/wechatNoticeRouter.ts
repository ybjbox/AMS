import { Router, json, raw, type Request, type Response } from "express";
import { getAiConfig, type AiConfig } from "./aiConfigDb.ts";
import {
  getUserAiConfig,
  isUserAiConfigUsable,
  getUsageToday,
  incrementUsage,
} from "./aiUserDb.ts";
import { ROLE_LEVEL } from "./authDb.ts";
import { extractFileText, ExtractError, MAX_FILE_BYTES, isSupportedFile } from "./fileTextExtract.ts";

/**
 * 微信通知一键生成器。
 *
 * 端点：
 * - POST /api/notice/extract   文件 → 纯文本（raw 字节体，?filename= 判类型），供前端回填预览
 * - POST /api/notice/generate  文本 → AI 生成微信可发的通知文案（仅一键复制，不直接投递）
 *
 * 复用 aiConfigDb 的模型配置与 /chat 同样的准入策略（enabled + allowNonAdmin），
 * 并共享同一套防滥用机制：个人模型（不占额度）优先，否则走系统配置且受每日额度约束。
 * 与 AI 助手不同：本功能没有合理的“占位回复”，未配置 apiKey 时直接报错。
 */
export const noticeRouter = Router();

noticeRouter.use("/generate", json({ limit: "1mb" }));

const SYSTEM_PROMPT = `你是行政通知写作助手。根据用户提供的原始内容，改写成一条可以直接复制到微信（工作群/私聊）发送的通知文本。

硬性要求：
- 纯文本，不使用任何 Markdown 语法（不要 **加粗**、# 标题、- 列表符号），微信不渲染 Markdown；
- 结构：第一行为「【通知】+ 主题」；正文按 时间 / 地点 / 事项 / 要求 分段，段落间空一行；
- 用「·」作列表符号；关键信息（时间、地点、截止）必须原样保留，不得编造或改动；
- 原文没有的信息一律不添加；不确定的信息用「（待确认）」标注；
- 语气正式、简洁，默认不超过 300 字，除非用户另有要求；
- 只输出通知文本本身，不要输出解释、引号或代码块。`;

function gate(req: Request, res: Response): { config: AiConfig; effective: AiConfig; useOwn: boolean } | null {
  const config = getAiConfig();
  if (!config.enabled) {
    res.status(400).json({ error: "AI 功能未启用，请先在系统设置 → AI 配置中开启" });
    return null;
  }
  const user = req.auth?.username ?? "";
  const own = user ? getUserAiConfig(user) : null;
  const useOwn = config.allowPersonalModel && isUserAiConfigUsable(own);
  if (!useOwn && !config.apiKey) {
    res.status(400).json({ error: "未配置模型 API Key，请先在系统设置 → AI 配置中填写" });
    return null;
  }
  const role = (req.auth?.systemRole ?? "EMPLOYEE") as keyof typeof ROLE_LEVEL;
  if (!config.allowNonAdmin && ROLE_LEVEL[role] < ROLE_LEVEL["ADMIN"]) {
    res.status(403).json({ error: "当前仅管理员可使用 AI 功能" });
    return null;
  }
  const effective: AiConfig = useOwn
    ? { ...config, baseUrl: own!.baseUrl.trim(), apiKey: own!.apiKey.trim(), model: own!.model.trim() }
    : config;
  return { config, effective, useOwn };
}

async function callModel(config: AiConfig, userContent: string): Promise<string> {
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw e;
    throw new Error(`模型服务连接失败（${config.baseUrl}），请检查 AI 配置中的接口地址与网络`, { cause: e });
  }
  if (!upstream.ok) {
    const raw = (await upstream.text().catch(() => "")).trim();
    const detail = raw && !raw.startsWith("<") && !raw.startsWith('{"') ? raw.slice(0, 160) : "";
    throw new Error(`模型服务返回 ${upstream.status}${detail ? `：${detail}` : ""}`);
  }
  const json = (await upstream.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = json.choices?.[0]?.message?.content;
  return (typeof content === "string" ? content : "").trim();
}

/** 文件字节 → 纯文本预览（不调用模型） */
noticeRouter.post(
  "/extract",
  raw({ type: "application/octet-stream", limit: `${MAX_FILE_BYTES + 1024}` }),
  async (req, res, next) => {
    try {
      const filename = String(req.query.filename ?? "");
      if (!isSupportedFile(filename)) {
        return res.status(400).json({ error: "不支持的文件类型（支持 txt/md/csv/xlsx/docx/pdf）" });
      }
      const body = req.body as Buffer | undefined;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: "请求体应为文件的原始字节" });
      }
      if (body.length > MAX_FILE_BYTES) {
        return res.status(413).json({ error: "文件超过 3MB 上限" });
      }
      const text = await extractFileText(filename, body);
      res.json({ text, chars: text.length });
    } catch (e) {
      if (e instanceof ExtractError) return res.status(400).json({ error: e.message });
      if ((e as { type?: string })?.type === "entity.too.large") {
        return res.status(413).json({ error: "文件超过 3MB 上限" });
      }
      next(e);
    }
  }
);

/** 文本 → 微信通知文案（与 AI 助手共享每日额度与个人模型规则） */
noticeRouter.post("/generate", async (req, res, next) => {
  try {
    const gated = gate(req, res);
    if (!gated) return;
    const { config, effective, useOwn } = gated;

    const { source, instruction } = (req.body ?? {}) as {
      source?: unknown;
      instruction?: unknown;
    };
    const text = typeof source === "string" ? source.trim() : "";
    if (!text) return res.status(400).json({ error: "请提供待转换的原始内容" });
    if (text.length > 20_000) return res.status(400).json({ error: "原始内容过长（上限 20000 字）" });
    const extra = typeof instruction === "string" ? instruction.trim() : "";

    // 系统额度：与 /chat 同一计数表（走系统配置的调用合并计数；个人模型不受限）
    if (!useOwn && (config.dailyQuota ?? 0) > 0) {
      const limit = config.dailyQuota ?? 0;
      const user = req.auth?.username ?? "";
      if (getUsageToday(user) >= limit) {
        return res.status(429).json({
          error: `今日系统额度已用尽（限额 ${limit} 次/天）。可配置个人模型继续使用（使用自有凭据，不受系统额度限制），或待次日额度重置。`,
        });
      }
      incrementUsage(user);
    }

    const userContent = extra
      ? `原始内容：\n${text}\n\n补充要求：${extra}`
      : `原始内容：\n${text}`;
    const notice = await callModel(effective, userContent);
    if (!notice) return res.status(502).json({ error: "模型未返回内容，请重试" });
    res.json({ notice, sourceChars: text.length });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return res.status(504).json({ error: "模型响应超时（60 秒），请缩短内容或重试" });
    }
    if (e instanceof Error && e.message.startsWith("模型服务")) {
      return res.status(502).json({ error: e.message });
    }
    next(e);
  }
});
