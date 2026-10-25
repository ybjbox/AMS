import { beforeEach, describe, expect, it } from 'vitest';
import type { MySummary } from '@/services/myApi';
import { readSummaryCache, writeSummaryCache } from '@/pages/MyPortal/summaryCache';

const summary = (month: string): MySummary => ({
  month,
  employeeId: 'EMP0001',
  coverage: { latestDate: '2026-10-24', month, coveredDays: 24, elapsedDays: 25, uncoveredDays: 1 },
  verdicts: [],
  anomalies: [],
  counts: { late: 0, missing: 0 },
});

describe('员工门户离线缓存', () => {
  beforeEach(() => localStorage.clear());

  it('写入后可按同月读回', () => {
    writeSummaryCache('hebing', '2026-10', summary('2026-10'));
    const cached = readSummaryCache('hebing', '2026-10');
    expect(cached?.data.month).toBe('2026-10');
    expect(cached?.at).toBeTruthy();
  });

  it('换月或换人不会串数据', () => {
    writeSummaryCache('hebing', '2026-10', summary('2026-10'));
    expect(readSummaryCache('hebing', '2026-09')).toBeNull();
    expect(readSummaryCache('other', '2026-10')).toBeNull();
  });

  it('坏数据按没有缓存处理，不抛错', () => {
    localStorage.setItem('ams.my.summary.v1.hebing.2026-10', '{oops');
    expect(readSummaryCache('hebing', '2026-10')).toBeNull();
  });

  it('每个账号最多保留 6 个月', () => {
    for (let m = 1; m <= 8; m += 1) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      writeSummaryCache('hebing', month, summary(month));
    }
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) || '').filter(
      (k) => k.startsWith('ams.my.summary.v1.hebing.')
    );
    expect(keys).toHaveLength(6);
  });
});
