/**
 * #19 微信通知生成器：文件文本提取。
 * 只测函数级逻辑（router 无 supertest，靠 dev E2E 验证）；不调外部模型。
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  extractFileText,
  ExtractError,
  isSupportedFile,
  truncateText,
  MAX_TEXT_CHARS,
} from '../fileTextExtract.ts';

describe('文件类型识别', () => {
  it('支持 txt/md/csv/xlsx/docx/pdf（大小写不敏感），拒绝其他', () => {
    for (const name of ['a.txt', 'b.MD', 'c.csv', 'd.xlsx', 'e.docx', 'f.pdf']) {
      expect(isSupportedFile(name)).toBe(true);
    }
    for (const name of ['a.doc', 'a.xls', 'a.pdf.exe', 'noext', 'a.png']) {
      expect(isSupportedFile(name)).toBe(false);
    }
  });
});

describe('extractFileText', () => {
  it('txt 按 UTF-8 解码并统一换行', async () => {
    const buf = Buffer.from('第一行\r\n第二行  ', 'utf-8');
    expect(await extractFileText('note.txt', buf)).toBe('第一行\n第二行');
  });

  it('UTF-8 乱码比例高时回退 GBK', async () => {
    // iconv-lite 编码「年会通知」的 GBK 字节
    const gbk = Buffer.from([0xc4, 0xea, 0xbb, 0xe1, 0xcd, 0xa8, 0xd6, 0xaa]);
    expect(await extractFileText('t.txt', gbk)).toBe('年会通知');
  });

  it('空文件 / 无文本文件 / 不支持类型给出中文错误', async () => {
    await expect(extractFileText('a.txt', Buffer.alloc(0))).rejects.toThrow(ExtractError);
    await expect(extractFileText('a.txt', Buffer.from('   \n  ', 'utf-8'))).rejects.toThrow(
      /未能从文件中提取到文本内容/
    );
    await expect(extractFileText('a.zip', Buffer.from('PK\x03\x04'))).rejects.toThrow(
      /不支持的文件类型/
    );
  });

  it('xlsx 逐表逐行提取为「 | 」分隔文本', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('通知');
    sheet.addRow(['时间', '地点']);
    sheet.addRow(['9月20日 14:00', '三楼会议室']);
    sheet.addRow([null, '']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const text = await extractFileText('plan.xlsx', buf);
    expect(text).toContain('【工作表：通知】');
    expect(text).toContain('时间 | 地点');
    expect(text).toContain('9月20日 14:00 | 三楼会议室');
    expect(text).not.toContain(' |\n'); // 全空行被跳过
  });

  it('损坏的 xlsx/docx/pdf 报解析错误而不是崩溃', async () => {
    const junk = Buffer.from('not really a file'.repeat(10));
    await expect(extractFileText('a.xlsx', junk)).rejects.toThrow(/Excel|无法解析/);
    await expect(extractFileText('a.docx', junk)).rejects.toThrow(/Word|无法解析/);
    await expect(extractFileText('a.pdf', junk)).rejects.toThrow(/PDF|无法解析/);
  });

  it('长文本截断到上限并标注', () => {
    const out = truncateText('字'.repeat(MAX_TEXT_CHARS + 500));
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + 30);
    expect(out).toContain('已截断');
    expect(truncateText('short')).toBe('short');
  });
});
