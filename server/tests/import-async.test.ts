/**
 * Excel 导入异步化（第三梯队 #16）回归：
 * commit 改为「建任务 → 分块落库 → 轮询进度」，行数上限放宽到 5000。
 * 独立临时 DATA_DIR：与 backup-uploads 同样的 fork 复用考量。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-import-test-"));
process.env.DATA_DIR = DATA_DIR;

const { runMigrations } = await import("../migrate.ts");
const { db, closeDb } = await import("../db.ts");
const { createImportJob, getImportJob, runImportJob } = await import("../importJobsDb.ts");
const { MAX_IMPORT_ROWS } = await import("../employeeImportDb.ts");

beforeAll(() => {
  runMigrations();
  db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run("d-rd", "研发部");
});

afterAll(async () => {
  closeDb();
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch (e) {
    console.warn("[import-test] 临时目录清理失败：", e);
  }
});

function row(n: number, overrides: Record<string, string> = {}) {
  return {
    data: {
      name: `导入员工${n}`,
      idCard: `11010119900101${String(n).padStart(4, "0")}`,
      phone: "13800001234",
      department: "研发部",
      joinDate: "2026-01-01",
      ...overrides,
    },
  };
}

describe("异步导入任务", () => {
  it("跨分块执行：进度累计、合法行落库、非法/重复行跳过", async () => {
    // 250 行 > CHUNK_SIZE(100)，至少 3 个分块
    const rows = [
      ...Array.from({ length: 120 }, (_, i) => row(i + 1)),
      row(900, { phone: "bad" }), // 非法：电话格式
      row(901, { department: "不存在的部" }), // 非法：部门不存在
      row(5), // 与前面的 5 号身份证重复
      ...Array.from({ length: 127 }, (_, i) => row(i + 121)),
    ];
    const jobId = createImportJob("tester", rows.length);
    await runImportJob(jobId, rows);

    const job = getImportJob(jobId)!;
    expect(job.status).toBe("done");
    expect(job.total).toBe(rows.length);
    expect(job.processed).toBe(rows.length);
    expect(job.created).toBe(247); // 247 = 250 - 2 非法 - 1 重复
    expect(job.skipped).toBe(3);

    // 新库自带 45 条「员工 N」种子，按导入行的姓名前缀统计增量
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM employees WHERE name LIKE '导入员工%'")
      .get() as { c: number };
    expect(Number(count.c)).toBe(247);
  });

  it("任务查询：未知 id 返回 undefined，已知任务字段完整", () => {
    expect(getImportJob("no-such-job")).toBeUndefined();
    const jobId = createImportJob("tester2", 7);
    const job = getImportJob(jobId)!;
    expect(job).toMatchObject({ username: "tester2", status: "running", total: 7, processed: 0 });
  });

  it("行数上限已放宽到 5000", () => {
    expect(MAX_IMPORT_ROWS).toBe(5000);
  });
});
