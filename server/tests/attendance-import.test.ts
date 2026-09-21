/**
 * 考勤打卡导入回归测试（第 4 批）：
 *  1. 单元格解析：Excel 日期单元格 / 序列号 / 2026-1-5 / 2026年1月5日，时间 Date / 0.375 / 9:00 / 全角冒号；
 *  2. 归属解析：工号优先，工号缺失才按姓名唯一匹配；重名与查无此人必须报出来而不是猜一个；
 *  3. 幂等：同一张表二次导入 created=0、skipped=N（依赖 (employeeId,date,time) 唯一索引）；
 *  4. HTTP 接线：raw body 上传能拿到预览（忘挂 raw() 时这里会红）。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用例自造数据并清理。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import ExcelJS from "exceljs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { runMigrations } from "../migrate.ts";
import { attendanceRouter } from "../attendanceRouter.ts";
import {
  buildAttendanceTemplate,
  commitAttendanceChunk,
  beginAttendanceImportCommit,
  parseDateCell,
  parseTimeCell,
  previewAttendanceImport,
} from "../attendanceImportDb.ts";
import { upsertRecord } from "../attendanceDb.ts";
import type { SessionContext } from "../authDb.ts";

const empA = { id: "", name: "" };
const twin1 = { id: "", name: "" };
const twin2 = { id: "", name: "" };

async function sheet(rows: (string | Date | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("s");
  ws.addRow(["工号", "姓名", "打卡日期", "打卡时间"]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let apiServer: Server;
let base = "";

beforeAll(async () => {
  runMigrations(); // 导入的 ON CONFLICT 依赖 v11 建的 (employeeId,date,time) 唯一索引
  Object.assign(empA, createEmployee({ name: "导入测试甲" })!);
  Object.assign(twin1, createEmployee({ name: "重名员工" })!);
  Object.assign(twin2, createEmployee({ name: "重名员工" })!);

  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: unknown }).auth = {
      username: "import-test-admin",
      systemRole: "HR" as SessionContext["systemRole"],
      employeeId: null,
      displayName: "t",
      email: "",
      mustChangePassword: false,
    } satisfies SessionContext;
    next();
  });
  app.use("/api/attendance", attendanceRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/attendance`;
});

afterAll(() => {
  for (const e of [empA, twin1, twin2]) {
    db.prepare("DELETE FROM punch_records WHERE employeeId = ?").run(e.id);
  }
  for (const e of [empA, twin1, twin2]) deleteEmployee(e.id);
  apiServer.close();
});

describe("单元格解析", () => {
  it("日期：Date / 序列号 / 斜杠与年月日写法都能归一成 YYYY-MM-DD", () => {
    expect(parseDateCell(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(parseDateCell("2026/1/5")).toBe("2026-01-05");
    expect(parseDateCell("2026年1月5日")).toBe("2026-01-05");
    expect(parseDateCell("45000")).toBe("2023-03-15"); // Excel 序列号：44927 = 2023-01-01
    expect(parseDateCell(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(parseDateCell("09:00")).toBeNull();
  });

  it("时间：Excel 时间值取时分秒，小数按一天比例，全角冒号可用", () => {
    expect(parseTimeCell(new Date(1899, 11, 30, 9, 5, 30))).toBe("09:05:30");
    expect(parseTimeCell(0.375)).toBe("09:00:00");
    expect(parseTimeCell("9:00")).toBe("09:00:00");
    expect(parseTimeCell("09：00")).toBe("09:00:00");
    expect(parseTimeCell("25:00")).toBeNull();
    expect(parseTimeCell("昨天")).toBeNull();
  });
});

describe("previewAttendanceImport", () => {
  it("逐行给出可导入 / 工号不存在 / 重名 / 格式错误", async () => {
    const buffer = await sheet([
      [empA.id, "", "2026-09-01", "09:00"],
      ["EMPXXXX", "张三", "2026-09-01", "09:00"],
      ["", "重名员工", "2026-09-01", "09:00"],
      [empA.id, "", "2026-09-02", "上午九点"],
      ["", "查无此人", "2026-09-03", "18:00"],
      [twin1.id, "", "2026/9/4", "17：30"],
      [empA.id, "", "2026-09-01", "09:00"], // 文件内重复
    ]);
    const preview = await previewAttendanceImport(buffer);

    expect(preview.total).toBe(7);
    const byRow = new Map(preview.rows.map((r) => [r.rowNumber, r]));
    expect(byRow.get(2)?.errors).toEqual([]); // 首行数据（表头占 1）
    expect(byRow.get(3)?.errors.join("")).toContain("工号 EMPXXXX 在员工档案中不存在");
    expect(byRow.get(4)?.errors.join("")).toContain("对应多名员工");
    expect(byRow.get(5)?.errors.join("")).toContain("时间格式");
    expect(byRow.get(6)?.errors.join("")).toContain("在员工档案中不存在");
    expect(byRow.get(7)?.data.date).toBe("2026-09-04");
    expect(byRow.get(7)?.data.employeeName).toBe("重名员工"); // 姓名以档案为准
    expect(byRow.get(8)?.duplicate).toBe(true);
    expect(byRow.get(8)?.errors.join("")).toContain("文件内重复");
    expect(preview.valid).toBe(2);
  });

  it("库中已有的同一分钟记录会被标成重复并跳过", async () => {
    const buffer = await sheet([[empA.id, "", "2026-09-05", "08:30"]]);
    expect((await previewAttendanceImport(buffer)).valid).toBe(1);

    upsertRecord({ employeeId: empA.id, employeeName: empA.name, date: "2026-09-05", time: "08:30:00" });
    const second = await previewAttendanceImport(buffer);
    expect(second.valid).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(second.rows[0].errors.join("")).toContain("库中已存在");
  });

  it("缺日期/时间表头直接拒掉整个文件", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("s");
    ws.addRow(["工号", "姓名", "打卡分钟"]);
    ws.addRow([empA.id, "", 9]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(previewAttendanceImport(buffer)).rejects.toThrow(/未识别到表头/);
  });
});

describe("落库幂等与唯一索引", () => {
  it("同一分钟重复提交落到同一行；重复导入只增加 0 条", () => {
    const rows = [
      { data: { employeeId: empA.id, employeeName: empA.name, date: "2026-09-06", time: "09:00:00" } },
      { data: { employeeId: empA.id, employeeName: empA.name, date: "2026-09-06", time: "18:00:00" } },
    ];
    const first = beginAttendanceImportCommit();
    commitAttendanceChunk(first, rows);
    expect(first.created).toBe(2);

    const again = beginAttendanceImportCommit();
    commitAttendanceChunk(again, rows);
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(2);
    expect(
      Number(
        (
          db.prepare("SELECT COUNT(*) AS n FROM punch_records WHERE employeeId = ? AND date = '2026-09-06'").get(
            empA.id
          ) as { n: number | bigint }
        ).n
      )
    ).toBe(2);

    // upsertRecord 无 id 且已存在同分钟 → 返回既有行，不新建
    const existing = upsertRecord({
      employeeId: empA.id,
      employeeName: empA.name,
      date: "2026-09-06",
      time: "09:00:00",
    });
    expect(existing.date).toBe("2026-09-06");
    expect(
      Number(
        (
          db.prepare("SELECT COUNT(*) AS n FROM punch_records WHERE employeeId = ? AND date = '2026-09-06'").get(
            empA.id
          ) as { n: number | bigint }
        ).n
      )
    ).toBe(2);
  });
});

describe("HTTP 接线", () => {
  it("POST /records/import 收 raw xlsx 返回预览；GET template 出文件", async () => {
    const tpl = await buildAttendanceTemplate();
    const res = await fetch(`${base}/records/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: tpl,
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as { total: number; valid: number };
    expect(preview.total).toBe(1); // 模板自带一行示例

    const dl = await fetch(`${base}/records/import/template`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toContain("spreadsheetml");
  });
});
