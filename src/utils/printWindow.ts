/**
 * 打印链路：把 builder 产出的完整 HTML 送进打印介质。
 *
 * 三种介质：
 * - printInWindow：新窗口（档案标签、联系卡这类小尺寸一次性输出）
 * - printInIframe：隐藏 iframe（花名册、通讯录、排座台卡这种跟着主文档样式走的大版面）
 * - printReactTree：不重写版面的兜底法——把页面上已渲染好的 React 子树连同样式搬进独立文档再打印
 *
 * 这里刻意不做任何转义 —— HTML 必须由 printHtml 的 builder 生成，
 * 用户字段在其中已经过 escapeHtml 编码（P2-1）。
 */

/** 打开打印窗口。返回 false 表示被浏览器拦截，调用方应给出提示。 */
export function printInWindow(html: string, features = 'height=600,width=800'): boolean {
  const win = window.open('', '', features);
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 250);
  return true;
}

/** 在隐藏 iframe 里打印；打印对话框弹出后再清理并 resolve。 */
export function printInIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        resolve();
      }, 1000);
    }, 250);
  });
}

/**
 * 本文档的全部样式表（含组件写在 body 里的 <style>）。
 *
 * 独立打印文档必须自带样式，否则 Tailwind 类与组件内联的打印覆盖规则都会失效。
 */
export function collectDocumentStyles(): string {
  return [...document.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((node) => node.outerHTML)
    .join('\n');
}

/** 独立打印文档骨架（纯函数，可在 jsdom 里直接断言） */
export function composeReactPrintHtml(bodyHtml: string, stylesHtml: string, extraCss = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>打印</title>
${stylesHtml}
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
${extraCss}
</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * 把页面上已渲染好的子树原样送去打印。
 *
 * 为什么需要它：排座与台卡的版面依赖 Tailwind 的 `print:` 变体（只在打印媒体下生效），
 * 而这两页过去靠全局 `@media print { #root > * { display: none !important } }` 来「只留打印区」。
 * 那条规则连祖先一起隐藏，后代再怎么 display 也救不回来 —— 实测结果是打印出空白纸。
 * 搬到独立文档后全局 hack 可以删掉，版面仍由同一份 React 渲染决定（不重排、不漂移）。
 *
 * 返回 false 表示节点还没渲染出来（调用方应给提示，而不是打一张空纸）。
 */
export function printReactTree(node: HTMLElement | null | undefined, extraCss = ''): Promise<boolean> | false {
  if (!node) return false;
  const html = composeReactPrintHtml(node.outerHTML, collectDocumentStyles(), extraCss);
  return printInIframe(html).then(() => true);
}
