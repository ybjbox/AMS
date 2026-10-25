import type { MySummary } from '@/services/myApi';

/**
 * /my 本月结论的离线副本。
 *
 * 车间、地库断网是常态：断网时宁可显示上次成功结果并明确标注，也不要把
 * 整页换成"没取到"。key 带用户名与月份，换人/换月都不会串数据。
 */
const PREFIX = 'ams.my.summary.v1';

export interface CachedSummary {
  at: string;
  data: MySummary;
}

const keyOf = (owner: string, month: string) => `${PREFIX}.${owner}.${month}`;

export function readSummaryCache(owner: string, month: string): CachedSummary | null {
  try {
    const raw = localStorage.getItem(keyOf(owner, month));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSummary;
    if (!parsed || typeof parsed.at !== 'string' || !parsed.data || parsed.data.month !== month) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSummaryCache(owner: string, month: string, data: MySummary): void {
  try {
    localStorage.setItem(keyOf(owner, month), JSON.stringify({ at: new Date().toISOString(), data }));
    prune(owner);
  } catch {
    /* 隐私模式/配额满：缓存失败不能影响正常渲染 */
  }
}

/** 每个账号最多留 6 个月，避免 localStorage 无限增长 */
function prune(owner: string): void {
  const prefix = `${PREFIX}.${owner}.`;
  const entries: Array<{ key: string; at: number }> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    let at = 0;
    try {
      at = Date.parse((JSON.parse(localStorage.getItem(key) || '{}') as CachedSummary).at) || 0;
    } catch {
      /* 坏数据按最旧处理 */
    }
    entries.push({ key, at });
  }
  if (entries.length <= 6) return;
  entries
    .sort((a, b) => a.at - b.at)
    .slice(0, entries.length - 6)
    .forEach(({ key }) => localStorage.removeItem(key));
}
