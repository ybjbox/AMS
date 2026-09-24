/**
 * 员工批量导入后台任务（#16）。
 *
 * 动机：commit 500 行同步请求会长时间占用连接，大批量时有超时风险；
 * 改为 提交 → 返回 jobId → 后台分块落库 → 前端轮询进度。
 *
 * 分块策略：每 100 行一批，批间 setImmediate 让出事件循环，
 * 让 HTTP 请求（含轮询自身）不被长导入阻塞；单批内仍是同步 SQLite 写，毫秒级。
 */
import { db } from "./db.ts";
import { randomUUID } from "node:crypto";
import { asString, asNumber } from "./sqliteUtil.ts";
import { beginImportCommit, commitImportChunk } from "./employeeImportDb.ts";

export type ImportJobStatus = "running" | "done" | "error";

export interface ImportJob {
  id: string;
  username: string;
  status: ImportJobStatus;
  total: number;
  processed: number;
  created: number;
  skipped: number;
  error: string;
}

export function ensureImportJobsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      id        TEXT PRIMARY KEY,
      username  TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'running',
      total     INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      created   INTEGER NOT NULL DEFAULT 0,
      skipped   INTEGER NOT NULL DEFAULT 0,
      error     TEXT NOT NULL DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      updatedAt TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}
ensureImportJobsTable();

export function createImportJob(username: string, total: number): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO import_jobs (id, username, status, total) VALUES (?, ?, 'running', ?)`
  ).run(id, username, total);
  return id;
}

export function getImportJob(id: string): ImportJob | undefined {
  const row = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(id) as
    | Record<string, string | number | bigint | null>
    | undefined;
  if (!row) return undefined;
  return {
    id: asString(row.id),
    username: asString(row.username),
    status: asString(row.status) as ImportJobStatus,
    total: asNumber(row.total),
    processed: asNumber(row.processed),
    created: asNumber(row.created),
    skipped: asNumber(row.skipped),
    error: asString(row.error),
  };
}

const CHUNK_SIZE = 100;

export function markJobProgress(jobId: string, processed: number, created: number, skipped: number): void {
  db.prepare(
    `UPDATE import_jobs SET processed = ?, created = ?, skipped = ?, updatedAt = datetime('now','localtime') WHERE id = ?`
  ).run(processed, created, skipped, jobId);
}

export function markJobDone(jobId: string): void {
  db.prepare(`UPDATE import_jobs SET status = 'done', updatedAt = datetime('now','localtime') WHERE id = ?`).run(jobId);
}

/** 任务自身的失败也要落库；连这条都写不进去（库不可用）时只能放弃记录 */
export function markJobError(jobId: string, message: string): void {
  try {
    db.prepare(`UPDATE import_jobs SET status = 'error', error = ?, updatedAt = datetime('now','localtime') WHERE id = ?`).run(
      message.slice(0, 500),
      jobId
    );
  } catch {
    console.error("[import] 无法写入任务失败状态：", jobId);
  }
}

/**
 * 后台执行导入：调用方 fire-and-forget（路由已先返回 202）。
 * 所有异常写进 job.error，绝不向外抛。
 */
export async function runImportJob(jobId: string, rows: { data: Record<string, string | number> }[]): Promise<void> {
  try {
    const state = beginImportCommit();
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      commitImportChunk(state, rows.slice(offset, offset + CHUNK_SIZE));
      markJobProgress(jobId, Math.min(offset + CHUNK_SIZE, rows.length), state.created, state.skipped);
      // 让出事件循环：轮询请求与其他业务请求可以插队进来
      await new Promise((resolve) => setImmediate(resolve));
    }
    markJobDone(jobId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[import] 后台导入任务失败：", jobId, e);
    markJobError(jobId, message);
  }
}

// ---------------------------------------------------------------- 台账对账与清理

/**
 * 超过这么多分钟没写进度就判定任务已死。判定只看"有没有进展"，不看是哪个进程建的：
 * 本机常有两个实例共用同一个库（:3000 dev:watch 与 :3001 生产验证），
 * 按归属清理会把另一个实例正在跑的任务判死。
 */
export const STALE_JOB_MINUTES = 15;
/** 终态任务行只是进度台账，不能无限增长（企微定时同步每天就要留若干条）。 */
export const JOB_RETENTION_DAYS = 30;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface ImportJobSweepResult {
  interrupted: number;
  pruned: number;
}

export function sweepImportJobs(
  opts: { staleMinutes?: number; retentionDays?: number } = {}
): ImportJobSweepResult {
  const staleMinutes = opts.staleMinutes ?? STALE_JOB_MINUTES;
  const retentionDays = opts.retentionDays ?? JOB_RETENTION_DAYS;
  const interrupted = db
    .prepare(
      `UPDATE import_jobs
          SET status = 'error', error = ?, updatedAt = datetime('now','localtime')
        WHERE status = 'running'
          AND updatedAt < datetime('now','localtime', ?)`
    )
    .run(
      `任务已中断：${staleMinutes} 分钟内没有任何进展（服务可能已重启或被强杀），请重新发起`,
      `-${staleMinutes} minutes`
    );
  // 上一行刚被判中断的条目 updatedAt 已是当下，所以本轮不会被一起删掉，还能被看见一段时间
  const pruned = db
    .prepare(
      `DELETE FROM import_jobs
        WHERE status <> 'running'
          AND updatedAt < datetime('now','localtime', ?)`
    )
    .run(`-${retentionDays} days`);
  return { interrupted: Number(interrupted.changes), pruned: Number(pruned.changes) };
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** 启动即对账一次（上一代进程留下的 running 行不该继续被前端当成"在跑"而无限轮询），之后周期巡检。 */
export function startImportJobSweeper(intervalMs = SWEEP_INTERVAL_MS): ReturnType<typeof setInterval> {
  stopImportJobSweeper();
  const run = () => {
    try {
      const { interrupted, pruned } = sweepImportJobs();
      if (interrupted > 0 || pruned > 0) {
        console.log(`[import] 任务台账已对账：判中断 ${interrupted} 条、清理 ${pruned} 条`);
      }
    } catch (e) {
      console.error("[import] 任务台账对账失败：", e);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  sweepTimer = timer;
  return timer;
}

export function stopImportJobSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
