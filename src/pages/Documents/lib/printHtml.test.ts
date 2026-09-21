import { describe, it, expect } from 'vitest';
import { buildDocumentSetPrintHtml, MAX_COPIES, type PrintJobItem } from './printHtml';
import type { PrintPart, PrintSettings } from '@/types/document';

const settings = (over: Partial<PrintSettings> = {}): PrintSettings => ({
  duplex: false,
  color: false,
  copies: 1,
  ...over,
});

const textPart = (documentId: string, name: string, text: string): PrintPart => ({
  documentId,
  name,
  kind: 'text',
  text,
  truncated: false,
});

const item = (over: Partial<PrintJobItem> & { documentId: string }): PrintJobItem => ({
  name: over.documentId,
  settings: settings(),
  part: textPart(over.documentId, over.name ?? over.documentId, '正文内容'),
  ...over,
});

describe('buildDocumentSetPrintHtml（第 7 批：真内容打印）', () => {
  it('不再输出占位纸', () => {
    const html = buildDocumentSetPrintHtml({ name: '入职材料' }, [item({ documentId: 'd1' })], '2026-09-21 08:00:00');
    expect(html).not.toContain('实际打印时将输出文件真实内容');
    expect(html).toContain('正文内容');
  });

  it('份数真的复制输出，并标第 k/N 份', () => {
    const html = buildDocumentSetPrintHtml(
      { name: '入职材料' },
      [item({ documentId: 'd1', name: '劳动合同', settings: settings({ copies: 3 }) })],
      '2026-09-21 08:00:00'
    );
    expect(html.match(/class="dp-doc/g)?.length).toBe(3);
    expect(html).toContain('第 1/3 份');
    expect(html).toContain('第 3/3 份');
    // 作业抬头只出现在第一份，避免每页都重复
    expect(html.match(/入职材料 · 共 1 份文件/g)?.length).toBe(1);
  });

  it('离谱份数被夹到上限', () => {
    const html = buildDocumentSetPrintHtml(
      { name: '套件' },
      [item({ documentId: 'd1', settings: settings({ copies: 9999 }) })],
      '2026-09-21'
    );
    expect(html.match(/class="dp-doc/g)?.length).toBe(MAX_COPIES);
  });

  it('黑白加灰度滤镜、双面用镜像页边距', () => {
    const mono = buildDocumentSetPrintHtml(
      { name: '套件' },
      [item({ documentId: 'd1', settings: settings({ color: false }) })],
      '2026-09-21'
    );
    expect(mono).toContain('dp-doc dp-mono');
    expect(mono).not.toContain('@page :left');

    const duplex = buildDocumentSetPrintHtml(
      { name: '套件' },
      [item({ documentId: 'd1', settings: settings({ color: true, duplex: true }) })],
      '2026-09-21'
    );
    expect(duplex).toContain('@page :left');
    expect(duplex).toContain('@page :right');
    expect(duplex).not.toContain('dp-doc dp-mono');
  });

  it('表格与图片页各按结构输出', () => {
    const html = buildDocumentSetPrintHtml(
      { name: '套件' },
      [
        item({
          documentId: 'd1',
          part: {
            documentId: 'd1',
            name: '统计表.xlsx',
            kind: 'table',
            sheets: [{ name: '花名册', rows: [['姓名', '部门'], ['张三', '<b>办公室</b>']] }],
            truncated: true,
          },
        }),
        item({
          documentId: 'd2',
          part: { documentId: 'd2', name: '照片.png', kind: 'pages', pages: ['data:image/png;base64,AAA'], truncated: false },
        }),
      ],
      '2026-09-21'
    );
    expect(html).toContain('<th>姓名</th>');
    expect(html).toContain('<td>&lt;b&gt;办公室&lt;/b&gt;</td>');
    expect(html).toContain('仅输出前部分数据');
    expect(html).toContain('<img class="dp-page" src="data:image/png;base64,AAA"');
    expect(html.match(/class="dp-doc/g)?.length).toBe(2);
  });

  it('不支持与读取失败都留下可见原因', () => {
    const html = buildDocumentSetPrintHtml(
      { name: '套件' },
      [
        item({ documentId: 'd1', part: { documentId: 'd1', name: '素材.zip', kind: 'unsupported', note: '暂不支持 .zip' } }),
        item({ documentId: 'd2', part: null }),
      ],
      '2026-09-21'
    );
    expect(html).toContain('暂不支持 .zip');
    expect(html).toContain('内容读取失败');
  });

  it('文件名/正文/套件名一律转义（打印窗口同源，不能注入）', () => {
    const html = buildDocumentSetPrintHtml(
      { name: '<script>alert(1)</script>' },
      [
        item({
          documentId: 'd1',
          name: '"><img src=x onerror=alert(2)>',
          part: textPart('d1', 'x', '<svg onload=alert(3)>'),
        }),
      ],
      '2026-09-21'
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;svg onload=alert(3)&gt;');
  });
});
