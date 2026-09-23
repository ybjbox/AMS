/**
 * 企业微信考勤接口客户端（N1）。
 *
 * 官方硬限制（docs/WECOM-ATTENDANCE-INTEGRATION.md）都在这里落地：
 *  - getcheckindata 单次跨度 ≤30 天 → 按 29 天分段；
 *  - useridlist ≤100 → 分批；
 *  - access_token 有效期 7200 秒且必须缓存（频繁 gettoken 会被频率拦截）→ 模块级缓存 + 提前 5 分钟续期，
 *    遇到 token 失效错误码（40014/42001）自动重取一次并重试该次调用。
 *
 * 合规决定（2026-09-23）：只取上下班打卡（opencheckindatatype 固定为 1，不开放配置），
 * 并且**在客户端边界就把 lat/lng/wifimac/deviceid/mediaids/location/notes 全部丢掉** ——
 * 敏感字段不进入返回值，就不可能经由预览报告、日志或落库任何一条路径泄露出去。
 */
import type { WeComConfig } from "./wecomDb.ts";

/** 打卡数据类型：1=上下班，2=外出，3=全部。本系统只取 1。 */
export const CHECKIN_DATA_TYPE = 1;
const MAX_WINDOW_DAYS = 29;
const MAX_USERIDS_PER_CALL = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;

/** 一次打卡事件（已裁剪到最小必要字段） */
export interface WeComPunch {
  wecomUserId: string;
  /** YYYY-MM-DD（服务器本地时区，与考勤其余链路同口径） */
  date: string;
  /** HH:mm:ss —— 秒位固定 :00，与 Excel 导入通道同形（唯一键到分钟，写 HH:mm 会让同一分钟认成两条） */
  time: string;
  /** 企业微信侧该次打卡的稳定标识，用于 externalId 溯源 */
  sign: string;
}

export class WeComApiError extends Error {
  status: number;
  constructor(
    readonly errcode: number,
    message: string
  ) {
    super(message);
    this.name = "WeComApiError";
    this.status = 502;
  }
}

/** 已知错误码翻成可操作的中文；其余保留企业微信原文，别让排查线索被吞掉。 */
export function describeWeComError(errcode: number, errmsg: string): string {
  switch (errcode) {
    case 60020:
      return "企业微信拒绝了本次请求：调用方 IP 不在应用的可信 IP 列表里（60020）。请在企业微信管理后台把本机出口 IP 加进去。";
    case 40001:
    case 40014:
    case 42001:
      return `access_token 无效或已过期（${errcode}），请检查 corpid / 应用 Secret 是否配对：${errmsg}`;
    case 45009:
      return "触发企业微信接口频率限制（45009），请拉长同步间隔或缩小一次拉取的人数。";
    case 301011:
    case 93001:
      return `应用没有取打卡数据的权限（${errcode}）：请在企业微信后台把本应用配置到「打卡 → 可调用接口的应用」。`;
    case 40013:
      return "corpid 不合法（40013），请检查「我的企业」页面底部的企业 ID。";
    default:
      return `企业微信接口错误 ${errcode}：${errmsg}`;
  }
}

// ---------------------------------------------------------------- token 缓存

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

function cacheKey(cfg: WeComConfig): string {
  return `${cfg.baseUrl}|${cfg.corpId}|${cfg.agentId}|${cfg.corpSecret}`;
}

/** 测试与「改了 Secret」后用：丢掉缓存，下一次强制重新换 token。 */
export function resetWeComTokenCache(key?: string): void {
  if (key === undefined) tokenCache.clear();
  else tokenCache.delete(key);
}

async function requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    throw new WeComApiError(-1, `无法连接企业微信接口（${url.replace(/\/\/[^/]+\//u, "//…/")}）：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new WeComApiError(-1, `企业微信接口返回 HTTP ${res.status}`);
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new WeComApiError(-1, "企业微信接口返回的不是 JSON（可能被代理或登录页拦截）");
  }
}

export async function getWeComAccessToken(cfg: WeComConfig, force = false): Promise<string> {
  const key = cacheKey(cfg);
  if (!force) {
    const hit = tokenCache.get(key);
    if (hit && hit.expiresAt - TOKEN_REFRESH_AHEAD_MS > Date.now()) return hit.token;
  }
  const q = new URLSearchParams({ corpid: cfg.corpId, corpsecret: cfg.corpSecret });
  const body = await requestJson(`${cfg.baseUrl}/cgi-bin/gettoken?${q.toString()}`, { method: "GET" });
  const errcode = Number(body.errcode ?? 0);
  if (errcode !== 0) throw new WeComApiError(errcode, describeWeComError(errcode, String(body.errmsg ?? "")));
  const token = String(body.access_token ?? "");
  if (!token) throw new WeComApiError(-1, "企业微信返回了空的 access_token");
  const expiresIn = Number(body.expires_in ?? 7200);
  tokenCache.set(key, { token, expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 7200) * 1000 });
  return token;
}

// ---------------------------------------------------------------- 纯分段逻辑

/** 把 [start,end] 切成不超过 maxDays 天的段；起止都按秒，段间首尾相接不重不漏。 */
export function splitWindows(start: number, end: number, maxDays = MAX_WINDOW_DAYS): Array<[number, number]> {
  const maxSec = maxDays * 86400;
  const out: Array<[number, number]> = [];
  if (!(end > start)) return out;
  for (let cursor = start; cursor < end; ) {
    const next = Math.min(cursor + maxSec, end);
    out.push([cursor, next]);
    cursor = next;
  }
  return out;
}

export function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Unix 秒 → 本地日期/分钟字符串。考勤表按本地日历日存，这里不能走 UTC（会差 8 小时）。 */
export function formatPunchTime(unixSeconds: number): { date: string; time: string } | null {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  const d = new Date(unixSeconds * 1000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
  };
}

/**
 * 字段白名单裁剪：整条返回值只从原始记录里取 userid 与 checkin_time。
 * 新增字段必须显式改这里，否则进不了 AMS —— 这是刻意的默认拒绝。
 */
export function toPunch(raw: unknown): WeComPunch | null {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const userid = typeof rec.userid === "string" ? rec.userid.trim() : "";
  const at = Number(rec.checkin_time);
  if (!userid || !Number.isFinite(at)) return null;
  const stamp = formatPunchTime(at);
  if (!stamp) return null;
  return { wecomUserId: userid, date: stamp.date, time: stamp.time, sign: `${userid}:${Math.trunc(at)}` };
}

// ---------------------------------------------------------------- 取数

const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001]);

async function callCheckin(cfg: WeComConfig, token: string, body: Record<string, unknown>): Promise<unknown[]> {
  const url = `${cfg.baseUrl}/cgi-bin/checkin/getcheckindata?access_token=${encodeURIComponent(token)}`;
  const res = await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const errcode = Number(res.errcode ?? 0);
  if (errcode !== 0) throw new WeComApiError(errcode, describeWeComError(errcode, String(res.errmsg ?? "")));
  const list = res.checkindata;
  return Array.isArray(list) ? list : [];
}

export interface WeComPullResult {
  punches: WeComPunch[];
  /** 原始记录条数（含未绑定的人） */
  fetched: number;
  calls: number;
}

/**
 * 拉取 [start,end] 区间内这些 userid 的上下班打卡。
 * 分段 × 分批串行调用（企业微信对同一接口的频率有上限，串行最稳），
 * 任一段失败即整体抛错——半途而废的同步比不同步更危险（游标会跳过缺口）。
 */
export async function fetchCheckinRecords(
  cfg: WeComConfig,
  userids: string[],
  start: number,
  end: number
): Promise<WeComPullResult> {
  if (userids.length === 0) return { punches: [], fetched: 0, calls: 0 };
  let token = await getWeComAccessToken(cfg);
  const punches: WeComPunch[] = [];
  let fetched = 0;
  let calls = 0;
  for (const [from, to] of splitWindows(start, end)) {
    for (const batch of chunkList(userids, MAX_USERIDS_PER_CALL)) {
      const body = { opencheckindatatype: CHECKIN_DATA_TYPE, starttime: from, endtime: to, useridlist: batch };
      let raw: unknown[];
      try {
        raw = await callCheckin(cfg, token, body);
      } catch (e) {
        // token 失效只重试一次（重取 token），其余错误直接向上抛
        if (e instanceof WeComApiError && TOKEN_ERROR_CODES.has(e.errcode)) {
          token = await getWeComAccessToken(cfg, true);
          raw = await callCheckin(cfg, token, body);
        } else throw e;
      }
      calls += 1;
      fetched += raw.length;
      for (const rec of raw) {
        const p = toPunch(rec);
        if (p) punches.push(p);
      }
      // 让出事件循环：长时间分段拉取期间 HTTP 服务仍能响应其它请求
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return { punches, fetched, calls };
}
