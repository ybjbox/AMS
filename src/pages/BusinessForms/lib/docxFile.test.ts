import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import { DATE_RIGHT_INDENT, LAYOUT } from './layout';
import { buildFormDocument } from './docxFile';
import type { BusinessForm } from './templates';

const form: BusinessForm = {
  kind: 'condolence',
  department: '集团办公室',
  name: '杨新宇',
  date: '2026-08-24',
  relation: '父亲',
  amount: 501,
  body: '根据集团规章制度规定，集团办公室员工杨新宇，因其父亲不幸离世……\n呈上级领导批示。',
};

describe('.docx 导出', () => {
  it('打包出合法 OOXML 包（zip 头），几何与字号写入 document.xml', async () => {
    const b64 = await Packer.toBase64String(buildFormDocument([form]));
    expect(b64.startsWith('UEs')).toBe(true); // PK\x03\x04
    const xml = await extractDocumentXml(b64);
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"');
    expect(xml).toContain('w:w="10080"'); // 表格总宽
    expect(xml).toContain(`w:w="${LAYOUT.tableIndent}"`); // 表格左偏移（整块水平居中）
    expect(xml).toContain('<w:gridCol w:w="2160"');
    expect(xml).toContain('w:line="360"');
    expect(xml).toContain('呈上级领导批示。');
    expect(xml).toContain('<w:b/>'); // 姓名加粗
  });

  it('日期与打印 HTML 同一条基线：右对齐 + w:ind right 推到表格右边往里 575 twips', async () => {
    const xml = await extractDocumentXml(await Packer.toBase64String(buildFormDocument([form])));
    expect(xml).toMatch(/<w:jc w:val="right"\s*\/>/u);
    expect(xml).toMatch(new RegExp(`<w:ind [^>]*w:right="${DATE_RIGHT_INDENT}"`, 'u'));
    // 不能再有前导空格：位置由对齐决定，与字宽估算无关
    expect(xml).not.toMatch(/ {5,}2026年/u);
  });

  it('Word 一页一条：几条单据就是几节几页，不跟着打空白单', async () => {
    const xml = await extractDocumentXml(
      await Packer.toBase64String(buildFormDocument([form, { ...form, name: '林思婷' }]))
    );
    // 一节一页：两条 = 两个 sectPr、两张表格、两个标题，且没有第三条空白
    expect((xml.match(/<w:sectPr/gu) ?? []).length).toBe(2);
    expect((xml.match(/<w:tbl>/gu) ?? []).length).toBe(2);
    expect((xml.match(/业务单</gu) ?? []).length).toBe(2);
    const one = await extractDocumentXml(await Packer.toBase64String(buildFormDocument([form])));
    expect((one.match(/<w:tbl>/gu) ?? []).length).toBe(1);
  });
});

/** 直接从 zip 里取出 word/document.xml（stored 条目无需解压，deflate 用原生 DecompressionStream） */
async function extractDocumentXml(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  let p = 0;
  const dec = new TextDecoder();
  while (p < bytes.length && dec.decode(bytes.subarray(p, p + 4)) === 'PK\x03\x04') {
    const method = dv.getUint16(p + 8, true);
    const compSize = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + compSize);
    p += 30 + nameLen + extraLen + compSize;
    if (name !== 'word/document.xml') continue;
    if (method === 0) return dec.decode(data);
    // jsdom 的 Blob 没有 stream()，直接手搓 ReadableStream 走原生 inflate-raw
    const raw = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const inflated = raw.pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(inflated as unknown as BodyInit).arrayBuffer());
  }
  throw new Error('word/document.xml not found in docx package');
}
