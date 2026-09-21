import type { Request, Response } from "express";
import { getAiConfig, quotaLimitForRole, type AiConfig } from "./aiConfigDb.ts";
import { getUserAiConfig, isUserAiConfigUsable, getUsageToday, incrementUsage } from "./aiUserDb.ts";
import { ROLE_LEVEL } from "./authDb.ts";

/**
 * AI 能力共用准入层。
 *
 * 微信通知生成器与业务单润色都要求同一套策略：
 * enabled 总开关 → 管理员限制 → 个人模型优先（免额度）→ 系统模型按角色档位限额。
 * 集中在此以免两处漂移出不同的安全边界。
 */

export type GateResult =
  | { ok: true; config: AiConfig; effective: AiConfig }
  | { ok: false; status: number; error: string };

/** 准入判定（无 res 版，供异步任务与需要自定义错误处理的路由共用） */
export function gateCore(req: Request): GateResult {
  const config = getAiConfig();
  if (!config.enabled) {
    return { ok: false, status: 400, error: "AI 功能未启用，请先在系统设置 → AI 配置中开启" };
  }
  const user = req.auth?.username ?? "";
  const own = user ? getUserAiConfig(user) : null;
  const useOwn = config.allowPersonalModel && isUserAiConfigUsable(own);
  if (!useOwn && !config.apiKey) {
    return { ok: false, status: 400, error: "未配置模型 API Key，请先在系统设置 → AI 配置中填写" };
  }
  const role = (req.auth?.systemRole ?? "EMPLOYEE") as keyof typeof ROLE_LEVEL;
  if (!config.allowNonAdmin && ROLE_LEVEL[role] < ROLE_LEVEL["ADMIN"]) {
    return { ok: false, status: 403, error: "当前仅管理员可使用 AI 功能" };
  }
  const effective: AiConfig = useOwn
    ? { ...config, baseUrl: own!.baseUrl.trim(), apiKey: own!.apiKey.trim(), model: own!.model.trim() }
    : config;
  return { ok: true, config, effective };
}

/** 准入判定（已回错误响应版），返回 null 表示已处理完毕 */
export function gate(req: Request, res: Response): { config: AiConfig; effective: AiConfig; useOwn: boolean } | null {
  const r = gateCore(req);
  if (!r.ok) {
    res.status(r.status).json({ error: r.error });
    return null;
  }
  const user = req.auth?.username ?? "";
  const useOwn =
    r.config.allowPersonalModel && isUserAiConfigUsable(getUserAiConfig(user));
  return { config: r.config, effective: r.effective, useOwn };
}

/** 额度检查并计数（无 res 版，按用户角色档位）。超额返回错误文案。 */
export function tryChargeQuota(
  user: string,
  role: string | null | undefined,
  config: AiConfig
): string | null {
  if (config.allowPersonalModel && isUserAiConfigUsable(getUserAiConfig(user))) {
    return null; // 个人模型：不计数
  }
  const quota = quotaLimitForRole(config, role);
  if (quota > 0 && getUsageToday(user) >= quota) {
    return `今日系统额度已用尽（本档位限额 ${quota} 次/天）。可配置个人模型继续使用（使用自有凭据，不受系统额度限制），或待次日额度重置。`;
  }
  incrementUsage(user); // 与 /chat 一致：走系统模型一律计数，不限额档位也计数
  return null;
}

/** 系统每日额度检查并计数（个人模型免额度）。超额时已回 429，返回 false。 */
export function chargeQuota(req: Request, res: Response, config: AiConfig): boolean {
  const err = tryChargeQuota(req.auth?.username ?? "", req.auth?.systemRole, config);
  if (err) {
    res.status(429).json({ error: err });
    return false;
  }
  return true;
}

/** 调用 OpenAI 兼容对话接口，返回首个 choice 的文本内容 */
export async function callModel(
  config: AiConfig,
  userContent: string | unknown[],
  systemPrompt: string
): Promise<string> {
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
          { role: "system", content: systemPrompt },
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
