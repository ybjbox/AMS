/**
 * 导入/同步任务台账的对账与清理（批次 E1）。
 *
 * 原来的形状：只有 create / progress / done / error 四个写点，既没有启动对账也没有任何 DELETE。
 * 于是进程一重启（崩溃、发布、Ctrl+C），代际遗留的 running 行永远停在"进行中"，
 * 前端 `for(;;)` 轮询就永远转圈；同时这张表只增不减。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。只操作本文件自己建的 jobId。
 */
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../db.ts";
import {
  createImportJob,
  getImportJob,
  markJobDone,
  markJobProgress,
  startImportJobSweeper,
  stopImportJobSweeper,
  sweepImportJobs,
  STALE_JOB_MINUTES,
  JOB_RETENTION_DAYS,
} from "../importJobsDb.ts";

/** 把某行的 updatedAt 往前挪，模拟"进程死了、再没人写进度" */
function backdate(id: string, minutes: number) {
  db.prepare(
    `UPDATE import_jobs SET updatedAt = datetime('now','localtime', ?) WHERE id = ?`
  ).run(`-${minutes} minutes`, id);
}

const owned: string[] = [];
function job(total = 10) {
  const id = createImportJob("qa-import-sweep", total);
  owned.push(id);
  return id;
}

afterAll(() => {
  stopImportJobSweeper();
  const del = db.prepare("DELETE FROM import_jobs WHERE id = ?");
  for (const id of owned) del.run(id);
});

describe("任务台账对账：没有进展就判中断", () => {
  it("超时的 running 行被判 error，并给出可操作的中文原因", () => {
    const id = job();
    backdate(id, STALE_JOB_MINUTES + 5);
    const { interrupted } = sweepImportJobs();
    const job_ = getImportJob(id)!;
    expect(interrupted).toBeGreaterThanOrEqual(1);
    expect(job_.status).toBe("error");
    expect(job_.error).toContain(`${STALE_JOB_MINUTES} 分钟内没有任何进展`);
    expect(job_.error).toContain("请重新发起");
  });

  it("还在写进度的 running 行不动 —— 本机常有第二个实例在跑真任务", () => {
    const id = job();
    markJobProgress(id, 5, 5, 0); // 刚写过进度
    const before = getImportJob(id)!;
    sweepImportJobs();
    const after = getImportJob(id)!;
    expect(after.status).toBe(before.status);
    expect(after.status).toBe("running");
    expect(after.processed).toBe(5);
  });

  it("刚被判中断的行本轮不会被一起清掉（否则用户看不到原因）", () => {
    const id = job();
    backdate(id, STALE_JOB_MINUTES + 5);
    sweepImportJobs({ retentionDays: 0 });
    const job_ = getImportJob(id);
    expect(job_).toBeDefined();
    expect(job_!.status).toBe("error");
  });

  it("按分钟阈值判定，不是按行数判定", () => {
    const stale = job();
    const almost = job();
    backdate(stale, STALE_JOB_MINUTES + 1);
    backdate(almost, STALE_JOB_MINUTES - 1);
    sweepImportJobs({ staleMinutes: STALE_JOB_MINUTES });
    expect(getImportJob(stale)!.status).toBe("error");
    expect(getImportJob(almost)!.status).toBe("running");
  });
});

describe("任务台账清理：终态行按保留期删除", () => {
  it("超期的 done / error 行被删，未超期的留着", () => {
    const done = job();
    markJobDone(done);
    backdate(done, JOB_RETENTION_DAYS * 24 * 60 + 60);
    const fresh = job();
    markJobDone(fresh);
    const { pruned } = sweepImportJobs();
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(getImportJob(done)).toBeUndefined();
    expect(getImportJob(fresh)).toBeDefined();
    owned.splice(owned.indexOf(done), 1);
  });

  it("再老的 running 行也只先判中断，不直接删（保留可诊断的尾巴）", () => {
    const id = job();
    backdate(id, JOB_RETENTION_DAYS * 24 * 60 + 60);
    sweepImportJobs();
    const job_ = getImportJob(id);
    expect(job_).toBeDefined();
    expect(job_!.status).toBe("error");
  });
});

describe("启动即对账的巡检器", () => {
  it("startImportJobSweeper 立刻跑一轮；重复 start 只留一个定时器（先停旧的）", async () => {
    const id = job();
    backdate(id, STALE_JOB_MINUTES + 5);
    startImportJobSweeper(60 * 60 * 1000);
    expect(getImportJob(id)!.status).toBe("error");
    stopImportJobSweeper();

    // 用极短周期跑两次 start，再 stop 一次：若 start 忘了先停旧表，泄漏的那个定时器
    // 还会继续扫，下面的"停后不变"就会失败 —— 这才是这条断言的真正判据。
    startImportJobSweeper(5);
    startImportJobSweeper(5);
    stopImportJobSweeper();
    const late = job();
    backdate(late, STALE_JOB_MINUTES + 5);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(getImportJob(late)!.status).toBe("running");
  });

  it("对账不碰计数字段（processed/created/skipped 是给人看的进度，不能被中断逻辑改）", () => {
    const id = job(100);
    markJobProgress(id, 40, 38, 2);
    backdate(id, STALE_JOB_MINUTES + 5);
    sweepImportJobs();
    const job_ = getImportJob(id)!;
    expect({ p: job_.processed, c: job_.created, s: job_.skipped, t: job_.total }).toEqual({
      p: 40,
      c: 38,
      s: 2,
      t: 100,
    });
  });
});
