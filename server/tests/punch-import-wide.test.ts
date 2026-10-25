/**
 * 企业微信横排表导入回归。
 *
 * 背景：企业微信导出的「打卡时间记录」是**横排**的 —— 表头占 4 行、一行一个人、
 * 一列一天，每格里用「、」分隔当天多次打卡；而原来的 `parsePunchWorkbook` 只认
 * **竖排**模板（第一行含「日期」「时间」），遇到横排表直接抛「未识别到表头」。
 *
 * 这里钉死横排解析的每一处实测得来的行为：
 *  1. 表头识别（第 4 行）与人天拆分（一行一人 → 一行一条打卡）；
 *  2. 列头只有「日+星期」没有月份，按「日数递减即换月」推出跨月的日期（8/31 接 9/1）；
 *  3. 「管理员校准」后缀与相邻打卡合并，否则 1 次打卡会算成 2 次；
 *  4. 整行都是 `--` 的占位行（表里真有一个「测试号-市场部」）不产生任何行；
 *  5. 认人走「系统工号 → 企业微信 userid → 姓名唯一」，认不到就报错，绝不猜。
 *
 * 用真表头拼最小 xlsx 驱动，不依赖 Downloads 下那份实物（CI 上没有）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { detectLayout, parsePunchWorkbook } from '../attendanceImportDb.ts';

/**
 * 按企业微信原表的真实布局造一张横排表。
 * 表头 4 行；第 2 行写「统计时间:起始 ～ 结束」；第 5 列起是「日 + 星期」；数据行从第 5 行开始。
 */
async function buildWideSheet(opts: {
  start: string; // 统计时间起始日，如 "2026-10-01"
  dates: string[]; // 列头日数，如 ["30","1","2"]
  rows: { name: string; acct: string; dept?: string; job?: string; cells: string[] }[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("打卡时间记录");
  const last = opts.dates.length + 4;
  const endDate = new Date(`${opts.start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + opts.dates.length - 1);
  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = "打卡时间记录";
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = `统计时间:${opts.start} ～ ${endDate.toISOString().slice(0, 10)}`;
  ws.getCell(3, 1).value = "姓名";
  ws.getCell(3, 2).value = "账号";
  ws.getCell(3, 3).value = "基础信息";
  ws.mergeCells(3, 5, 3, last);
  ws.getCell(3, 5).value = "打卡时间记录";
  ws.getCell(4, 1).value = "姓名";
  ws.getCell(4, 2).value = "账号";
  ws.getCell(4, 3).value = "部门";
  ws.getCell(4, 4).value = "职务";
  const weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
  opts.dates.forEach((d, i) => {
    ws.getCell(4, 5 + i).value = `${d}\n${weekdays[i % 7]}`;
  });
  opts.rows.forEach((r, i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = r.name;
    ws.getCell(row, 2).value = r.acct;
    ws.getCell(row, 3).value = r.dept ?? "市场部";
    ws.getCell(row, 4).value = r.job ?? "员工";
    r.cells.forEach((v, j) => {
      ws.getCell(row, 5 + j).value = v;
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

describe("横排表识别", () => {
  let buf: Buffer;
  beforeAll(async () => {
    buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1", "2"],
      rows: [{ name: "陆宏", acct: "LuHong", cells: ["08:13、16:39", "--"] }],
    });
  });

  it("认出是企业微信横排表，并报出日期跨度与人数", async () => {
    const hint = await detectLayout(buf);
    expect(hint.layout).toBe("wide");
    expect(hint.detected).toMatchObject({
      headerRow: 4,
      dateColumns: 2,
      firstDate: "2026-09-01",
      lastDate: "2026-09-02",
      people: 1,
    });
  });
});

describe("横排表拆成竖排行", () => {
  it("一天多卡 → 一行一条打卡；`--` 当天不产生行", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1", "2", "3"],
      rows: [
        {
          name: "陆宏",
          acct: "LuHong",
          cells: ["08:13、16:39", "--", "08:04、14:31、18:00"],
        },
      ],
    });
    const rows = await parsePunchWorkbook(buf);
    expect(rows.map((r) => [r.cells.date, r.cells.time])).toEqual([
      ["2026-09-01", "08:13:00"],
      ["2026-09-01", "16:39:00"],
      ["2026-09-03", "08:04:00"],
      ["2026-09-03", "14:31:00"],
      ["2026-09-03", "18:00:00"],
    ]);
  });

  it("列头没有月份：日数递减即换月（8/31 接 9/1）", async () => {
    const buf = await buildWideSheet({
      start: "2026-08-31",
      dates: ["31", "1", "2"],
      rows: [{ name: "何海", acct: "HeHai", cells: ["01:00", "01:00、17:27", "01:00、17:01"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    const dates = [...new Set(rows.map((r) => r.cells.date))];
    expect(dates).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("十月整月表（9/30 起）：10/1 不会被读成 9/1", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-30",
      dates: ["30", "1", "2"],
      rows: [{ name: "何海", acct: "HeHai", cells: ["09:00", "08:55", "08:58"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    const dates = [...new Set(rows.map((r) => r.cells.date))];
    expect(dates).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("十月部分表（10/1 起）：只导 1～25 日就只落这 25 天", async () => {
    const days = Array.from({ length: 25 }, (_, i) => String(i + 1));
    const buf = await buildWideSheet({
      start: "2026-10-01",
      dates: days,
      rows: [{ name: "何海", acct: "HeHai", cells: days.map(() => "09:00") }],
    });
    const rows = await parsePunchWorkbook(buf);
    const dates = [...new Set(rows.map((r) => r.cells.date))];
    expect(dates[0]).toBe("2026-10-01");
    expect(dates[dates.length - 1]).toBe("2026-10-25");
    expect(dates).toHaveLength(25);
  });

  it("跨年：12/31 之后是次年 1/1", async () => {
    const buf = await buildWideSheet({
      start: "2026-12-30",
      dates: ["30", "31", "1"],
      rows: [{ name: "何海", acct: "HeHai", cells: ["09:00", "09:00", "09:00"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    const dates = [...new Set(rows.map((r) => r.cells.date))];
    expect(dates).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("统计时间缺失或与首列不一致时拒绝解析，不猜月份", async () => {
    const noStats = await buildWideSheet({
      start: "2026-10-01",
      dates: ["1", "2"],
      rows: [{ name: "何海", acct: "HeHai", cells: ["09:00", "09:00"] }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(noStats as unknown as ArrayBuffer);
    wb.worksheets[0]!.getCell(2, 1).value = "";
    const blankTitle = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    await expect(detectLayout(blankTitle)).rejects.toThrow(/统计时间/);

    const mismatched = await buildWideSheet({
      start: "2026-10-01",
      dates: ["2", "3"],
      rows: [{ name: "何海", acct: "HeHai", cells: ["09:00", "09:00"] }],
    });
    await expect(detectLayout(mismatched)).rejects.toThrow(/第一列是 2 日/);
  });

  it("整行都是 `--` 的占位行不产生任何行（表里真有一个「测试号-市场部」）", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1", "2"],
      rows: [
        { name: "测试号-市场部", acct: "bb", cells: ["--", "--"] },
        { name: "陆宏", acct: "LuHong", cells: ["08:13", "--"] },
      ],
    });
    const rows = await parsePunchWorkbook(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.employeeName).toBe("陆宏");
  });

  it("「管理员校准」与相邻打卡合并，不把 1 次打卡算成 2 次", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1"],
      rows: [{ name: "梁华", acct: "LiangHua", cells: ["08:02(管理员校准)、23:50"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    expect(rows.map((r) => r.cells.time)).toEqual(["08:02:00", "23:50:00"]);
  });

  it("校准记录离得远时不合并（那是真的另一次打卡）", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1"],
      rows: [{ name: "何斌", acct: "HeBin", cells: ["00:03、00:04(管理员校准)、15:35"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    // 00:03 与 00:04 间隔 1 分钟 → 合并；15:35 离得远 → 保留
    expect(rows.map((r) => r.cells.time)).toEqual(["00:03:00", "15:35:00"]);
  });

  it("账号与姓名都带出去，供认人用", async () => {
    const buf = await buildWideSheet({
      start: "2026-09-01",
      dates: ["1"],
      rows: [{ name: "林英娜", acct: "LinYingNa", cells: ["08:05"] }],
    });
    const rows = await parsePunchWorkbook(buf);
    expect(rows[0]!.cells).toMatchObject({
      employeeId: "LinYingNa",
      employeeName: "林英娜",
      date: "2026-09-01",
      time: "08:05:00",
    });
  });
});

describe("竖排模板不受影响", () => {
  it("第一行含「日期」「时间」的标准模板仍走原路径", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.getRow(1).values = ["工号", "姓名", "日期", "时间"];
    ws.getRow(2).values = ["EMP0001", "陆宏", "2026-09-01", "08:00"];
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

    const hint = await detectLayout(buf);
    expect(hint.layout).toBe("tall");

    const rows = await parsePunchWorkbook(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells.employeeId).toBe("EMP0001");
    expect(rows[0]!.cells.employeeName).toBe("陆宏");
    // 表头列被原样带回，行数据从第 2 行起
    expect(rows[0]!.cells.date).toBeDefined();
    expect(rows[0]!.cells.time).toBeDefined();
  });
});

afterAll(() => {
  /* 无外部资源，仅语法糖 */
});