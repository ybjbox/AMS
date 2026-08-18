/**
 * 安全 CSS 属性白名单：仅保留「纯呈现 / 排版 / 间距 / 边框」类属性，
 * 剔除一切可用于存储型 HTML 中「视觉欺骗」的属性。
 *
 * 威胁模型（AUDIT P2-2）：合同模板经 DOMPurify 后仍放行 `style`，
 * 攻击者可写入 `color:white`、`font-size:0`、`display:none`、
 * `position:absolute` 叠字、`opacity:0` 等，在新窗口打印时
 * 隐藏/伪造合同条款。本工具把 `style` 收敛到白名单，消除该路径。
 *
 * 设计取舍：
 * - 剔除 `color` / `background*`：防止「白字盖条款」「白底遮字」类欺骗
 *   （本组件外层容器已统一设定 SimSun 黑字，不影响可读性）。
 * - 剔除 `display` / `visibility` / `opacity` / `height` / `overflow` /
 *   `position` / `z-index` / `transform` / `float` 等：防止隐藏、裁剪、叠层。
 * - 剔除 `url(...)` 与 `expression(...)`：DOMPurify 原生也会处理，此处纵深防御。
 */

// 允许的 CSS 属性（小写）。使用 Set 便于 O(1) 查询。
const ALLOWED_CSS_PROPERTIES = new Set<string>([
  // 字体与排版
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'text-decoration',
  'text-decoration-line',
  'text-align',
  'text-indent',
  'text-transform',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'white-space',
  'vertical-align',
  'text-shadow',
  'direction',
  'text-overflow',
  'word-break',
  'box-sizing',
  // 外边距 / 内边距
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  // 边框（不含 border-color，避免覆盖容器黑字配色实现欺骗）
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-collapse',
  'border-spacing',
  'border-radius',
  // 尺寸（仅 width，height 可用于裁剪隐藏，剔除）
  'width',
  'table-layout',
  'max-width',
  'min-width',
  // 列表
  'list-style',
  'list-style-type',
  'list-style-position',
  'list-style-image',
]);

// 任何声明中出现这些危险值的子串，直接丢弃整条声明。
const DANGEROUS_VALUE_PATTERNS = [
  /url\s*\(/i, // url(...) —— 可用于 javascript: / data: URI 等
  /expression\s*\(/i, // IE 老式表达式
  /javascript:/i,
  /data:\s*(?!image\/)/i, // 非图片 data: URI
];

/**
 * 清洗单个 `style` 属性原始值，仅保留白名单内的声明。
 * @param raw style 属性原始字符串，如 `color:white; font-size:18px; display:none`
 * @returns 清洗后的 style 字符串；若无可保留声明则返回空串。
 */
export function sanitizeStyleAttribute(raw: string | null | undefined): string {
  if (!raw) return '';

  const declarations = raw.split(';');
  const kept: string[] = [];

  for (const decl of declarations) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue; // 非法声明（无冒号）

    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();

    if (!prop || !value) continue;
    if (!ALLOWED_CSS_PROPERTIES.has(prop)) continue; // 不在白名单 → 丢弃

    // 危险值子串防御
    let dangerous = false;
    for (const pat of DANGEROUS_VALUE_PATTERNS) {
      if (pat.test(value)) {
        dangerous = true;
        break;
      }
    }
    if (dangerous) continue;

    // 零字号 / 零行高可用于隐藏文本（视觉欺骗），剔除。
    // 形如 `0`、`0px`、`0em`、`0%` 等。
    if (
      (prop === 'font-size' || prop === 'line-height') &&
      /^0(\s*(px|em|rem|pt|%|ex|ch|vw|vh|cm|mm|in)?)?$/i.test(value)
    ) {
      continue;
    }

    kept.push(`${prop}:${value}`);
  }

  return kept.join(';');
}
