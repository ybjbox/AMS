/**
 * 文档「一键打包打印」内容装配回归（第 7 批）：
 * 打印片段按类型走对分支、有上限、失败如实标注，并覆盖 HTTP 接线。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用例自建文档并在结束后删除
 * （deleteDocument 会连磁盘副本一起清掉）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import ExcelJS from "exceljs";
import fs from "fs";
import { createDocumentFromUpload, deleteDocument, getDocumentRaw } from "../documentsDb.ts";
import { asString } from "../sqliteUtil.ts";
import { documentsRouter } from "../documentsRouter.ts";
import { buildPrintPart, MAX_PRINT_TEXT_CHARS, type PrintPart } from "../documentPrint.ts";

const created: string[] = [];
let apiBase = "";
let httpServer: Server;

/** 1×1 透明 PNG */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function track<T extends { id: string }>(doc: T): T {
  created.push(doc.id);
  return doc;
}

type TextPart = Extract<PrintPart, { kind: "text" }>;
type PagesPart = Extract<PrintPart, { kind: "pages" }>;
type TablePart = Extract<PrintPart, { kind: "table" }>;
type UnsupportedPart = Extract<PrintPart, { kind: "unsupported" }>;

beforeAll(async () => {
  const app = express();
  app.use("/api/documents", documentsRouter);
  httpServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  apiBase = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/api/documents`;
});

afterAll(async () => {
  for (const id of created) deleteDocument(id);
  await new Promise<void>((r) => httpServer.close(() => r()));
});

describe("按类型装配", () => {
  it("txt → 文本片段", async () => {
    const doc = track(
      createDocumentFromUpload({ name: "制度说明.txt", buffer: Buffer.from("第一条 打卡时间\n第二条 请假流程", "utf8") })
    );
    const part = (await buildPrintPart(doc.id))!;
    expect(part.kind).toBe("text");
    expect((part as TextPart).text).toContain("请假流程");
    expect((part as TextPart).truncated).toBe(false);
    expect(MAX_PRINT_TEXT_CHARS).toBeGreaterThan(1000);
  });

  it("png → 单页图片 data URL", async () => {
    const doc = track(createDocumentFromUpload({ name: "台卡样式.png", buffer: PNG_1PX }));
    const part = (await buildPrintPart(doc.id))!;
    expect(part.kind).toBe("pages");
    const pages = (part as PagesPart).pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].startsWith("data:image/png;base64,")).toBe(true);
  });

  it("xlsx → 表格片段（逐表逐行取值，公式取结果）", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("花名册");
    ws.addRow(["姓名", "部门", "人数"]);
    ws.addRow(["张三", "办公室", 3]);
    ws.addRow(["李四", "研发部", { formula: "1+1", result: 2 }]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const doc = track(createDocumentFromUpload({ name: "统计表.xlsx", buffer }));

    const part = (await buildPrintPart(doc.id))!;
    expect(part.kind).toBe("table");
    const sheets = (part as TablePart).sheets;
    expect(sheets[0].name).toBe("花名册");
    expect(sheets[0].rows[0]).toEqual(["姓名", "部门", "人数"]);
    expect(sheets[0].rows[2]).toEqual(["李四", "研发部", "2"]);
  });

  it("未知类型与磁盘缺失都给出原因，不留空白页", async () => {
    const zip = track(createDocumentFromUpload({ name: "素材包.zip", buffer: Buffer.from("PK\x03\x04not really a zip") }));
    const zipPart = (await buildPrintPart(zip.id))!;
    expect(zipPart.kind).toBe("unsupported");
    expect((zipPart as UnsupportedPart).note).toContain("暂不支持");

    const doc = track(createDocumentFromUpload({ name: "磁盘副本会丢.txt", buffer: Buffer.from("内容") }));
    // 记录还在、磁盘副本没了（手工清 uploads 或备份恢复不完整）→ 如实说明而不是空白页
    fs.unlinkSync(asString(getDocumentRaw(doc.id)?.storedPath));
    const gone = (await buildPrintPart(doc.id))!;
    expect(gone.kind).toBe("unsupported");
    expect((gone as UnsupportedPart).note).toContain("存储副本");
  });

  it("文档记录不存在时返回 null（路由据此给 404）", async () => {
    expect(await buildPrintPart("no-such-doc")).toBeNull();
  });
});

describe("HTTP 层接线", () => {
  it("GET /documents/:id/print-part 返回片段，未知 id 返回 404", async () => {
    const doc = track(createDocumentFromUpload({ name: "接线测试.txt", buffer: Buffer.from("接线正文", "utf8") }));
    const res = await fetch(`${apiBase}/${doc.id}/print-part`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PrintPart & { documentId: string };
    expect(body.documentId).toBe(doc.id);
    expect(body.kind).toBe("text");

    const missing = await fetch(`${apiBase}/no-such-doc/print-part`);
    expect(missing.status).toBe(404);
  });
});
