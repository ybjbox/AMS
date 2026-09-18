/**
 * 审计日志数据层（P1-5）。
 *
 * 背景：原先「系统日志」是前端内存里的三条硬编码假数据，刷新即失——
 * 谁改了谁的薪资、谁删了合同，查无对证，不满足等保 / ISO 27001 的操作留痕要求。
 *
 * 这里提供一张**只增不改不删**的 audit_logs 表：
 *   actor / actorRole  谁做的
 *   action / category  做了什么
 *   target*            对谁做的
 *   beforeJson/afterJson/changesJson  改成了什么（字段级差异）
 *   ip / ua / at / status / durationMs 从哪做的、成没成功、花了多久
 *
 * 设计要点：
 * 1. **写入永不抛错**。审计失败不能反过来把业务请求搞挂，出错只打印告警。
 * 2. **落库前脱敏**。密码类字段直接丢弃，身份证/手机号做掩码，超长内容截断，
 *    避免审计表本身变成一个新的敏感信息泄露面（这点在回归里有断言）。
 * 3. **没有删除接口**。仅提供按保留期的自动清理（默认 180 天），
 *    并且清理动作本身也会留一条 system.retention_prune 记录。
 *
 * 列名用 beforeJson / afterJson 而不是 before / after：
 * BEFORE / AFTER 在 SQLite 里是触发器保留字，避免每次查询都要加引号。
 */
import { db, onDbReload } from "./db.ts";
import { type DbRow, asString, asNumber } from "./sqliteUtil.ts";

// ---------------------------------------------------------------- 表结构

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actor       TEXT DEFAULT '',
    actorRole   TEXT DEFAULT '',
    action      TEXT NOT NULL,
    category    TEXT DEFAULT '其他',
    level       TEXT DEFAULT 'INFO',
    method      TEXT DEFAULT '',
    path        TEXT DEFAULT '',
    targetType  TEXT DEFAULT '',
    targetId    TEXT DEFAULT '',
    targetName  TEXT DEFAULT '',
    status      INTEGER DEFAULT 0,
    result      TEXT DEFAULT 'success',
    ip          TEXT DEFAULT '',
    ua          TEXT DEFAULT '',
    beforeJson  TEXT,
    afterJson   TEXT,
    changesJson TEXT,
    detail      TEXT DEFAULT '',
    durationMs  INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at       ON audit_logs(at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs(actor);
  CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(category);
  CREATE INDEX IF NOT EXISTS idx_audit_level    ON audit_logs(level);
`);

// ---------------------------------------------------------------- 脱敏

/** 这些字段一律不落库，直接替换成占位符 */
const SECRET_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "oldpassword",
  "passwordhash",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "secret",
  "authorization",
  "cookie",
  // LLM/第三方服务凭据：/api/ai/config 的 PATCH 体会原样进审计，必须丢弃
  "apikey",
  "api_key",
  "clientsecret",
  "client_secret",
  // 通知出站：/api/notify/config 的 webhook 对象含带 access_token 的完整回调地址，整体丢弃
  "webhook",
]);

/** 这些字段体积可能极大（脚本正文、base64 文件），只留长度信息 */
const BULKY_KEYS = new Set(["code", "filedata", "base64", "content", "buffer", "fileContent"]);

/** 需要掩码的个人敏感信息 */
function maskValue(key: string, value: string): string {
  const k = key.toLowerCase();
  if (k === "idcard" && value.length >= 10) {
    return `${value.slice(0, 6)}${"*".repeat(value.length - 10)}${value.slice(-4)}`;
  }
  if (k === "phone" && value.length >= 7) {
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }
  if (k === "email" && value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return value;
}

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;

/** 递归脱敏：密码丢弃、大字段折叠、身份证手机号掩码、数组截断 */
export function sanitize(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth > MAX_DEPTH) return "[深层对象已省略]";

  if (Array.isArray(input)) {
    const head = input.slice(0, MAX_ARRAY_ITEMS).map((v) => sanitize(v, depth + 1));
    if (input.length > MAX_ARRAY_ITEMS) head.push(`…共 ${input.length} 项，已截断`);
    return head;
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const k = key.toLowerCase();
      if (SECRET_KEYS.has(k)) {
        out[key] = "[已脱敏]";
      } else if (BULKY_KEYS.has(k) && typeof value === "string") {
        out[key] = `[内容 ${value.length} 字符，已省略]`;
      } else if (typeof value === "string") {
        out[key] = maskValue(key, value);
      } else {
        out[key] = sanitize(value, depth + 1);
      }
    }
    return out;
  }

  return input;
}

const MAX_JSON_CHARS = 4000;

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const text = JSON.stringify(sanitize(value));
    if (!text) return null;
    return text.length > MAX_JSON_CHARS
      ? `${text.slice(0, MAX_JSON_CHARS)}…[已截断]`
      : text;
  } catch {
    return null;
  }
}

/**
 * 计算字段级差异，只保留真正变化的键。
 * 返回 null 表示没有可比较的快照（例如新建 / 删除）。
 */
export function diffKeys(before: unknown, after: unknown): string[] | null {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === "updatedAt" || key === "version") continue; // 系统列，噪音
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changed.push(key);
  }
  return changed;
}

// ---------------------------------------------------------------- 写入

export type AuditLevel = "INFO" | "WARN" | "ERROR";

export interface AuditEntry {
  actor?: string;
  actorRole?: string;
  action: string;
  category?: string;
  level?: AuditLevel;
  method?: string;
  path?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  status?: number;
  ip?: string;
  ua?: string;
  before?: unknown;
  after?: unknown;
  changes?: string[] | null;
  detail?: string;
  durationMs?: number;
}

const INSERT_AUDIT_SQL = `
  INSERT INTO audit_logs (
    actor, actorRole, action, category, level, method, path,
    targetType, targetId, targetName, status, result, ip, ua,
    beforeJson, afterJson, changesJson, detail, durationMs
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
let insertStmt = db.prepare(INSERT_AUDIT_SQL);
// 恢复备份会热重载数据库连接，这里把模块级缓存的 statement 重新 prepare，
// 否则它会指向已被关闭的旧连接，导致后续审计写入全部失败。
onDbReload(() => {
  insertStmt = db.prepare(INSERT_AUDIT_SQL);
});

/** 落一条审计记录。任何异常都被吞掉——审计不能拖垮业务。 */
export function writeAuditLog(entry: AuditEntry): void {
  try {
    const status = Number(entry.status ?? 0);
    const level: AuditLevel =
      entry.level ?? (status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO");
    const changes = entry.changes ?? diffKeys(entry.before, entry.after);

    insertStmt.run(
      entry.actor ?? "",
      entry.actorRole ?? "",
      entry.action,
      entry.category ?? "其他",
      level,
      entry.method ?? "",
      (entry.path ?? "").slice(0, 300),
      entry.targetType ?? "",
      String(entry.targetId ?? "").slice(0, 120),
      String(entry.targetName ?? "").slice(0, 200),
      status,
      status === 0 || status < 400 ? "success" : "failure",
      entry.ip ?? "",
      (entry.ua ?? "").slice(0, 300),
      toJson(entry.before),
      toJson(entry.after),
      changes && changes.length ? JSON.stringify(changes) : null,
      String(entry.detail ?? "").slice(0, 800),
      Math.max(0, Math.round(entry.durationMs ?? 0))
    );
  } catch (e) {
    console.warn("[audit] 审计日志写入失败:", e);
  }
}

// ---------------------------------------------------------------- 查询

export interface AuditQuery {
  q?: string;
  level?: string;
  category?: string;
  actor?: string;
  action?: string;
  result?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  category: string;
  level: AuditLevel;
  method: string;
  path: string;
  targetType: string;
  targetId: string;
  targetName: string;
  status: number;
  result: string;
  ip: string;
  ua: string;
  before: unknown;
  after: unknown;
  changes: string[] | null;
  detail: string;
  durationMs: number;
}

function buildWhere(query: AuditQuery): { sql: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.level && query.level !== "ALL") {
    clauses.push("level = ?");
    params.push(query.level);
  }
  if (query.category && query.category !== "ALL") {
    clauses.push("category = ?");
    params.push(query.category);
  }
  if (query.result && query.result !== "ALL") {
    clauses.push("result = ?");
    params.push(query.result);
  }
  if (query.actor) {
    clauses.push("actor LIKE ?");
    params.push(`%${query.actor}%`);
  }
  if (query.action) {
    clauses.push("action = ?");
    params.push(query.action);
  }
  if (query.from) {
    clauses.push("at >= ?");
    params.push(query.from);
  }
  if (query.to) {
    // 传日期（YYYY-MM-DD）时补到当天结束，避免「选了今天却查不到今天」
    clauses.push("at <= ?");
    params.push(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to} 23:59:59` : query.to);
  }
  if (query.q) {
    clauses.push(
      "(action LIKE ? OR actor LIKE ? OR targetName LIKE ? OR targetId LIKE ? OR detail LIKE ? OR path LIKE ?)"
    );
    const like = `%${query.q}%`;
    params.push(like, like, like, like, like, like);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function parseJson(text: unknown): unknown {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text; // 被截断的 JSON 直接原样返回，前端按纯文本展示
  }
}

function toAuditRow(row: DbRow): AuditRow {
  return {
    id: asNumber(row.id),
    at: asString(row.at),
    actor: asString(row.actor),
    actorRole: asString(row.actorRole),
    action: asString(row.action),
    category: asString(row.category),
    level: asString(row.level) as AuditLevel,
    method: asString(row.method),
    path: asString(row.path),
    targetType: asString(row.targetType),
    targetId: asString(row.targetId),
    targetName: asString(row.targetName),
    status: asNumber(row.status),
    result: asString(row.result),
    ip: asString(row.ip),
    ua: asString(row.ua),
    before: parseJson(asString(row.beforeJson)),
    after: parseJson(asString(row.afterJson)),
    changes: parseJson(asString(row.changesJson)) as string[] | null,
    detail: asString(row.detail),
    durationMs: asNumber(row.durationMs),
  };
}

export function queryAuditLogs(query: AuditQuery = {}): {
  total: number;
  items: AuditRow[];
  levels: Record<string, number>;
} {
  const { sql: where, params } = buildWhere(query);
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 500);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const total = asNumber(db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${where}`).get(...params)?.c);

  const rows = db
    .prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  // 等级分布用于顶部统计卡片，沿用同一批过滤条件
  const levelRows = db
    .prepare(`SELECT level, COUNT(*) AS c FROM audit_logs ${where} GROUP BY level`)
    .all(...params)
    .map((r) => ({ level: asString(r.level), c: asNumber(r.c) }));
  const levels: Record<string, number> = { INFO: 0, WARN: 0, ERROR: 0 };
  for (const r of levelRows) levels[r.level] = r.c;

  return { total, items: rows.map(toAuditRow), levels };
}

/** 过滤下拉框的可选值 */
export function auditFacets(): { actions: string[]; categories: string[]; actors: string[] } {
  const pick = (sql: string, key: string) =>
    db
      .prepare(sql)
      .all()
      .map((r) => asString(r[key]))
      .filter((v) => v !== "");
  return {
    actions: pick("SELECT DISTINCT action FROM audit_logs ORDER BY action", "action"),
    categories: pick("SELECT DISTINCT category FROM audit_logs ORDER BY category", "category"),
    actors: pick(
      "SELECT actor, COUNT(*) c FROM audit_logs WHERE actor != '' GROUP BY actor ORDER BY c DESC LIMIT 50",
      "actor"
    ),
  };
}

/** 导出用：不分页，但硬上限防止把内存打爆 */
export function exportAuditLogs(query: AuditQuery = {}, cap = 10000): AuditRow[] {
  const { sql: where, params } = buildWhere(query);
  const rows = db
    .prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params, cap);
  return rows.map(toAuditRow);
}

// ---------------------------------------------------------------- 保留期

/**
 * 按保留期清理历史记录。这是**唯一**的删除入口，
 * 没有对外暴露「清空日志」按钮——审计表必须只增。
 */
export function pruneAuditLogs(retentionDays = Number(process.env.AUDIT_RETENTION_DAYS) || 180): number {
  const days = Math.max(Number(retentionDays) || 180, 7);
  try {
    const info = db
      .prepare(`DELETE FROM audit_logs WHERE at < datetime('now','localtime',?)`)
      .run(`-${days} days`);
    const removed = Number(info.changes ?? 0);
    if (removed > 0) {
      writeAuditLog({
        actor: "system",
        actorRole: "SYSTEM",
        action: "system.retention_prune",
        category: "系统",
        level: "INFO",
        status: 200,
        detail: `按 ${days} 天保留期清理了 ${removed} 条历史审计记录`,
      });
      console.log(`[audit] 保留期清理：删除 ${removed} 条 ${days} 天前的记录`);
    }
    return removed;
  } catch (e) {
    console.warn("[audit] 保留期清理失败:", e);
    return 0;
  }
}

export function auditLogCount(): number {
  return asNumber(db.prepare("SELECT COUNT(*) AS c FROM audit_logs").get()?.c);
}
