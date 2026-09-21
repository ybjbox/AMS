/**
 * 人民币金额大写换算（票据口径）。
 *
 * 与业务单原件中的写法一致：501 → 伍佰零壹元整、600 → 陆佰元整、2986 → 贰仟玖佰捌拾陆元整。
 */

const CN_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const GROUPS = ['', '万', '亿'];

/** 整数元部分（不含「元」字）：逐位换算，零折叠为一个「零」，组单位（万/亿）在组末补上 */
function yuanToUpper(digits: string): string {
  const n = digits.length;
  let out = '';
  let zero = false;
  for (let i = 0; i < n; i++) {
    const d = Number(digits[i]);
    const pos = n - 1 - i;
    const unitIdx = pos % 4;
    const groupIdx = Math.floor(pos / 4);
    if (d === 0) {
      zero = true;
    } else {
      if (zero && out) out += '零';
      out += CN_NUM[d] + UNITS[unitIdx];
      zero = false;
    }
    if (unitIdx === 0 && groupIdx > 0) {
      const groupStart = Math.max(0, n - groupIdx * 4 - 4);
      if (/[1-9]/u.test(digits.slice(groupStart, i + 1))) out += GROUPS[groupIdx];
    }
  }
  return out;
}

/** 金额（元）→ 中文大写；非法值返回空串，由调用方兜底 */
export function rmbUpper(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  const cents = Math.round(value * 100);
  if (cents <= 0) return '零元整';
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;

  const intText = yuan > 0 ? yuanToUpper(String(yuan)) + '元' : '';
  if (jiao === 0 && fen === 0) return `${intText}整`;

  let frac = '';
  if (jiao > 0) frac += CN_NUM[jiao] + '角';
  if (fen > 0) frac += (jiao === 0 && yuan > 0 ? '零' : '') + CN_NUM[fen] + '分';
  return intText ? `${intText}${frac}` : frac;
}

/** 金额显示串：整数不带小数位，含角分时保留两位（原件两种写法都有） */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
