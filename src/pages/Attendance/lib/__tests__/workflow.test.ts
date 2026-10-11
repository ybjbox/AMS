/**
 * 四步工作流状态推导的回归。
 *
 * 这套状态是整个重排的支点：页面上的流程条、提示横幅、按钮可用性全读它。
 * 判错的后果不是样式走样，而是**误导** —— 最典型的就是把"还没分析"
 * 显示成"分析过了，0 条异常"，让人以为团队今天全勤。所以逐个状态钉死。
 */
import { describe, it, expect } from 'vitest';
import { deriveWorkflowSteps, STEP_BLOCK_HINTS } from '../workflow';
import type { WorkflowInput } from '../workflow';

const step = (input: Partial<WorkflowInput>, tab: string) =>
  deriveWorkflowSteps({
    shiftRuleCount: 0,
    recordCount: 0,
    anomalyCount: 0,
    analyzedAt: null,
    ...input,
  }).find((s) => s.tab === tab)!;

describe('空库：第一步都没做', () => {
  it('时段待处理，打卡/分析/月报全部缺前置', () => {
    expect(step({}, 'shift-rules').state).toBe('todo');
    expect(step({}, 'records').state).toBe('blocked');
    expect(step({}, 'anomalies').state).toBe('blocked');
    expect(step({}, 'monthly').state).toBe('blocked');
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

describe('时段与打卡都就绪，但还没分析', () => {
  const input = { shiftRuleCount: 11, recordCount: 1897 };

  it('分析与月报变 ready', () => {
    expect(step(input, 'records').state).toBe('done');
    expect(step(input, 'records').detail).toBe('1897 条已导入');
    expect(step(input, 'anomalies').state).toBe('ready');
    expect(step(input, 'monthly').state).toBe('ready');
  });

  it('分析步骤明说"尚未分析"——这是最容易和"分析过但没人异常"搞混的地方', () => {
    expect(step(input, 'anomalies').detail).toBe('尚未分析');
  });
});

describe('分析完成后', () => {
  it('分析 done 并带上时间，月报带出待处理异常数', () => {
    const s = step({ shiftRuleCount: 11, recordCount: 1897, anomalyCount: 70, analyzedAt: '2026-10-10T05:31:46.071Z' }, 'anomalies');
    expect(s.state).toBe('done');
    expect(s.detail).toMatch(/^上次 /);
    expect(step({ shiftRuleCount: 11, recordCount: 1897, anomalyCount: 70 }, 'monthly').detail).toBe('70 条异常待处理');
  });

  it('时间串坏掉时退回"已分析"，不显示 Invalid Date', () => {
    expect(step({ analyzedAt: 'not-a-date' }, 'anomalies').detail).toBe('上次 已分析');
  });
});

describe('真实库当前状态（回归钉住）', () => {
  it('11 条时段 + 1897 条打卡 + 已分析 → 只有月报还是 ready', () => {
    const steps = deriveWorkflowSteps({
      shiftRuleCount: 11,
      recordCount: 1897,
      anomalyCount: 70,
      analyzedAt: '2026-10-10T05:31:46.071Z',
    });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'ready']);
    expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4]);
  });
});