import { db, onDbReload } from "./db.ts";

/**
 * AI 助手运行配置（仅超级管理员可写）。
 *
 * 设计：配置存在数据库单行（id=1），与进程环境变量合并——
 * 数据库有值优先用数据库的，数据库为空则回退到环境变量。
 * 这样管理员无需重启服务即可在「系统设置 → AI 助手配置」里调整，
 * 同时也兼容部署时通过环境变量注入密钥的方式。
 *
 * 安全：apiKey 属敏感凭据，数据库以明文存储（单租户内部管理工具，可接受），
 * 读取接口会做脱敏（仅超管可见，且返回掩码）。
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_config (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    enabled       INTEGER NOT NULL DEFAULT 1,
    allowNonAdmin INTEGER NOT NULL DEFAULT 1,
    useDataDefault INTEGER NOT NULL DEFAULT 1,
    baseUrl       TEXT DEFAULT '',
    model         TEXT DEFAULT '',
    apiKey        TEXT DEFAULT '',
    assistantDraggable INTEGER NOT NULL DEFAULT 0,
    conversationRetentionDays INTEGER NOT NULL DEFAULT 0
  );
`);

// 兼容老库：补 systemPrompt 列（SQLite 不支持 ADD COLUMN IF NOT EXISTS，故先探列）。
try {
  const cols = db.prepare(`PRAGMA table_info(ai_config)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "systemPrompt")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN systemPrompt TEXT DEFAULT ''`);
  }
  // 兼容老库：补助手名称 / 图标列（用于前端可配置入口图标与标题）。
  if (!cols.some((c) => c.name === "assistantName")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN assistantName TEXT DEFAULT ''`);
  }
  if (!cols.some((c) => c.name === "assistantIcon")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN assistantIcon TEXT DEFAULT ''`);
  }
  // 兼容老库：补助手 Logo（自定义上传图片的 base64 data URL）
  if (!cols.some((c) => c.name === "assistantLogo")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN assistantLogo TEXT DEFAULT ''`);
  }
  // 兼容老库：补助手入口是否可自由拖动（贴右侧上下移动）
  if (!cols.some((c) => c.name === "assistantDraggable")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN assistantDraggable INTEGER NOT NULL DEFAULT 0`);
  }
  // 兼容老库：补 AI 对话历史自动清理保留天数（0 = 不自动清理）
  if (!cols.some((c) => c.name === "conversationRetentionDays")) {
    db.exec(`ALTER TABLE ai_config ADD COLUMN conversationRetentionDays INTEGER NOT NULL DEFAULT 0`);
  }
} catch {
  /* 表不存在等异常时忽略，交由上层建表逻辑处理 */
}

const GET_SQL = `SELECT enabled, allowNonAdmin, useDataDefault, baseUrl, model, apiKey, systemPrompt, assistantName, assistantIcon, assistantLogo, assistantDraggable, conversationRetentionDays FROM ai_config WHERE id = 1`;
let getStmt = db.prepare(GET_SQL);

const UPSERT_SQL = `INSERT INTO ai_config (id, enabled, allowNonAdmin, useDataDefault, baseUrl, model, apiKey, systemPrompt, assistantName, assistantIcon, assistantLogo, assistantDraggable, conversationRetentionDays)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    enabled=excluded.enabled, allowNonAdmin=excluded.allowNonAdmin, useDataDefault=excluded.useDataDefault,
    baseUrl=excluded.baseUrl, model=excluded.model, apiKey=excluded.apiKey, systemPrompt=excluded.systemPrompt,
    assistantName=excluded.assistantName, assistantIcon=excluded.assistantIcon, assistantLogo=excluded.assistantLogo,
    assistantDraggable=excluded.assistantDraggable, conversationRetentionDays=excluded.conversationRetentionDays`;
let upsertStmt = db.prepare(UPSERT_SQL);

onDbReload(() => {
  getStmt = db.prepare(GET_SQL);
  upsertStmt = db.prepare(UPSERT_SQL);
});

export interface AiConfig {
  enabled: boolean;
  allowNonAdmin: boolean;
  useDataDefault: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  assistantName: string;
  assistantIcon: string;
  assistantLogo: string;
  assistantDraggable: boolean;
  conversationRetentionDays: number;
}

function envDefaults() {
  return {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

/** 读配置：数据库值优先，空则回退环境变量。 */
export function getAiConfig(): AiConfig {
  const env = envDefaults();
  const row = getStmt.get() as any;
  if (!row) {
    return { enabled: true, allowNonAdmin: true, useDataDefault: true, systemPrompt: "", assistantName: "", assistantIcon: "", assistantLogo: "", assistantDraggable: false, conversationRetentionDays: 0, ...env };
  }
  return {
    enabled: !!row.enabled,
    allowNonAdmin: !!row.allowNonAdmin,
    useDataDefault: !!row.useDataDefault,
    baseUrl: row.baseUrl || env.baseUrl,
    model: row.model || env.model,
    apiKey: row.apiKey || env.apiKey,
    systemPrompt: typeof row.systemPrompt === "string" ? row.systemPrompt : "",
    assistantName: typeof row.assistantName === "string" ? row.assistantName : "",
    assistantIcon: typeof row.assistantIcon === "string" ? row.assistantIcon : "",
    assistantLogo: typeof row.assistantLogo === "string" ? row.assistantLogo : "",
    assistantDraggable: !!row.assistantDraggable,
    conversationRetentionDays: Number.isFinite(row.conversationRetentionDays) ? row.conversationRetentionDays : 0,
  };
}

/** 写配置：仅更新传入字段，其余保持现状。 */
export function setAiConfig(p: Partial<AiConfig>): AiConfig {
  const cur = getAiConfig();
  const next: AiConfig = {
    enabled: p.enabled ?? cur.enabled,
    allowNonAdmin: p.allowNonAdmin ?? cur.allowNonAdmin,
    useDataDefault: p.useDataDefault ?? cur.useDataDefault,
    baseUrl: p.baseUrl ?? cur.baseUrl,
    model: p.model ?? cur.model,
    apiKey: p.apiKey !== undefined ? p.apiKey : cur.apiKey,
    systemPrompt: p.systemPrompt !== undefined ? p.systemPrompt : cur.systemPrompt,
    assistantName: p.assistantName !== undefined ? p.assistantName : cur.assistantName,
    assistantIcon: p.assistantIcon !== undefined ? p.assistantIcon : cur.assistantIcon,
    assistantLogo: p.assistantLogo !== undefined ? p.assistantLogo : cur.assistantLogo,
    assistantDraggable: p.assistantDraggable !== undefined ? p.assistantDraggable : cur.assistantDraggable,
    conversationRetentionDays: p.conversationRetentionDays !== undefined ? p.conversationRetentionDays : cur.conversationRetentionDays,
  };
  upsertStmt.run(
    next.enabled ? 1 : 0,
    next.allowNonAdmin ? 1 : 0,
    next.useDataDefault ? 1 : 0,
    next.baseUrl,
    next.model,
    next.apiKey,
    next.systemPrompt,
    next.assistantName,
    next.assistantIcon,
    next.assistantLogo,
    next.assistantDraggable ? 1 : 0,
    next.conversationRetentionDays | 0
  );
  return next;
}
