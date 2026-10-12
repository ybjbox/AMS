/**
 * 四步工作流状态推导的回归。
 *
 * 这套状态是整个重排的支点：页面上的流程条、提示横幅、按钮可用性全读它。
 * 判错的后果不是样式走样，而是**误导** —— 最典型的就是把"还没分析"
 * 显示成"分析过了，0 条异常"，让人以为团队今天全勤。所以逐个状态钉死。
 *
 * 2026-10-12 起第②步看的是**数据新鲜度**而不是"库里有没有过打卡"：
 * 原先只要导过一次就永远绿色"已完成"，而"这个月还没导"恰恰是最常发生的事。
 */
import { describe, it, expect } from 'vitest';
import { deriveWorkflowSteps, punchFreshness, STALE_PUNCH_DAYS, STEP_BLOCK_HINTS } from '../workflow';
import type { WorkflowInput } from '../workflow';

const step = (input: Partial<WorkflowInput>, tab: string) =>
  deriveWorkflowSteps({
    shiftRuleCount: 0,
    recordCount: 0,
    analyzedAt: null,
    freshness: null,
    recentAnomalies: null,
    ...input,
  }).find((s) => s.tab === tab)!;

const fresh = (daysAgo: number, latestDate = '2026-10-01') => ({ latestDate, daysAgo });

describe('空库：第一步都没做', () => {
  it('时段待处理，打卡/分析/月报全部缺前置', () => {
    expect(step({}, 'shift-rules').state).toBe('todo');
    expect(step({}, 'records').state).toBe('blocked');
    expect(step({}, 'records').detail).toBe('尚未导入');
    expect(step({}, 'anomalies').state).toBe('blocked');
    expect(step({}, 'monthly').state).toBe('blocked');
    expect(step({}, 'monthly').detail).toBe('需先有打卡数据');
  });

  it('被卡住的步骤都配了说明文案（不能只显示一个红叉）', () => {
    for (const tab of ['records', 'anomalies', 'monthly'] as const) {
      expect(STEP_BLOCK_HINTS[tab], `${tab} 缺提示文案`).toBeTruthy();
    }
  });
});

describe('只配了时段', () => {
  it('时段 done，打卡变 ready，分析与月报仍缺前置', () => {
    const input = { shiftRuleCount: 11 };
    expect(step(input, 'shift-rules').state).toBe('done');
    expect(step(input, 'shift-rules').detail).toBe('11 条已配置');
    expect(step(input, 'records').state).toBe('ready');
    expect(step(input, 'anomalies').state).toBe('blocked');
    expect(step(input, 'monthly').state).toBe('blocked');
  });
});

describe('第②步看新鲜度，不看"有没有导过"', () => {
  const base = { shiftRuleCount: 11, recordCount: 1897 };

  it('刚导过：done，并把最新打卡日与距今天数写出来', () => {
    const s = step({ ...base, freshness: fresh(2) }, 'records');
    expect(s.state).toBe('done');
    expect(s.detail).toBe('最新 2026-10-01 · 2 天前');
  });

  it(`超过 ${STALE_PUNCH_DAYS} 天没新打卡：回到待处理，不再顶着绿色`, () => {
    expect(step({ ...base, freshness: fresh(STALE_PUNCH_DAYS) }, 'records').state).toBe('done');
    expect(step({ ...base, freshness: fresh(STALE_PUNCH_DAYS + 1) }, 'records').state).toBe('todo');
  });

  it('分析步骤明说"尚未分析"——这是最容易和"分析过但没人异常"搞混的地方', () => {
    expect(step({ ...base, freshness: fresh(1) }, 'anomalies').detail).toBe('尚未分析');
  });
});

describe('月报第④步：异常数按最近一个考勤月收窄', () => {
  it('写清是哪个月的多少条，不再报全历史累计', () => {
    const s = step({ shiftRuleCount: 11, recordCount: 1897, recentAnomalies: { month: '2026-09', count: 58 } }, 'monthly');
    expect(s.detail).toBe('58 条异常待处理 · 2026-09');
    expect(s.state).toBe('ready');
  });

  it('分析完成后：分析 done 并带上时间', () => {
    const s = step({ analyzedAt: '2026-10-10T05:31:46.071Z' }, 'anomalies');
    expect(s.state).toBe('done');
    expect(s.detail).toMatch(/^上次 /);
  });

  it('时间串坏掉时退回"已分析"，不显示 Invalid Date', () => {
    expect(step({ analyzedAt: 'not-a-date' }, 'anomalies').detail).toBe('上次 已分析');
  });
});

describe('punchFreshness：日期串自己算，别到组件里现写', () => {
  const today = new Date(2026, 9, 12); // 2026-10-12

  it('取最新的一天并算距今天数', () => {
    expect(punchFreshness(['2026-09-30', '2026-10-01', '2026-08-31'], today)).toEqual({
      latestDate: '2026-10-01',
      daysAgo: 11,
    });
  });

  it('一条日期都没有 → null（第②步据此显示"尚未导入"）', () => {
    expect(punchFreshness([], today)).toBeNull();
    expect(punchFreshness([''], today)).toBeNull();
  });

  it('未来的日期不出现负数（导错表时不该显示"-3 天前"）', () => {
    expect(punchFreshness(['2026-10-20'], today)?.daysAgo).toBe(0);
  });
});

describe('真实库当前状态（回归钉住）', () => {
  it('11 条时段 + 打卡停在 11 天前 + 已分析 → 第②步是待处理，不是已完成', () => {
    const steps = deriveWorkflowSteps({
      shiftRuleCount: 11,
      recordCount: 1897,
      analyzedAt: '2026-10-11T08:56:05.000Z',
      freshness: fresh(11),
      recentAnomalies: { month: '2026-10', count: 6 },
    });
    expect(steps.map((s) => s.state)).toEqual(['done', 'todo', 'done', 'ready']);
    expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(steps[1].detail).toBe('最新 2026-10-01 · 11 天前');
  });
});
