/**
 * pdf.js worker 的换入/换出，以及**必须串行**这件事本身。
 *
 * 背景：unpdf 打包的 pdf.js 6.1 会把 worker 挂在 `globalThis.pdfjsWorker` 上，
 * 而 pdf-to-img 需要 6.2 的 worker（首次使用即被 6.1 的缓存钉死），所以渲染窗口内
 * 要先换入 6.2、结束后还原。问题是这个全局交换不是并发安全的：两个请求交错执行时，
 * 先结束的一方会把另一方正在用的 worker 删掉/换回去，结果是一份文档静默地
 * 「不支持在线打印」，日志里什么都没有。
 *
 * 打印（documentPrint）与扫描件 OCR（wechatNoticeRouter）是同一个全局的两处使用者，
 * 因此共用这一条串行链，而不是各自记得排队 —— 漏一处就又回到互相踩。
 */

type PdfWorkerGlobal = { pdfjsWorker?: unknown };

let chain: Promise<unknown> = Promise.resolve();
/** 当前在链上排队（含正在执行）的任务数，供诊断面板看积压 */
let pending = 0;

export function pdfRenderQueueDepth(): number {
  return pending;
}

/** 默认装载 pdf-to-img 需要的 6.2 worker（这条 import 只在真渲染时发生） */
function loadPdfjsWorker(): Promise<unknown> {
  return import("pdfjs-dist/build/pdf.worker.mjs");
}

/**
 * 在全局 worker 已被换入 pdf.js 6.2 的窗口内执行 fn；同一条链上串行，不并发。
 * loadWorker 可注入，只是为了让「串行」这件事能在测试里被钉住（不必真的拉起 pdf.js）。
 */
export async function withPdfWorker<T>(
  fn: () => Promise<T>,
  loadWorker: () => Promise<unknown> = loadPdfjsWorker
): Promise<T> {
  const run = async (): Promise<T> => {
    const g = globalThis as PdfWorkerGlobal;
    const prev = g.pdfjsWorker;
    g.pdfjsWorker = await loadWorker();
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete g.pdfjsWorker;
      else g.pdfjsWorker = prev;
    }
  };
  const task = chain.then(run, run);
  // 链本身永远不 reject，否则一次失败会把后面所有任务一起带走
  chain = task.catch(() => undefined);
  pending += 1;
  try {
    return await task;
  } finally {
    pending -= 1;
  }
}
