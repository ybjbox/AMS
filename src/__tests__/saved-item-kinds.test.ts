/**
 * 留存条目类型的两份清单必须一模一样。
 *
 * 服务端 savedItemsDb.SAVED_ITEM_KINDS 是白名单，不在表里的 kind 一律 400「未知的留存类型」；
 * 前端 savedItemApi.SavedItemKind 只是类型，写错不会编译失败，也不会运行时报错 ——
 * 结果就是参数页看着能改、刷新就打回默认值。两边少一个名字，保存链路当场断。
 * （2026-09-27 加业务单份数参数时补的回归线；那个参数后来因为语义重复被删掉，规则留下。）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function kindsFromServer(): string[] {
  const src = readFileSync(path.join(ROOT, 'server/savedItemsDb.ts'), 'utf8');
  const block = /SAVED_ITEM_KINDS\s*=\s*\[([\s\S]*?)\]/u.exec(src)?.[1];
  if (!block) throw new Error('没找到 server/savedItemsDb.ts 的 SAVED_ITEM_KINDS');
  return [...block.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
}

function kindsFromClient(): string[] {
  const src = readFileSync(path.join(ROOT, 'src/services/savedItemApi.ts'), 'utf8');
  const block = /export type SavedItemKind =([\s\S]*?);\n/u.exec(src)?.[1];
  if (!block) throw new Error('没找到 src/services/savedItemApi.ts 的 SavedItemKind');
  return [...block.matchAll(/\|\s*'([^']+)'/gu)].map((m) => m[1]);
}

describe('saved-items 类型清单前后端一致', () => {
  it('服务端白名单与前端联合类型逐名相等', () => {
    const server = kindsFromServer();
    const client = kindsFromClient();
    expect(client.sort()).toEqual(server.sort());
  });

  it('两边都真的读到了清单（正则失配会让上一条断言空对空通过）', () => {
    const server = kindsFromServer();
    expect(server.length).toBeGreaterThanOrEqual(5);
    for (const kind of ['seating-plan', 'meal-voucher-spec', 'namecards-prefs']) {
      expect(server).toContain(kind);
    }
  });
});
