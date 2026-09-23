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
});
