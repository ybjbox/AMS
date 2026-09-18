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
import { beginImportCommit, commitImportChunk, type ImportCommitState } from "./employeeImportDb.ts";

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

function updateProgress(state: ImportCommitState, jobId: string, processed: number): void {
  db.prepare(
    `UPDATE import_jobs SET processed = ?, created = ?, skipped = ?, updatedAt = datetime('now','localtime') WHERE id = ?`
  ).run(processed, state.created, state.skipped, jobId);
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
      updateProgress(state, jobId, Math.min(offset + CHUNK_SIZE, rows.length));
      // 让出事件循环：轮询请求与其他业务请求可以插队进来
      await new Promise((resolve) => setImmediate(resolve));
    }
    db.prepare(
      `UPDATE import_jobs SET status = 'done', updatedAt = datetime('now','localtime') WHERE id = ?`
    ).run(jobId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[import] 后台导入任务失败：", jobId, e);
    try {
      db.prepare(
        `UPDATE import_jobs SET status = 'error', error = ?, updatedAt = datetime('now','localtime') WHERE id = ?`
      ).run(message.slice(0, 500), jobId);
    } catch {
      /* 数据库本身不可用时只能放弃记录 */
    }
  }
}
