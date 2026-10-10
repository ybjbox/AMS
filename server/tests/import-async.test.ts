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
const { MAX_IMPORT_ROWS, previewImport } = await import("../employeeImportDb.ts");

beforeAll(() => {
  runMigrations();
  db.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run("d-rd", "研发部");
  db.prepare("INSERT INTO departments (id, name, parentId) VALUES (?,?,?)").run("d-mkt", "市场部", null);
  db.prepare("INSERT INTO departments (id, name, parentId) VALUES (?,?,?)").run("d-night", "夜班组", "d-mkt");
});

/**
 * 部门列填多值时的提示（2026-10-10）。
 *
 * 打卡机导出的部门列是「市场部;市场部/夜班组」这种串，而且**顺序不固定**
 * （见过「市场部/夜班组;市场部」）。本系统一个员工只挂一个部门，
 * 校验是 `name = ?` 精确匹配，整串必然匹配不上 —— 只报「部门不存在」看不出真正原因。
 */
describe("部门列填了多值时的提示", () => {
  async function check(department: string): Promise<string[]> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("员工导入");
    ws.addRow(["姓名", "部门"]);
    ws.addRow(["提示验证", department]);
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const r = await previewImport(buf);
    return r.rows[0].errors.filter((e) => e.includes("部门"));
  }

  it("分号串：指出应填最具体的那一段", async () => {
    const errs = await check("市场部;市场部/夜班组");
    expect(errs.join()).toMatch(/请只填「夜班组」/u);
  });

  it("分号串顺序反了也要给同样的提示（不能依赖分号顺序）", async () => {
    const errs = await check("市场部/夜班组;市场部");
    expect(errs.join()).toMatch(/请只填「夜班组」/u);
  });

  it("单段但带层级路径：提示只填部门名", async () => {
    const errs = await check("市场部/夜班组");
    expect(errs.join()).toMatch(/不要带路径/u);
  });

  it("最具体的那一段在部门树里也不存在时说清楚", async () => {
    const errs = await check("市场部/不存在的组;市场部");
    expect(errs.join()).toMatch(/最具体的一段是「不存在的组」/u);
    expect(errs.join()).toMatch(/在部门管理里也不存在/u);
  });

  it("纯部门名不受影响（仍走原校验）", async () => {
    expect(await check("夜班组")).toEqual([]);
    expect((await check("不存在的部门")).join()).toMatch(/不存在/u);
  });
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
