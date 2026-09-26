import { test, expect } from "@playwright/test";

/**
 * CSP 与首屏脚本的回归（批次 5）。
 *
 * 生产模式下 script-src 从 'unsafe-inline' 换成一次性 nonce，而**内联脚本被 CSP 挡掉是
 * 静默的**：AMS 那段主题启动脚本如果不带 nonce，页面只是退回默认主题，照常能起 ——
 * 冒烟测试全绿也测不出来（这就是当初写下 `<script(\s)` 漏掉 `<script>` 的检出过程）。
 * 所以这里直接对"发出去的字节 + 响应头"做断言，而不是只看页面能不能开。
 */
const nonceOf = (csp: string | undefined): string | null => {
  const m = /script-src[^;]*'nonce-([^']+)'/.exec(csp ?? "");
  return m ? m[1] : null;
};

test.describe("CSP", () => {
  test("生产模式：每个 <script> 都带响应头里的 nonce；开发模式：明确放行 unsafe-inline", async ({
    request,
  }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"] ?? "";
    const html = await res.text();
    const nonce = nonceOf(csp);

    if (nonce) {
      // 生产：script-src 里不能再有 'unsafe-inline'（style-src 保留是刻意的 —— 主题注入要内联样式）
      const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).toContain(`'nonce-${nonce}'`);
      const tags = html.match(/<script[^>]*>/g) ?? [];
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, `内联/外链脚本缺 nonce：${tag}`).toContain(`nonce="${nonce}"`);
      }
      // 内联事件处理器（onload=/onclick=…）在 nonce-only 下一定被挡，而且挡了没人心惊动：
      // 首屏只会静默少做一件事。所以直接在产物字节层面禁掉。
      // 先去掉注释再扫 —— 注释里会提到被删掉的那个 onload（就是这条规则当初抓到的东西）。
      const markup = html.replace(/<!--[\s\S]*?-->/g, "");
      expect(markup, "HTML 里不得有内联事件处理器").not.toMatch(/<[a-z][^>]*\son[a-z]+=/i);
    } else {
      // Vite 开发模式（HMR 要注入内联脚本）：宽松是刻意的，但必须显式写着
      expect(csp, "开发模式应带 'unsafe-inline' 的 script-src").toContain("script-src 'self' 'unsafe-inline'");
    }
    // 无论哪种模式，都不该给页面放开 object/base，且禁止被 iframe 嵌走
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  test("首屏加载不产生 CSP 违规", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Refused to execute|put into effect because/i.test(text)) violations.push(text);
    });
    page.on("pageerror", (e) => {
      if (/Content Security Policy/i.test(e.message)) violations.push(e.message);
    });
    await page.goto("/", { waitUntil: "load" });
    // 等到首屏真的渲染出来（ProtectedRoute 会跳到登录页，说明主脚本执行了）
    await expect(page.locator("h1, form").first()).toBeVisible({ timeout: 20_000 });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
