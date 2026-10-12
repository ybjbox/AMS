/**
 * 人工校对表的「判定」与「★需确认」口径。
 *
 * 这两个函数在实测库里几乎走不到分支：skipped 恒为 0（没人有未归属卡）、
 * 所有在职员工的部门都配了时段。也就是说**真实数据验证不了它们** ——
 * 导出表上写着「★需确认 0 行」时，分不清是真的干净，还是判定根本没生效。
 * 所以这里穷举分支，把「哪天该被标出来」钉死。
 */
import { describe, it, expect } from 'vitest';
import { proofDayVerdict, proofDayFlag, type VerdictFinding } from '../attendanceDayVerdicts.ts';

// 夹具直接造 VerdictFinding（判定装配出来的形状），label 与 FINDING_CN 保持一致 ——
// 判定文案是这两函数唯一读进去的东西，测试要盯的就是它。
const OK: VerdictFinding[] = [];
const late = (minutes: number): VerdictFinding[] => [{ type: 'LATE_15', label: '迟到(>15分)', minutes }];
const missingIn: VerdictFinding[] = [{ type: 'MISSING_IN', label: '缺上班卡', minutes: null }];

const base = {
  noRule: false,
  isLeave: false,
  times: [] as string[],
  list: [] as { findings: VerdictFinding[]; single: boolean }[],
  orphan: [] as string[],
  borrowedInMonth: [] as string[],
  borrowedPrevMonth: [] as string[],
  monthEdge: false,
};

describe('proofDayVerdict：判定优先级', () => {
  it('没配时段最优先 —— 哪怕当天有卡、有班，也不能报"未对班"，那是两回事', () => {
    expect(proofDayVerdict({ noRule: true, isLeave: false, times: ['08:00'], list: [], borrowed: [] })).toBe('未配置时段');
  });

  it('已批准请假 → 请假，不再往下判', () => {
    expect(
      proofDayVerdict({
        noRule: false,
        isLeave: true,
        times: ['08:00', '18:00'],
        list: [{ findings: missingIn }],
        borrowed: [],
      })
    ).toBe('请假');
  });

  it('当天一张卡都没有 → 无打卡（不是"正常"，也不是"缺卡"）', () => {
    expect(proofDayVerdict({ noRule: false, isLeave: false, times: [], list: [], borrowed: [] })).toBe('无打卡');
  });

  it('卡都在被更早那天的班次吃掉 → 班次归前一日，不算当天缺勤', () => {
    expect(proofDayVerdict({ noRule: false, isLeave: false, times: ['00:03'], list: [], borrowed: ['00:03'] })).toBe('班次归前一日');
  });

  it('有卡但对不上任何时段 → 未对班', () => {
    expect(proofDayVerdict({ noRule: false, isLeave: false, times: ['03:17'], list: [], borrowed: [] })).toBe('未对班');
  });

  it('对上班且无异常 → 正常', () => {
    expect(
      proofDayVerdict({ noRule: false, isLeave: false, times: ['08:00', '18:00'], list: [{ findings: OK }], borrowed: [] })
    ).toBe('正常');
  });

  it('一天两个班次都迟到 → 两档都写出来，不合并成一条', () => {
    expect(
      proofDayVerdict({
        noRule: false,
        isLeave: false,
        times: ['08:20', '18:00', '19:30'],
        list: [{ findings: late(20) }, { findings: late(30) }],
        borrowed: [],
      })
    ).toBe('迟到(>15分) + 迟到(>15分)');
  });
});

describe('proofDayFlag：★ 的优先级', () => {
  it('干净的班什么都不标', () => {
    expect(proofDayFlag({ ...base, times: ['08:00', '18:00'], list: [{ findings: OK, single: false }] })).toBe('');
  });

  it('★未配置时段压过一切', () => {
    expect(proofDayFlag({ ...base, noRule: true, times: ['08:00'], orphan: ['08:00'], monthEdge: true })).toBe('★未配置时段');
  });

  it('★无法归属：有卡但对不上班', () => {
    expect(proofDayFlag({ ...base, times: ['03:17'] })).toBe('★无法归属');
  });

  it('★有未归属卡：对上班了，但当天还多出一张对不上的卡', () => {
    expect(
      proofDayFlag({ ...base, times: ['08:00', '18:00', '21:30'], list: [{ findings: OK, single: false }], orphan: ['21:30'] })
    ).toBe('★有未归属卡');
  });

  it('★下班卡可能在次日：跨零点的班末卡没到，且记录就停在这天', () => {
    expect(
      proofDayFlag({
        ...base,
        times: ['17:30'],
        list: [{ findings: missingIn, single: false }],
        monthEdge: true,
      })
    ).toBe('★下班卡可能在次日');
  });

  it('记录边界优先于单卡：同一天既有单卡又到边界，要报更值得问的那条', () => {
    expect(proofDayFlag({ ...base, times: ['17:30'], list: [{ findings: missingIn, single: true }], monthEdge: true })).toBe(
      '★下班卡可能在次日'
    );
  });

  it('请假一律不标 ★：人已经批过了，再标出来只是让校对的人白忙', () => {
    expect(proofDayFlag({ ...base, isLeave: true, times: ['08:00'], orphan: ['08:00'], monthEdge: true })).toBe('');
  });

  it('班次归上月 / 归前一日是提示不是 ★：那本来就是跨零点班的一部分', () => {
    expect(proofDayFlag({ ...base, times: ['00:03'], borrowedPrevMonth: ['00:03'] })).toBe('班次归上月');
    expect(proofDayFlag({ ...base, times: ['00:03'], borrowedInMonth: ['00:03'] })).toBe('班次归前一日');
  });

  it('整月没来 → 无考勤（不是 ★，因为没人能证实该来）', () => {
    expect(proofDayFlag({ ...base, times: [] })).toBe('无考勤');
  });

  it('单卡天要提示：只有一张卡时缺哪张是猜的，人来核一下才靠谱', () => {
    expect(proofDayFlag({ ...base, times: ['08:00'], list: [{ findings: missingIn, single: true }] })).toBe('单卡');
  });
});