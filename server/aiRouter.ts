import { Router, json, type Request } from "express";
import type { Response as ExpressResponse } from "express";
import { buildDataContext } from "./aiContext.ts";
import {
  getAiConfig,
  setAiConfig,
  type AiConfig,
} from "./aiConfigDb.ts";
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listAllConversations,
  getConversationAdmin,
  deleteConversationAdmin,
  clearAllConversations,
  pruneConversations,
  type StoredMsg,
} from "./aiDb.ts";
import { ROLE_LEVEL } from "./authDb.ts";

/**
 * AI 助手路由。
 *
 * 端点：
 * - POST /api/ai/chat          对话（SSE 流式），任意登录用户可用（受 allowNonAdmin 限制）
 * - GET  /api/ai/status        公开给登录用户：AI 是否启用、默认是否读数据等（用于前端显隐）
 * - GET  /api/ai/conversations 列出当前用户的对话
 * - POST /api/ai/conversations 新建对话
 * - GET  /api/ai/conversations/:id   读取某对话
 * - PUT  /api/ai/conversations/:id   更新（标题/消息）
 * - DELETE /api/ai/conversations/:id 删除某对话
 * - GET  /api/ai/models        仅超级管理员：从服务商 /models 端点拉取可用模型（需 baseUrl + apiKey）
 * - GET  /api/ai/config        仅超级管理员：读取配置（apiKey 脱敏）
 * - PUT  /api/ai/config        仅超级管理员：保存配置
 * - GET  /api/ai/logo          登录用户：自定义 Logo 图片字节流（替代内置图标）
 *
 * 上游：OpenAI 兼容 /v1/chat/completions（stream:true），配置来自 aiConfigDb（DB + env 合并）。
 * 占位模式：未配置 apiKey 时返回模拟流式回复，便于无密钥联调。
 */
export const aiRouter = Router();
aiRouter.use(json());

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

function sse(res: ExpressResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 把上游 OpenAI 兼容的 SSE 透传到客户端。返回是否成功接通上游。 */
async function streamFromUpstream(
  res: ExpressResponse,
  payload: Record<string, unknown>,
  config: AiConfig
): Promise<boolean> {
  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      // 上游无响应时释放连接，避免 SSE 挂起占住资源
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return false;
  }
  if (!upstream.ok || !upstream.body) return false;

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta: string = json.choices?.[0]?.delta?.content ?? "";
        if (delta) sse(res, { content: delta });
      } catch {
        /* 跳过不完整分片 */
      }
    }
  }
  return true;
}

/**
 * 多轮上下文摘要：当历史过长时，把早期对话折叠成一段摘要，
 * 只把最近若干轮原样发给模型，省 token 且保持连贯。
 * - 已配置 apiKey：额外调一次模型做真实摘要（短、低温）。
 * - 未配置（占位模式）：用启发式摘要，不做外网请求。
 */
async function summarizeMessages(
  older: ChatMsg[],
  config: AiConfig
): Promise<string> {
  if (older.length < 6) return "";
  const transcript = older
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n");

  if (!config.apiKey) {
    const firstUser = older.find((m) => m.role === "user")?.content ?? "";
    return `（此前共 ${older.length} 条对话，起始问题：「${firstUser.slice(0, 40)}…」，已折叠为摘要以节省上下文）`;
  }

  try {
    const upstream = await fetch(
      `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "你是对话摘要助手。用简体中文把以下对话压缩成不超过 120 字的要点摘要，保留关键事实、数字与待办，不要新增信息。",
            },
            { role: "user", content: transcript },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!upstream.ok) return "";
    const json = (await upstream.json()) as any;
    return (json.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

/** 占位模式：逐字推流一段说明，验证端到端流式链路。 */
async function streamPlaceholder(
  res: ExpressResponse,
  question: string,
  dataContext: string,
  summary: string
) {
  const answer =
    `（演示模式：尚未配置 OPENAI_API_KEY，以下为模拟回复）\n` +
    `你问的是：「${question}」\n` +
    (summary ? `\n历史对话摘要：\n${summary}\n` : "") +
    (dataContext
      ? `\n我已读取到的业务数据摘要：\n${dataContext}\n`
      : "") +
    `\n接入真实大模型只需在「系统设置 → AI 助手配置」中填写：\n` +
    `API Base URL（兼容接口地址）、API Key、模型名。`;
  for (const ch of answer) {
    sse(res, { content: ch });
    await new Promise((r) => setTimeout(r, 10));
  }
}

// --------------------------------------------------------------- 配置（仅超管）

function isSuperAdmin(req: Request): boolean {
  return req.auth?.systemRole === "SUPER_ADMIN";
}

aiRouter.get("/config", (req: Request, res: ExpressResponse) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "仅超级管理员可访问" });
  }
  const c = getAiConfig();
  const masked =
    c.apiKey && c.apiKey.length > 10
      ? `${c.apiKey.slice(0, 6)}…${c.apiKey.slice(-4)}`
      : c.apiKey
      ? "已设置"
      : "";
  res.json({
    enabled: c.enabled,
    allowNonAdmin: c.allowNonAdmin,
    useDataDefault: c.useDataDefault,
    baseUrl: c.baseUrl,
    model: c.model,
    systemPrompt: c.systemPrompt ?? "",
    assistantName: c.assistantName ?? "",
    assistantIcon: c.assistantIcon ?? "",
    assistantLogo: c.assistantLogo ?? "",
    assistantDraggable: !!c.assistantDraggable,
    conversationRetentionDays: c.conversationRetentionDays ?? 0,
    apiKeySet: !!c.apiKey,
    apiKeyMasked: masked,
  });
});

aiRouter.get("/models", async (req: Request, res: ExpressResponse) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "仅超级管理员可访问" });
  }
  const cfg = getAiConfig();
  const baseUrl =
    (typeof req.query.baseUrl === "string" && req.query.baseUrl.trim()) ||
    cfg.baseUrl;
  const apiKey =
    (typeof req.query.apiKey === "string" && req.query.apiKey.trim()) ||
    cfg.apiKey;
  if (!baseUrl) {
    return res.status(400).json({ error: "请先填写 API Base URL" });
  }
  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "请先填写 API Key（或在配置中已保存密钥）" });
  }
  try {
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(r.status === 401 ? 401 : 502).json({
        error:
          r.status === 401
            ? "服务商返回 401：API Key 无效或无权限"
            : `服务商返回 ${r.status}${txt ? `：${txt.slice(0, 120)}` : ""}`,
      });
    }
    const json = (await r.json()) as any;
    const list: string[] = Array.isArray(json?.data)
      ? json.data
          .map((m: any) => (typeof m?.id === "string" ? m.id : null))
          .filter((x: string | null): x is string => !!x)
      : [];
    list.sort((a, b) => a.localeCompare(b));
    res.json({ models: list });
  } catch {
    res.status(502).json({ error: "无法连接服务商，请检查 Base URL 与网络" });
  }
});

aiRouter.put("/config", (req: Request, res: ExpressResponse) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "仅超级管理员可访问" });
  }
  const b = (req.body ?? {}) as Partial<AiConfig>;
  // 校验自定义 Logo（base64 data URL），避免非法/超大内容入库
  if (b.assistantLogo !== undefined) {
    if (typeof b.assistantLogo !== "string") {
      return res.status(400).json({ error: "assistantLogo 格式错误" });
    }
    if (b.assistantLogo) {
      const ok = /^data:(image\/(png|jpeg|webp|gif|svg\+xml));base64,/i.test(
        b.assistantLogo
      );
      if (!ok) {
        return res
          .status(400)
          .json({ error: "Logo 仅支持 PNG/JPEG/WebP/GIF/SVG 的 data URL" });
      }
      // base64 体长度上限 ~2.5MB（解码后约 1.9MB），防止超大图片
      const b64 = b.assistantLogo.slice(b.assistantLogo.indexOf(",") + 1);
      if (b64.length > 2_500_000) {
        return res.status(400).json({ error: "Logo 图片过大（请控制在 1.5MB 以内）" });
      }
    }
  }
  const next = setAiConfig({
    enabled: b.enabled,
    allowNonAdmin: b.allowNonAdmin,
    useDataDefault: b.useDataDefault,
    baseUrl: b.baseUrl,
    model: b.model,
    apiKey: b.apiKey,
    systemPrompt: b.systemPrompt,
    assistantName: b.assistantName,
    assistantIcon: b.assistantIcon,
    assistantLogo: b.assistantLogo,
    assistantDraggable: b.assistantDraggable,
    conversationRetentionDays: b.conversationRetentionDays,
  });
  res.json({
    ok: true,
    enabled: next.enabled,
    allowNonAdmin: next.allowNonAdmin,
    useDataDefault: next.useDataDefault,
    baseUrl: next.baseUrl,
    model: next.model,
    systemPrompt: next.systemPrompt,
    assistantName: next.assistantName,
    assistantIcon: next.assistantIcon,
    assistantDraggable: next.assistantDraggable,
    conversationRetentionDays: next.conversationRetentionDays,
    apiKeySet: !!next.apiKey,
  });
});

// --------------------------------------------------------------- 审计（仅超管：全员会话）

/** 超管审计：列出全员对话（用于审计 / 合规查看，每个会话含归属用户名）。 */
aiRouter.get("/admin/conversations", (req: Request, res: ExpressResponse) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "仅超级管理员可访问" });
  }
  res.json(listAllConversations());
});

/** 超管审计：读取任意用户的某条对话详情。 */
aiRouter.get(
  "/admin/conversations/:id",
  (req: Request, res: ExpressResponse) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "仅超级管理员可访问" });
    }
    const conv = getConversationAdmin(req.params.id);
    if (!conv) return res.status(404).json({ error: "对话不存在" });
    res.json(conv);
  }
);

/** 超管审计：删除任意用户的某条对话。 */
aiRouter.delete(
  "/admin/conversations/:id",
  (req: Request, res: ExpressResponse) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "仅超级管理员可访问" });
    }
    const ok = deleteConversationAdmin(req.params.id);
    res.json({ ok });
  }
);

/** 超管审计：清空全部对话（所有用户）。强操作，前端需二次确认。返回删除条数。 */
aiRouter.delete(
  "/admin/conversations",
  (req: Request, res: ExpressResponse) => {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ error: "仅超级管理员可访问" });
    }
    const deleted = clearAllConversations();
    res.json({ ok: true, deleted });
  }
);

// --------------------------------------------------------------- 状态（登录用户可读）

aiRouter.get("/status", (_req: Request, res: ExpressResponse) => {
  const c = getAiConfig();
  res.json({
    enabled: c.enabled,
    allowNonAdmin: c.allowNonAdmin,
    useDataDefault: c.useDataDefault,
    configured: !!c.apiKey,
    model: c.model,
    assistantName: c.assistantName ?? "",
    assistantIcon: c.assistantIcon ?? "",
    hasLogo: !!c.assistantLogo,
    assistantDraggable: !!c.assistantDraggable,
  });
});

// 自定义 Logo 图片字节流（登录用户可读）。前端悬浮入口优先用此图替代内置图标。
aiRouter.get("/logo", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  const logo = getAiConfig().assistantLogo || "";
  const m = /^data:(image\/(png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=+\s]*)$/i.exec(
    logo
  );
  if (!m) return res.status(404).json({ error: "未设置 Logo" });
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  } catch {
    return res.status(404).json({ error: "Logo 数据损坏" });
  }
  if (buf.length === 0 || buf.length > 1_500_000)
    return res.status(404).json({ error: "Logo 无效或过大" });
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

// --------------------------------------------------------------- 对话 CRUD（按用户隔离）

aiRouter.get("/conversations", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  res.json(listConversations(user));
});

aiRouter.post("/conversations", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  const b = (req.body ?? {}) as { title?: string; messages?: StoredMsg[] };
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  const id = createConversation(
    user,
    typeof b.title === "string" ? b.title : "新对话",
    msgs
  );
  res.json({ id });
});

aiRouter.get("/conversations/:id", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  const conv = getConversation(req.params.id);
  if (!conv || conv.username !== user)
    return res.status(404).json({ error: "对话不存在" });
  res.json(conv);
});

aiRouter.put("/conversations/:id", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  const b = (req.body ?? {}) as { title?: string; messages?: StoredMsg[] };
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  const ok = updateConversation(
    req.params.id,
    user,
    typeof b.title === "string" ? b.title : "新对话",
    msgs
  );
  if (!ok) return res.status(404).json({ error: "对话不存在" });
  res.json({ ok: true });
});

aiRouter.delete("/conversations/:id", (req: Request, res: ExpressResponse) => {
  const user = req.auth?.username;
  if (!user) return res.status(401).json({ error: "未登录" });
  const ok = deleteConversation(req.params.id, user);
  res.json({ ok });
});

// --------------------------------------------------------------- 定时清理（保留期）
// 服务启动即跑一次，之后每天按 ai_config.conversationRetentionDays 清理过期对话。
let pruneTimer: NodeJS.Timeout | null = null;
function initConversationPruner() {
  if (pruneTimer) return; // 防止重复调度（模块被多次 import 时）
  const tick = () => {
    try {
      const days = getAiConfig().conversationRetentionDays;
      if (days > 0) {
        const removed = pruneConversations(days);
        if (removed > 0) {
          console.log(`[ai] 已自动清理 ${removed} 条超过 ${days} 天的过期 AI 对话`);
        }
      }
    } catch (e) {
      console.error("[ai] 定时清理 AI 对话失败：", e);
    }
  };
  tick(); // 启动即跑一次
  pruneTimer = setInterval(tick, 24 * 60 * 60 * 1000); // 每 24 小时
}
initConversationPruner();

// --------------------------------------------------------------- 对话（SSE）

aiRouter.post("/chat", async (req: Request, res: ExpressResponse) => {
  const config = getAiConfig();
  try {
    // 1) 全局开关
    if (!config.enabled) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.flushHeaders?.();
      sse(res, { error: "AI 助手已关闭（管理员设置）" });
      sse(res, { done: true });
      res.end();
      return;
    }

    // 2) 是否允许非管理员使用
    const role = (req.auth?.systemRole ?? "EMPLOYEE") as keyof typeof ROLE_LEVEL;
    if (!config.allowNonAdmin && ROLE_LEVEL[role] < ROLE_LEVEL["ADMIN"]) {
      return res.status(403).json({ error: "当前仅管理员可使用 AI 助手" });
    }

    const { messages, useData } = (req.body ?? {}) as {
      messages?: ChatMsg[];
      useData?: boolean;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 不能为空" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 关掉反向代理 buffering，保证流式
    res.flushHeaders?.();

    const lastUser =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    const DEFAULT_SYSTEM_PROMPT =
      "你是「AMS 行政管理系统」的内置智能助手，用简体中文、专业且简洁地回答用户关于人事、考勤、文档、待办等行政事务的问题。" +
      "若问题超出本系统范围，请礼貌说明你只负责该系统内的事务。不要编造系统中不存在的信息。";
    // 超管可在「系统设置 → AI 助手配置」中自定义大模型提示（system prompt）；
    // 留空则回退到内置默认提示，保证开箱即用。
    let system = (config.systemPrompt && config.systemPrompt.trim()) || DEFAULT_SYSTEM_PROMPT;
    let dataContext = "";
    if (useData ?? config.useDataDefault) {
      dataContext = await buildDataContext(messages, req.auth?.username);
      if (dataContext)
        system +=
          "\n\n以下是系统内与问题相关的业务数据（仅用于辅助回答，不要编造其中没有的信息）：\n" +
          dataContext;
    }

    // 3) 多轮摘要：历史太长时折叠早期对话，仅保留最近若干轮 + 摘要
    const RECENT_K = 12;
    const older =
      messages.length > RECENT_K
        ? messages.slice(0, messages.length - RECENT_K)
        : [];
    const recent =
      messages.length > RECENT_K
        ? messages.slice(messages.length - RECENT_K)
        : messages;
    let summary = "";
    if (older.length >= 6) summary = await summarizeMessages(older, config);
    if (summary) system += `\n\n【历史对话摘要】\n${summary}`;

    const ok = await streamFromUpstream(
      res,
      {
        model: config.model,
        stream: true,
        temperature: 0.3,
        messages: [{ role: "system", content: system }, ...recent],
      },
      config
    );

    if (!ok) {
      if (!config.apiKey) {
        await streamPlaceholder(res, lastUser, dataContext, summary);
      } else {
        sse(res, {
          error:
            "大模型服务暂不可用，请检查 API Base URL / API Key 配置或网络连通性。",
        });
      }
    }

    sse(res, { done: true });
    res.end();
  } catch (err) {
    try {
      sse(res, { error: "服务端处理AI请求时发生错误，请稍后重试。" });
      res.end();
    } catch {
      /* 连接已断开则忽略 */
    }
  }
});
