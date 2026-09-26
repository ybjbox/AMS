/**
 * pdf.js 全局 worker 的串行链（批次 3）。
 *
 * 打印与扫描件 OCR 共用 globalThis.pdfjsWorker：两条路各自换入换出时，先结束的一方
 * 会把另一方正在用的 worker 删掉，症状是一份文档"静默地不支持在线打印"，日志里什么都没有。
 * 这里不拉起 pdf.js，只钉串行语义本身（loadWorker 可注入正是为此）。
 */
import { describe, it, expect } from "vitest";
import { withPdfWorker, pdfRenderQueueDepth } from "../pdfWorker.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withPdfWorker", () => {
  it("并发任务交错执行也不会同时进入渲染窗口", async () => {
    let inside = 0;
    let maxInside = 0;
    const job = (ms: number) =>
      withPdfWorker(async () => {
        inside += 1;
        maxInside = Math.max(maxInside, inside);
        await new Promise((r) => setTimeout(r, ms));
        inside -= 1;
        return ms;
      });

    const results = await Promise.all([job(20), job(5), job(10)]);
    expect(maxInside).toBe(1);
    expect(results).toEqual([20, 5, 10]); // 串行但各自的返回值原样交回
    expect(pdfRenderQueueDepth()).toBe(0);
  });

  it("窗口内全局 worker 被换入、结束后还原", async () => {
    const g = globalThis as { pdfjsWorker?: unknown };
    const sentinel = "旧的 worker";
    g.pdfjsWorker = sentinel;
    const seen: unknown[] = [];
    await withPdfWorker(async () => {
      seen.push(g.pdfjsWorker);
      return 1;
    }, async () => "换入的 6.2 worker");
    expect(seen).toEqual(["换入的 6.2 worker"]);
    expect(g.pdfjsWorker).toBe(sentinel);
    delete g.pdfjsWorker;
  });

  it("一个任务失败不会把后面所有任务一起带走", async () => {
    const failing = withPdfWorker(async () => {
      throw new Error("渲染失败");
    }, async () => "w");
    await expect(failing).rejects.toThrow("渲染失败");
    await expect(
      withPdfWorker(async () => "后面的还在", async () => "w")
    ).resolves.toBe("后面的还在");
    expect(pdfRenderQueueDepth()).toBe(0);
  });

  it("窗口里没设过 worker 时结束后清空，不留残余", async () => {
    const g = globalThis as { pdfjsWorker?: unknown };
    delete g.pdfjsWorker;
    await withPdfWorker(async () => tick(), async () => "w");
    expect(g.pdfjsWorker).toBeUndefined();
  });
});
