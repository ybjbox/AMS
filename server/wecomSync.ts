/**
 * 企业微信打卡同步引擎（N1 · P0/P1）。
 *
 * 一次同步 = 解析时间窗 → 按分段/分批拉取 → 按映射归属 → 增量写 punch_records → 抬游标。
 *
 * 三条刻意的设计：
 *  1. **预览完全只读**：干跑不写打卡、不写映射、不动游标，这样"先看看权限和数据对不对"才是零风险的；
 *  2. **任一分段失败即整体失败、游标不抬**：半途而废的同步会让缺口永久静默，比不同步更糟；
 *  3. **只写绑定成功的行**：未认领的 userid 只计数不落库——把别人的卡灌进某个员工档案，
 *     是这套系统里最难发现、最难撤销的一类错误数据。
 */
import { getEmployee } from "./db.ts";
import { insertSourcedRecords } from "./attendanceDb.ts";
import { fetchCheckinRecords, getWeComAccessToken, type WeComPunch } from "./wecomClient.ts";
import {
  getWeComConfig,
  getWeComSyncState,
  isWeComConfigured,
  listKnownUserIds,
  markBindingSeen,
  resolveBinding,
  setWeComSyncState,
  type WeComConfig,
} from "./wecomDb.ts";

/** 游标缺失（首轮同步）时默认回看的天数 */
export const FIRST_SYNC_DAYS = 7;
/** 一次手动补拉的上限，避免误填 1970 年把接口打满 */
export const MAX_BACKFILL_DAYS = 180;
const WRITE_CHUNK = 500;

export class WeComSyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WeComSyncError";
    this.status = status;
  }
}

export interface WeComUnboundEntry {
  wecomUserId: string;
  count: number;
}

export interface WeComSyncReport {
  dryRun: boolean;
  /** 本次覆盖的时间窗（本地日期，含首尾） */
  from: string;
  to: string;
  startSec: number;
  endSec: number;
  /** 参与请求的 userid 数 */
  known: number;
  /** 接口返回的原始记录条数 */
  fetched: number;
  written: number;
  skipped: number;
  /** 有数据但还没认领到员工头上的 userid */
  unbound: WeComUnboundEntry[];
  /** 认领指向了档案里已不存在的员工（理论上删除流程会解绑，这里兜底报出来） */
  missingEmployees: string[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SyncWindowInput {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * 解析要拉的时间窗。增量模式从「游标 - 重叠窗口」起算（重叠是为了补企业微信侧的迟到数据，
 * 幂等由 (employeeId,date,time) 唯一索引保证）；显式区间给补历史数据用。
 */
export function resolveSyncWindow(
  input: SyncWindowInput,
  cfg: WeComConfig,
  now = new Date()
): { startSec: number; endSec: number } {
  const endSec = Math.floor(now.getTime() / 1000);
  if (input.dateFrom || input.dateTo) {
    const from = parseLocalDate(input.dateFrom ?? "");
    const to = parseLocalDate(input.dateTo ?? "");
    if (!from) throw new WeComSyncError("开始日期格式应为 YYYY-MM-DD");
    if (!to) throw new WeComSyncError("结束日期格式应为 YYYY-MM-DD");
    if (to.getTime() < from.getTime()) throw new WeComSyncError("结束日期早于开始日期");
    const startSec = Math.floor(from.getTime() / 1000);
    const end = Math.min(endSec, Math.floor(to.getTime() / 1000) + 86400);
    const days = (end - startSec) / 86400;
    if (days > MAX_BACKFILL_DAYS) {
      throw new WeComSyncError(`一次补拉最多 ${MAX_BACKFILL_DAYS} 天，请分段执行（当前 ${Math.ceil(days)} 天）`);
    }
    return { startSec, endSec: end };
  }
  const state = getWeComSyncState();
  const fallback = Math.floor(now.getTime() / 1000) - FIRST_SYNC_DAYS * 86400;
  const startSec =
    state.cursorAt !== null ? state.cursorAt - Math.max(0, cfg.overlapMinutes) * 60 : fallback;
  return { startSec: Math.min(startSec, endSec), endSec };
}

export interface RunSyncOptions extends SyncWindowInput {
  dryRun: boolean;
  onProgress?: (processed: number, created: number, skipped: number) => void;
}

/**
 * 执行一轮同步（或干跑预览）。
 * 抛错只有一种情况：配置缺失或接口整体不可用——这类"根本没法开始"的问题走 HTTP 400/502，
 * 而"部分 userid 没归属"不是错误，进报告的 unbound 字段。
 */
export async function runWeComSync(opts: RunSyncOptions): Promise<WeComSyncReport> {
  const cfg = getWeComConfig();
  if (!isWeComConfigured(cfg)) {
    throw new WeComSyncError("企业微信凭据未配齐（需要 企业 ID 与应用 Secret），先在上方保存配置");
  }
  const known = listKnownUserIds();
  if (known.length === 0) {
    throw new WeComSyncError(
      "还没有任何已认领的企业微信成员。打卡接口要求先给出 userid 列表，请在「成员映射」里登记企业微信成员账号（可在企业微信后台「通讯录 → 成员」看到账号字段）"
    );
  }
  const { startSec, endSec } = resolveSyncWindow(opts, cfg);
  const startedAt = new Date().toISOString();
  const { punches, fetched, calls } = await fetchCheckinRecords(
    cfg,
    known,
    startSec,
    endSec,
    // 拉取阶段就回写进度：这段是整轮同步里最长的一段（分段 × 分批，几十次接口调用），
    // 只在写库时回写会让任务行长时间看起来"卡住"，进而被台账对账判成中断。
    // 此刻还没有任何写入，所以 created/skipped 如实给 0（别把调用次数塞进去当跳过数）。
    (pulled) => opts.onProgress?.(pulled, 0, 0)
  );

  const unboundMap = new Map<string, number>();
  const missing = new Set<string>();
  const rows: { employeeId: string; employeeName: string; date: string; time: string; source: string }[] = [];
  for (const p of punches) {
    const employeeId = resolveBinding(p.wecomUserId);
    if (!employeeId) {
      unboundMap.set(p.wecomUserId, (unboundMap.get(p.wecomUserId) ?? 0) + 1);
      continue;
    }
    const emp = getEmployee(employeeId);
    if (!emp) {
      missing.add(`${p.wecomUserId} → ${employeeId}`);
      continue;
    }
    rows.push({
      employeeId,
      // 姓名快照取档案真值，不信企业微信（它压根不返回姓名）
      employeeName: emp.name,
      date: p.date,
      time: p.time,
      source: "wecom",
    });
  }

  let written = 0;
  let skipped = 0;
  if (!opts.dryRun) {
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      const res = insertSourcedRecords(rows.slice(i, i + WRITE_CHUNK));
      written += res.created;
      skipped += res.skipped;
      opts.onProgress?.(Math.min(i + WRITE_CHUNK, rows.length), written, skipped);
      await new Promise((resolve) => setImmediate(resolve));
    }
    // 见过的 userid 登记成待认领，下一轮才会进入 known 集合被拉到数据
    markBindingSeen([...new Set(punches.map((p: WeComPunch) => p.wecomUserId))]);
  }

  const report: WeComSyncReport = {
    dryRun: !!opts.dryRun,
    from: localDate(new Date(startSec * 1000)),
    to: localDate(new Date((endSec - 1) * 1000)),
    startSec,
    endSec,
    known: known.length,
    fetched,
    written,
    skipped,
    unbound: [...unboundMap.entries()]
      .map(([wecomUserId, count]) => ({ wecomUserId, count }))
      .sort((a, b) => b.count - a.count || a.wecomUserId.localeCompare(b.wecomUserId)),
    missingEmployees: [...missing],
    errors: [],
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  // 调试用：calls 只在日志里出现，不进报告结构（面板不展示接口次数）
  console.log(
    "[wecom] %s %s→%s：拉取 %d 条（%d 次调用），写入 %d，跳过 %d，未认领 %d 人",
    report.dryRun ? "预览" : "同步",
    report.from,
    report.to,
    fetched,
    calls,
    written,
    skipped,
    report.unbound.length
  );

  if (!opts.dryRun) {
    setWeComSyncState({
      cursorAt: endSec,
      lastSyncAt: report.finishedAt,
      lastReport: report as unknown as Record<string, unknown>,
      lastErrors: [...report.missingEmployees],
    });
  }
  return report;
}

/** 连通性检测：只换一次 token，不取数据、不写库。 */
export async function testWeComConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = getWeComConfig();
  if (!isWeComConfigured(cfg)) return { ok: false, message: "企业 ID 或应用 Secret 还没填" };
  const started = Date.now();
  try {
    await getWeComAccessToken(cfg, true);
    return { ok: true, message: `取到 access_token（${Date.now() - started}ms），凭据与可信 IP 均可用` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 定时增量同步。与企业微信的可信 IP 现实一致：默认要靠配置页的开关显式打开，
 * 关着的时候一次接口都不调。环境变量 WECOM_SYNC_ENABLED=false 是运维级总闸。
 *
 * 两个必须留意的点（都在这轮全系统检查里被抓到）：
 *  - 保存配置后要能立刻改生效：以前只在进程启动时调一次，用户在界面上打开开关
 *    后什么都不会发生（要到下次重启才偷偷补上），所以这里做成可重复调用的 restart。
 *  - 不能重入：一轮同步没跑完就到了下一个 tick，会让两个游标读改写互相覆盖，
 *    所以同一时刻只允许一轮，晚到的 tick 直接跳过（下一轮的回看窗口会补上）。
 */
let schedulerHandles: { boot: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> } | null = null;
let syncing = false;

export interface SchedulerState {
  running: boolean;
  reason: string;
}

export function restartWeComSyncScheduler(): SchedulerState {
  stopWeComSyncScheduler();
  if (process.env.WECOM_SYNC_ENABLED === "false") {
    const reason = "定时同步已被环境变量禁用（WECOM_SYNC_ENABLED=false）";
    console.log(`[wecom] ${reason}`);
    return { running: false, reason };
  }
  const cfg = getWeComConfig();
  if (!cfg.enabled || !isWeComConfigured(cfg)) {
    const reason = cfg.enabled ? "凭据未配齐" : "同步开关未打开";
    console.log(`[wecom] 定时任务不启动：${reason}`);
    return { running: false, reason };
  }
  const intervalMs = Math.max(10, cfg.syncIntervalMinutes) * 60_000;
  const tick = () => {
    if (syncing) {
      console.warn("[wecom] 上一轮同步仍未结束，本轮跳过（回看窗口会补齐这段区间）");
      return;
    }
    syncing = true;
    runWeComSync({ dryRun: false })
      .catch((e) => {
        console.error("[wecom] 定时同步失败：", e instanceof Error ? e.message : e);
      })
      .finally(() => {
        syncing = false;
      });
  };
  // 启动后先跑一轮（5 秒后，给迁移与种子数据留出时间），之后按间隔
  const boot = setTimeout(tick, 5000);
  const interval = setInterval(tick, intervalMs);
  for (const h of [boot, interval]) {
    if (typeof h.unref === "function") h.unref();
  }
  schedulerHandles = { boot, interval };
  console.log(
    `[wecom] 定时同步已启动：每 ${Math.round(intervalMs / 60000)} 分钟一次，回看 ${cfg.overlapMinutes} 分钟`
  );
  return { running: true, reason: `每 ${Math.round(intervalMs / 60000)} 分钟一次` };
}

/** 进程启动时的入口（语义等同于 restart：先清干净再装）。 */
export function startWeComSyncScheduler(): ReturnType<typeof setInterval> | null {
  const state = restartWeComSyncScheduler();
  return state.running ? (schedulerHandles?.interval ?? null) : null;
}

export function stopWeComSyncScheduler(): void {
  if (!schedulerHandles) return;
  clearTimeout(schedulerHandles.boot);
  clearInterval(schedulerHandles.interval);
  schedulerHandles = null;
}
