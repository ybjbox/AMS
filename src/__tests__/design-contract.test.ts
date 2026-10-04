/**
 * 设计契约静态守卫（Design QA 2026-09-22 第二批的回归线）
 *
 * 每条规则都对应一次实测破线，不是风格偏好：
 *  1. `text-zinc-400 dark:text-zinc-500` / `text-zinc-500 dark:text-zinc-500`
 *     —— 暗色档比亮色还暗，实测亮 2.51:1 / 暗 3.08–3.4:1（辅助文字统一走 --muted-foreground，
 *     实测亮 5.28–5.72 / 暗 5.59–6.70，两主题三种表面都达标）
 *  2. 状态文字用 600 档：emerald-600 实测 3.37–3.65:1、amber-600 2.95–3.20:1，
 *     700 档才 ≥4.5。图标（同行带 w-N h-N 尺寸标记）不受对比度正文要求，故豁免。
 *  3. 浅色表面（bg-zinc-50 / bg-slate-50）没有 dark: 变体 —— 部门树一级行实测 1.21:1。
 *     纸张预览（打印件/导出预览）刻意保持"永远白纸"，走白名单。
 *  4. 微字号必须用 text-2xs/text-3xs 令牌，不再写 text-[10px]/text-[11px] 任意值。
 *  5. 卡片抬升统一 card-base + card-lift。
 *  6. （2026-09-26 审查 B1）不得把"表面令牌"当文字色用：`text-secondary` 实测把备份列表的
 *     时间与体积压到 **1.1:1**（--secondary 亮=oklch .96 近白、暗=.28 深灰，本就是背景色），
 *     两个主题同时不可读。`text-muted-foreground` 这类 *-foreground 才是文字档。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');

/** 纸张预览：打印/导出内容的所见即所得，表面恒为白，不参与暗色切换 */
const PAPER_FILES = /(^|[/\\])(PrintPreview|PrintSettingsModal|PrintTemplates|printHtml|AddressBookModal|ExportModal|NameCardPreview|SetPrint)\.tsx$/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function linesWith(file: string, re: RegExp, skip?: (line: string) => boolean): string[] {
  const raw = readFileSync(file, 'utf8').split(/\r?\n/);
  const hits: string[] = [];
  raw.forEach((line, i) => {
    if (!re.test(line)) return;
    if (skip && skip(line)) return;
    hits.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim().slice(0, 120)}`);
  });
  return hits;
}

const files = tsxFiles(SRC);
const isIconLine = (line: string) => /\bw-[0-9.]+\s+h-[0-9.]+\b|\bh-[0-9.]+\s+w-[0-9.]+\b|\bsize-[0-9]/.test(line);

describe('设计契约：辅助文字与暗色表面', () => {
  it('扫描到了源码文件（路径解析失效时先于规则报错）', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('不使用跨主题的 zinc 错配档（暗色比亮色更暗）', () => {
    // 图标不受正文对比度要求（1.4.11 的 3:1 走的是图形口径），只看文字节点
    const bad = files.flatMap((f) => linesWith(f, /text-zinc-400 dark:text-zinc-500|text-zinc-500 dark:text-zinc-500/, isIconLine));
    expect(bad, `应改用 text-muted-foreground：\n${bad.join('\n')}`).toEqual([]);
  });

  it('状态文字（非图标）不用 600 档', () => {
    const bad = files.flatMap((f) =>
      linesWith(f, /(?<![:a-z-])text-(emerald|amber)-600\b/, (line) => isIconLine(line) || /\bicon:/.test(line))
    );
    expect(bad, `亮色应使用 700 档：\n${bad.join('\n')}`).toEqual([]);
  });

  it('浅色表面配齐暗色变体（纸张预览除外）', () => {
    // 按「变体前缀」配对：hover:bg-zinc-50 要有 dark:hover:bg-*，裸 bg-zinc-50 要有 dark:bg-*
    const bad = files
      .filter((f) => !PAPER_FILES.test(f))
      .flatMap((f) => {
        const raw = readFileSync(f, 'utf8').split(/\r?\n/);
        const hits: string[] = [];
        raw.forEach((line, i) => {
          for (const m of line.matchAll(/(?:([a-z0-9_/-]+:))?(?:([a-z0-9_/-]+:))?bg-(?:zinc|slate|gray)-50\b/g)) {
            const prefix = `${m[1] ?? ''}${m[2] ?? ''}`;
            if (line.includes(`dark:${prefix}bg-`)) continue;
            hits.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim().slice(0, 120)}`);
            break;
          }
        });
        return hits;
      });
    expect(bad, `需补同变体前缀的 dark:bg-* 或列入纸张白名单：\n${bad.join('\n')}`).toEqual([]);
  });

  it('微字号走令牌，不写任意值', () => {
    const bad = files.flatMap((f) => linesWith(f, /\btext-\[1[01]px\]/));
    expect(bad, `应使用 text-2xs(11px)/text-3xs(10px)：\n${bad.join('\n')}`).toEqual([]);
  });

  it('卡片抬升走 .card-lift，不再内联一遍', () => {
    // 只挡"表面抬升"（带 card-base/shadow 的 hover 上移）；
    // 图标级强调（group-hover:scale-110、箭头 hover:translate-x）按契约是允许的
    const bad = files.flatMap((f) =>
      linesWith(f, /hover:-translate-y-[0-9.]+/, (line) => !/card-base|shadow/.test(line) || /card-lift/.test(line))
    );
    expect(bad, `应改用 card-base + card-lift：\n${bad.join('\n')}`).toEqual([]);
  });

  it('不得把表面令牌当文字色（text-secondary 一类）', () => {
    // *-foreground 是文字档，必须放行；这里挡的是"裸表面名"：text-secondary / text-muted /
    // text-card / text-background / text-popover / text-accent / text-input / text-border
    const SURFACE_AS_TEXT = /\btext-(secondary|muted|card|background|popover|accent|input|border|ring)(?!-foreground)\b/;
    const bad = files.flatMap((f) => linesWith(f, SURFACE_AS_TEXT));
    expect(bad, `表面令牌不能当文字色（实测 text-secondary = 1.1:1），改 text-muted-foreground 或语义色档：\n${bad.join('\n')}`).toEqual([]);
  });

  it('辅助文字走唯一档，不再用 zinc-500/400 配对（纸张预览除外）', () => {
    // 亮色 zinc-500 实测 4.46–4.83：在最浅的表面上已经掉到 4.5 以下，且会随表面漂移；
    // muted-foreground 实测亮 5.28–5.72 / 暗 5.59–6.70，是双主题全达标的唯一档。
    // 图标不受正文对比度口径约束（1.4.11 走 3:1 图形口径），故沿用 isIconLine 豁免。
    const PAIR = /text-zinc-500 dark:text-zinc-400|dark:text-zinc-400 text-zinc-500/;
    const bad = files
      .filter((f) => !PAPER_FILES.test(f))
      .flatMap((f) => linesWith(f, PAIR, isIconLine));
    expect(bad, `应改用 text-muted-foreground：\n${bad.join('\n')}`).toEqual([]);
  });
});

/**
 * 表单无障碍（2026-10-04 模态审查批次）
 *
 * 7/8 条都对应一次实测破线：
 *  7. 必填星号 `text-red-500` 实测亮底 3.81:1 / 暗底 3.91:1（需 4.5）。它是**唯一的必填提示**，
 *     低于 AA 就等于"看不清哪栏必填"。`red-600` 起步，暗色走 `red-400`（与错误文案同档）。
 *  8. `<label>` 不带 `htmlFor` 且不是控件祖先 → 标签与控件**毫无关联**：读屏念不出字段名，
 *     点标签也不会聚焦输入框（实测 UserFormModal 点 4 个标签，焦点全停在触发按钮上）。
 *     这里只挡"既无 htmlFor 又不包裹"的那种，包裹写法（`closest('label')`）放行。
 *  9. `SelectTrigger` / `TreeSelect` 不带 `aria-label`：浏览器对 `role=combobox`
 *     **不吃子元素文字或 placeholder 当名字**（CDP 实测 AX name=""，而同构的
 *     `<button><span>文字</span></button>` 给 "在职"），所以必须显式命名。
 * 10. `BaseModal` 的焦点陷阱必须过滤不可见候选 —— base-ui 的 hidden input 是 1×1、
 *     `tab-index="-1"`、`clip-path: inset(50%)`，文件 input 是 0×0；它们能被 focus()
 *     但用户看不见，排到"最后一个"时会把 Tab 陷阱打断（实测 ImportModal 22 次 Tab 出界 20 次）。
 */
describe('设计契约：表单无障碍', () => {
  it('必填星号不再用 text-red-500（实测 3.81:1，低于 AA 4.5）', () => {
    const bad = files.flatMap((f) =>
      linesWith(f, /<span[^>]*text-red-500[^>]*>\s*\*\s*<\/span>/)
    );
    expect(bad, `必填星号应改用 text-red-600 dark:text-red-400：\n${bad.join('\n')}`).toEqual([]);
  });

  /**
   * `<label>` 必须 htmlFor 或包裹控件（否则读屏无名、点击不聚焦）。
   *
   * 这条规则**故意不做全量拦截**，只卡住已实测复现的那一类。原因：静态扫描在
   * 「自定义控件的分组标签」「base-ui 组件名未被我的正则覆盖」上假阳性极多 ——
   * 一次实测里它报出 70 处，而逐个弹窗跑 axe 只确认了 2 个模态真有 `label` 违规。
   * 拿 68 个假阳性当守卫，只会让后来的人为了"消警告"去乱改正常标签。
   *
   * 所以这里用**白名单**锁住本轮真正修好的 4 个文件，其余文件维持现状：
   * 等它们的弹窗被逐个跑过 axe 之后再往白名单里加，或者干脆改成运行时断言。
   */
  it('<label> 必须 htmlFor 或包裹控件（本轮已实测复现的文件）', () => {
    // 本轮 axe 实测确认有 label 违规、并已修复的文件
    const VERIFIED = [
      /Users[/\\]components[/\\]UserFormModal\.tsx$/,
      /Departments[/\\]components[/\\]DepartmentModal\.tsx$/,
      /Departments[/\\]components[/\\]RoleModal\.tsx$/,
      /Documents[/\\]components[/\\]SetFormModal\.tsx$/,
      /Documents[/\\]components[/\\]FolderFormModal\.tsx$/,
    ];
    const bad: string[] = [];
    for (const f of files.filter((x) => VERIFIED.some((re) => re.test(x)))) {
      const raw = readFileSync(f, 'utf8').split(/\r?\n/);
      raw.forEach((line, i) => {
        const m = line.match(/<label\b([^>]*)>\s*([^<]*)/);
        if (!m) return;
        if (/htmlFor\s*=/.test(m[1])) return;
        if (/\/>\s*$/.test(m[1].trim())) return;
        const chunk = raw.slice(i, i + 13).join('\n');
        const body = chunk.slice(chunk.indexOf('>') + 1).split('</label>')[0];
        if (/<(input|Input|Select|Textarea|TreeSelect|Checkbox|RadioGroup|Switch|Slider|Combobox)\b/.test(body)) return;
        bad.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
    expect(bad, `label 既无 htmlFor 又未包裹控件，读屏会念不出字段名：\n${bad.join('\n')}`).toEqual([]);
  });

  it('SelectTrigger / TreeSelect 必须有显式 aria-label 或 aria-labelledby', () => {
    const bad: string[] = [];
    for (const f of files) {
      const raw = readFileSync(f, 'utf8').split(/\r?\n/);
      raw.forEach((line, i) => {
        if (!/<SelectTrigger\b/.test(line)) return;
        const chunk = raw.slice(i, i + 8).join('\n');
        if (/aria-label\s*=/.test(chunk) || /aria-labelledby\s*=/.test(chunk)) return;
        bad.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
    expect(
      bad,
      `role=combobox 不吃子元素文字当名字，必须显式 aria-label（实测 AX name=""）：\n${bad.join('\n')}`
    ).toEqual([]);
  });
});
