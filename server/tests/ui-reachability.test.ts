/**
 * 死 UI 可达性守门测试（node project 运行，纯文件系统检查，无 DOM 依赖）。
 *
 * 背景：BackupPanel / AiAssistant 等组件曾出现「编译通过、测试通过，但没有任何
 * 路由或父组件引用——用户永远看不到」的死 UI（见 docs/DESIGN-REVIEW.md P1-7）。
 * 本测试保证：src 下的页面入口、设置面板、顶层组件，必须能被其它 src 文件引用到。
 *
 * 判定规则：
 *  - 页面入口（src/pages/<X>/index.tsx 或 src/pages/<X>.tsx）：
 *    其它文件中必须出现模块路径片段 `pages/<X>`（routes.ts 的 lazy import、面板包装等）。
 *  - 设置面板（src/pages/Settings/panels/*.tsx）与顶层组件（src/components/*.tsx）：
 *    其它 src 文件中必须以词边界形式出现组件名（import 路径必然包含它）。
 *    引用扫描排除 __tests__ 与 *.test.*（测试引用 ≠ 应用可达）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(process.cwd(), 'src');

interface SrcFile {
  rel: string;
  content: string;
}

function collectFiles(dir: string, out: SrcFile[] = []): SrcFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC_ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectFiles(full, out);
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push({ rel, content: fs.readFileSync(full, 'utf-8') });
    }
  }
  return out;
}

const allFiles = collectFiles(SRC_ROOT);

/** 其它文件（排除自身与测试）中是否出现词边界形式的 token */
function isReferenced(base: string, self: string): boolean {
  const re = new RegExp(`\\b${base}\\b`);
  return allFiles.some((f) => f.rel !== self && re.test(f.content));
}

/**
 * 比 isReferenced 更严格：忽略 import 行。
 * 「import 了但从未渲染/调用」同样是死 UI（如某面板被移出 switch 却忘了删 import）。
 */
function isUsed(base: string, self: string): boolean {
  const re = new RegExp(`\\b${base}\\b`);
  return allFiles.some(
    (f) =>
      f.rel !== self &&
      f.content
        .split('\n')
        .filter((line) => !/^\s*import\b/.test(line))
        .some((line) => re.test(line))
  );
}

/** 其它文件中是否出现模块路径片段（如 `pages/Users`） */
function isPathReferenced(fragment: string, self: string): boolean {
  return allFiles.some((f) => f.rel !== self && f.content.includes(fragment));
}

/** 页面入口：src/pages/<X>/index.tsx 与 src/pages/<X>.tsx */
function pageEntries(): { self: string; fragment: string }[] {
  const out: { self: string; fragment: string }[] = [];
  const pagesRoot = path.join(SRC_ROOT, 'pages');
  for (const entry of fs.readdirSync(pagesRoot, { withFileTypes: true })) {
    const rel = path.join('pages', entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(path.join(pagesRoot, entry.name, 'index.tsx'))) {
        out.push({ self: rel.replace(/\\/g, '/') + '/index.tsx', fragment: `pages/${entry.name}` });
      }
    } else if (/\.tsx$/.test(entry.name)) {
      out.push({ self: rel.replace(/\\/g, '/'), fragment: `pages/${entry.name.replace(/\.tsx$/, '')}` });
    }
  }
  return out;
}

/** 已知未接线的工具组件：属「待采用」而非死功能，显式豁免并追踪（接线后请从清单移除） */
const KNOWN_UNREFERENCED = new Set<string>();

describe('死 UI 可达性守门（每个页面/面板/顶层组件都必须可达）', () => {
  it('设置面板全部挂载（P1-7 回归）', () => {
    const panelsDir = path.join(SRC_ROOT, 'pages', 'Settings', 'panels');
    const panels = fs
      .readdirSync(panelsDir)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ base: f.replace(/\.tsx$/, ''), self: `pages/Settings/panels/${f}` }));
    expect(panels.length).toBeGreaterThanOrEqual(12);

    const dead = panels.filter((p) => !isUsed(p.base, p.self));
    expect(dead.map((d) => d.base)).toEqual([]);
  });

  it('页面入口全部注册路由或被引用', () => {
    const dead = pageEntries().filter((e) => !isPathReferenced(e.fragment, e.self));
    expect(dead.map((d) => d.self)).toEqual([]);
  });

  it('顶层组件全部被引用（豁免清单除外）', () => {
    const components = fs
      .readdirSync(path.join(SRC_ROOT, 'components'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ base: f.replace(/\.tsx$/, ''), self: `components/${f}` }));

    const dead = components.filter(
      (c) => !KNOWN_UNREFERENCED.has(`${c.base}.tsx`) && !isUsed(c.base, c.self)
    );
    expect(dead.map((d) => d.base)).toEqual([]);
  });
});
