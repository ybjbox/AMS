/**
 * 本地日历日口径（server/localDate.ts）的回归。
 *
 * 起因：全站多处用 `new Date().toISOString().slice(0, 10)` 当"今天"，
 * 而库里的日期串（打卡日、合同到期日、公告生效日、请假起止）都是本地日历日 ——
 * UTC+8 下每天 00:00–07:59 会少一天。这里钉住两件事：
 *  1. 本地格式化在跨零点边界上给出正确的"哪一天"；
 *  2. ExcelJS 往返出来的日期单元格是**本地零点**，所以必须按本地读（按 UTC 读会倒退一天）。
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { formatLocalDate, localDateOffset, localToday } from '../localDate.ts';

describe('本地日历日', () => {
  it('本地零点与本地 23:30 都归到当天（不受时区偏移影响）', () => {
    expect(formatLocalDate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(formatLocalDate(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01');
    expect(formatLocalDate(new Date(2026, 8, 21, 8, 0))).toBe('2026-09-21');
  });

  it('localToday 的形状就是库里日期串的格式，且与本地格式化一致', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(localToday()).toBe(formatLocalDate(new Date()));
  });

  it('localDateOffset 按本地日历日回退，跨月不串行', () => {
    const from = new Date(2026, 2, 1, 12, 0); // 2026-03-01 正午
    expect(localDateOffset(0, from)).toBe('2026-03-01');
    expect(localDateOffset(1, from)).toBe('2026-02-28');
    expect(localDateOffset(6, from)).toBe('2026-02-23');
  });
});

describe('Excel 日期单元格的读法', () => {
  it('ExcelJS 往返给出的是本地零点：按本地读回原日期，按 UTC 读会倒退一天', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('s').getCell('A1').value = new Date(2026, 8, 21);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf instanceof ArrayBuffer ? buf : (buf as Buffer).buffer);
    const cell = back.getWorksheet('s')?.getCell('A1').value as Date;
    expect(cell).toBeInstanceOf(Date);
    // 这一条就是回归点：曾经按 toISOString() 读，UTC+8 下会输出 2026-09-20
    expect(formatLocalDate(cell)).toBe('2026-09-21');
  });
});
