/**
 * 企业微信考勤接入（N1）的数据层：凭据配置、userid↔员工映射、同步游标。
 *
 * 凭据口径照抄通知出站通道（notifyDb）：掩码回显 + 回传掩码=保持原值 + CLEAR_SENTINEL 显式清除。
 * corpSecret 与 access_token 只留在服务端，任何读接口都不得回显原文（官方文档同样要求 token 不得下发前端）。
 *
 * 为什么映射要人工认领：打卡接口只认 userid，而 AMS 侧只有 EMP#### 工号；
 * 按姓名自动匹配在种子数据下会大面积错配（"员工 34" 这类名字对不上任何真实 userid），
 * 一旦错配就是把别人的打卡史灌进这个人的档案，所以宁可让人逐条确认。
 */
import { db } from "./db.ts";
import { getSetting, setSetting } from "./settingsDb.ts";
import { CLEAR_SENTINEL, MASK_SENTINEL, maskSecret } from "./notifyDb.ts";
import { type DbRow, asString, asNullableString } from "./sqliteUtil.ts";

export const SETTINGS_KEY_WECOM = "wecom_attendance";
export const SETTINGS_KEY_WECOM_STATE = "wecom_sync_state";

export const WECOM_DEFAULT_BASE_URL = "https://qyapi.weixin.qq.com";
/** 唯一允许的出站目标（本机回环除外，见 validateWeComBaseUrl） */
export const WECOM_HOST = "qyapi.weixin.qq.com";

/** 同步间隔与重叠窗口的边界（分钟）：间隔再短也只是多打几次接口，重叠是为了补企微侧的迟到数据 */
export const SYNC_INTERVAL_MIN_MINUTES = 10;
export const SYNC_OVERLAP_MAX_MINUTES = 3 * 24 * 60;

export interface WeComConfig {
  enabled: boolean;
  corpId: string;
  agentId: string;
  corpSecret: string;
  /** 接口主机；生产恒为官方地址，可指向本地 stub 做联调（见 validateWeComBaseUrl） */
  baseUrl: string;
  syncIntervalMinutes: number;
  overlapMinutes: number;
}

export function defaultWeComConfig(): WeComConfig {
  return {
    enabled: false,
    corpId: "",
    agentId: "",
    corpSecret: "",
    baseUrl: WECOM_DEFAULT_BASE_URL,
    syncIntervalMinutes: 60,
    overlapMinutes: 120,
  };
}

/** 读配置：字段级容错，缺失/非法一律回退默认，保证未配置时零副作用。 */
export function getWeComConfig(): WeComConfig {
  const d = defaultWeComConfig();
  const raw = getSetting<Partial<WeComConfig>>(SETTINGS_KEY_WECOM);
  if (!raw) return d;
  const baseUrl = typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : d.baseUrl;
  const interval = Math.trunc(Number(raw.syncIntervalMinutes));
  const overlap = Math.trunc(Number(raw.overlapMinutes));
  return {
    enabled: !!raw.enabled,
    corpId: typeof raw.corpId === "string" ? raw.corpId.trim() : "",
    agentId: typeof raw.agentId === "string" ? raw.agentId.trim() : "",
    corpSecret: typeof raw.corpSecret === "string" ? raw.corpSecret : "",
    baseUrl,
    syncIntervalMinutes:
      Number.isFinite(interval) && interval >= SYNC_INTERVAL_MIN_MINUTES ? interval : d.syncIntervalMinutes,
    overlapMinutes: Number.isFinite(overlap) && overlap >= 0 ? Math.min(overlap, SYNC_OVERLAP_MAX_MINUTES) : d.overlapMinutes,
  };
}

export function setWeComConfig(config: WeComConfig): void {
  setSetting(SETTINGS_KEY_WECOM, config);
}

/** 三样齐全才算"配好了"；缺任何一样都不该去调接口。 */
export function isWeComConfigured(cfg = getWeComConfig()): boolean {
  return !!(cfg.corpId && cfg.corpSecret && cfg.baseUrl);
}

/** 给前端面板的视图：corpSecret 打码。 */
export function maskedWeComConfig(): WeComConfig {
  const c = getWeComConfig();
  return { ...c, corpSecret: maskSecret(c.corpSecret) };
}

/**
 * 合并 PUT 入参：回传掩码串或空串 = 保持原密钥；等于 CLEAR_SENTINEL 才清空。
 * baseUrl 单独校验（见 validateWeComBaseUrl），非法即抛错让路由回 400——
 * 这一条是服务端出站请求的目标地址，不能随便进库。
 */
export function mergeWeComConfig(input: Partial<WeComConfig>): WeComConfig {
  const cur = getWeComConfig();
  const keepSecret = !input.corpSecret || input.corpSecret === MASK_SENTINEL || input.corpSecret.includes(MASK_SENTINEL);
  const baseUrl = input.baseUrl === undefined ? cur.baseUrl : validateWeComBaseUrl(input.baseUrl);
  const interval = Math.trunc(Number(input.syncIntervalMinutes ?? cur.syncIntervalMinutes));
  const overlap = Math.trunc(Number(input.overlapMinutes ?? cur.overlapMinutes));
  return {
    // 缺键表示「本次不改」，不能让部分提交（例如只切开关的 PUT）把别的字段静默清零
    enabled: input.enabled === undefined ? cur.enabled : !!input.enabled,
    corpId: input.corpId !== undefined ? String(input.corpId).trim() : cur.corpId,
    agentId: input.agentId !== undefined ? String(input.agentId).trim() : cur.agentId,
    corpSecret: input.corpSecret === CLEAR_SENTINEL ? "" : keepSecret ? cur.corpSecret : String(input.corpSecret),
    baseUrl,
    syncIntervalMinutes:
      Number.isFinite(interval) && interval >= SYNC_INTERVAL_MIN_MINUTES ? interval : cur.syncIntervalMinutes,
    overlapMinutes: Number.isFinite(overlap) && overlap >= 0 ? Math.min(overlap, SYNC_OVERLAP_MAX_MINUTES) : cur.overlapMinutes,
  };
}

/**
 * baseUrl 只允许官方 https 域，或本机回环地址（后者是为了能在本地拿假企微服务联调整条链路）。
 * 外网 http、带 path/query/userinfo 的地址一律拒：这条 URL 决定服务端往哪儿发带凭据的请求。
 */
export function validateWeComBaseUrl(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return WECOM_DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WeComConfigError("接口地址不是合法 URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WeComConfigError("接口地址必须是 http(s)");
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback && url.protocol !== "https:") throw new WeComConfigError("非本机地址必须使用 https");
  // 不是格式洁癖：这个地址会收到带 corpSecret 的出站请求，放行"任意 https 主机"
  // 等于给 qyapi.weixin.qq.com.evil.test 这类形近域名留口子。要换网关应当改这里的白名单。
  if (!loopback && url.hostname !== WECOM_HOST) {
    throw new WeComConfigError(`接口地址只能是 ${WECOM_HOST}（本机联调可用 127.0.0.1 / localhost）`);
  }
  if (url.username || url.password) throw new WeComConfigError("接口地址不得包含账号密码");
  if (url.search) throw new WeComConfigError("接口地址不得包含查询参数");
  const portPart = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${url.hostname}${portPart}`.replace(/\/+$/u, "");
}

export class WeComConfigError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "WeComConfigError";
  }
}

// ---------------------------------------------------------------- 成员映射

db.exec(`
  CREATE TABLE IF NOT EXISTS wecom_bindings (
    wecomUserId TEXT PRIMARY KEY,
    employeeId  TEXT,
    firstSeenAt TEXT DEFAULT (datetime('now','localtime')),
    lastSeenAt  TEXT,
    boundAt     TEXT,
    boundBy     TEXT NOT NULL DEFAULT ''
  );
  -- 一个员工只能对应一个企微账号：两条映射等于把两个人的打卡灌进同一个人，
  -- 与账号↔员工的唯一绑定（migrate v10）同口径。待认领行 employeeId 为 NULL，不受约束。
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wecom_bindings_employee
    ON wecom_bindings(employeeId) WHERE employeeId IS NOT NULL AND employeeId <> '';
`);

export interface WeComBindingRow {
  wecomUserId: string;
  employeeId: string | null;
  employeeName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  boundAt: string;
  boundBy: string;
}

function rowToBinding(row: DbRow): WeComBindingRow {
  return {
    wecomUserId: asString(row.wecomUserId),
    employeeId: asNullableString(row.employeeId),
    employeeName: asString(row.employeeName),
    firstSeenAt: asString(row.firstSeenAt),
    lastSeenAt: asString(row.lastSeenAt),
    boundAt: asString(row.boundAt),
    boundBy: asString(row.boundBy),
  };
}

/** 联查档案姓名：employees 由 db.ts 在建表前就位，这张表不可能缺失（本模块就 import 了 db.ts）。 */
export function listWeComBindings(): WeComBindingRow[] {
  return db
    .prepare(
      `SELECT b.*, e.name AS employeeName
         FROM wecom_bindings b
         LEFT JOIN employees e ON e.id = b.employeeId
        ORDER BY (b.employeeId IS NOT NULL), b.wecomUserId`
    )
    .all()
    .map((row) => rowToBinding(row as DbRow));
}

/** 待认领（同步见过但还没归属的 userid） */
export function listPendingBindings(): WeComBindingRow[] {
  return listWeComBindings().filter((b) => !b.employeeId);
}

/** 同步要请求的 userid 全集：含待认领——不然新 userid 的第一笔数据永远拉不到，也就永远认领不了 */
export function listKnownUserIds(): string[] {
  return db
    .prepare("SELECT wecomUserId FROM wecom_bindings ORDER BY wecomUserId")
    .all()
    .map((row) => asString((row as DbRow).wecomUserId));
}

export function resolveBinding(wecomUserId: string): string | null {
  const row = db.prepare("SELECT employeeId FROM wecom_bindings WHERE wecomUserId = ?").get(wecomUserId) as
    | { employeeId: string | null }
    | undefined;
  return row ? asNullableString(row.employeeId) : null;
}

export function upsertWeComBinding(input: {
  wecomUserId: string;
  employeeId: string | null;
  operator?: string;
}): WeComBindingRow | null {
  const existing = db
    .prepare("SELECT wecomUserId FROM wecom_bindings WHERE wecomUserId = ?")
    .get(input.wecomUserId);
  if (existing) {
    db.prepare(
      `UPDATE wecom_bindings
          SET employeeId = ?,
              boundAt = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now','localtime') END,
              boundBy = CASE WHEN ? IS NULL THEN '' ELSE ? END
        WHERE wecomUserId = ?`
    ).run(input.employeeId, input.employeeId, input.employeeId, input.operator ?? "", input.wecomUserId);
  } else {
    db.prepare(
      `INSERT INTO wecom_bindings (wecomUserId, employeeId, boundAt, boundBy)
       VALUES (?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now','localtime') END, ?)`
    ).run(input.wecomUserId, input.employeeId, input.employeeId, input.employeeId ? (input.operator ?? "") : "");
  }
  return listWeComBindings().find((b) => b.wecomUserId === input.wecomUserId) ?? null;
}

/** 同步/预览过程中"见过"某个 userid：没登记过的补一行待认领，已登记只刷新最近出现时间。 */
export function markBindingSeen(wecomUserIds: string[]): void {
  for (const id of wecomUserIds) {
    db.prepare(
      `INSERT INTO wecom_bindings (wecomUserId, lastSeenAt)
       VALUES (?, datetime('now','localtime'))
       ON CONFLICT(wecomUserId) DO UPDATE SET lastSeenAt = datetime('now','localtime')`
    ).run(id);
  }
}

export function deleteWeComBinding(wecomUserId: string): boolean {
  return db.prepare("DELETE FROM wecom_bindings WHERE wecomUserId = ?").run(wecomUserId).changes > 0;
}

/**
 * 该员工是否已被别的 userid 认领 —— 用来把唯一索引冲突翻成可读的 400，
 * 而不是让前端看到一句 500。
 */
export function findEmployeeClaim(employeeId: string, exceptUserId = ""): string | null {
  const row = db
    .prepare("SELECT wecomUserId FROM wecom_bindings WHERE employeeId = ? AND wecomUserId <> ?")
    .get(employeeId, exceptUserId) as DbRow | undefined;
  return row ? asString(row.wecomUserId) : null;
}

// ---------------------------------------------------------------- 同步游标

export interface WeComSyncState {
  /** 已同步到的时间点（Unix 秒）；下一轮从 cursor - overlapMinutes 起拉 */
  cursorAt: number | null;
  lastSyncAt: string | null;
  lastReport: Record<string, unknown> | null;
  /** 员工工号未绑定账号时不阻断同步，这里记一笔「映射好了但档案里查无此人」的 userid */
  lastErrors: string[];
}

export function getWeComSyncState(): WeComSyncState {
  const raw = getSetting<Partial<WeComSyncState>>(SETTINGS_KEY_WECOM_STATE);
  return {
    cursorAt: typeof raw?.cursorAt === "number" ? raw.cursorAt : null,
    lastSyncAt: typeof raw?.lastSyncAt === "string" ? raw.lastSyncAt : null,
    lastReport: raw?.lastReport && typeof raw.lastReport === "object" ? (raw.lastReport as Record<string, unknown>) : null,
    lastErrors: Array.isArray(raw?.lastErrors) ? (raw?.lastErrors as string[]) : [],
  };
}

export function setWeComSyncState(patch: Partial<WeComSyncState>): WeComSyncState {
  const next = { ...getWeComSyncState(), ...patch };
  setSetting(SETTINGS_KEY_WECOM_STATE, next);
  return next;
}
