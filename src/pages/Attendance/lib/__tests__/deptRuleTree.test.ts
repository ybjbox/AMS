/**
 * 组织树 + 时段的合并口径回归。
 *
 * 继承判定是这个文件唯一容易错的地方：
 *  - 自己配了 → 用自己的，**不**继承
 *  - 自己没配、最近祖先配了 → 继承，要记清是哪一级
 *  - 整条链上都没配 → 该部门不参与判定（不是"继承为空"，是"没有"）
 * 第三种最危险：把它当成"继承"就会让用户以为还在用上级的时段。
 */
import { describe, it, expect } from 'vitest';
import { buildDeptRuleTree, treeStats } from '../deptRuleTree';
import type { DepartmentNode } from '@/types/department';
import type { DeptShiftRule } from '@/services/attendanceApi';

const dept = (id: string, name: string, children?: DepartmentNode[]): DepartmentNode =>
  children ? { id, name, children } : { id, name };

const rule = (id: string, departmentId: string, name = '早班'): DeptShiftRule => ({
  id,
  departmentId,
  departmentName: '',
  name,
  startTime: '08:00',
  endTime: '16:00',
  workdays: [1, 2, 3, 4, 5, 6, 7],
  assumeMissingIn: false,
  overtimeGraceMinutes: 120,
});

describe('合并组织树与时段', () => {
  const tree = buildDeptRuleTree(
    [
      dept('D1', '集团', [
        dept('D2', '市场部', [dept('D3', '夜班组'), dept('D4', '消防监控组')]),
      ]),
      dept('D5', '独立部门'),
    ],
    [rule('r1', 'D1'), rule('r2', 'D2', '晚班')]
  );

  it('根节点与层级被保留', () => {
    expect(tree.roots.map((n) => n.department.name)).toEqual(['集团', '独立部门']);
    const market = tree.roots[0].children[0];
    expect(market.children.map((n) => n.department.name)).toEqual(['夜班组', '消防监控组']);
  });

  it('自己配了就算自己的，且不标继承', () => {
    const market = tree.roots[0].children[0];
    expect(market.rules).toHaveLength(1);
    expect(market.inheritedFrom).toBeNull();
  });

  it('未配置的子部门继承最近祖先，并记清来源', () => {
    const night = tree.roots[0].children[0].children[0];
    expect(night.rules).toHaveLength(0);
    expect(night.inheritedFrom).toEqual({ id: 'D2', name: '市场部', depth: 1 });
    expect(night.effectiveCount).toBe(1);
  });

  it('隔级继承指向最近的、真的配了的那一级，不是根', () => {
    const fire = tree.roots[0].children[0].children[1];
    expect(fire.inheritedFrom).toEqual({ id: 'D2', name: '市场部', depth: 1 });
  });

  it('整条链都没配 → 不参与判定（不是"继承空"）', () => {
    const lone = tree.roots[1];
    expect(lone.rules).toHaveLength(0);
    expect(lone.inheritedFrom).toBeNull();
    expect(lone.effectiveCount).toBe(0);
  });

  it('根节点配了时段，子孙都指向根', () => {
    const t = buildDeptRuleTree([dept('R', '集团', [dept('C', '二级')])], [rule('r', 'R')]);
    expect(t.roots[0].children[0].inheritedFrom).toEqual({ id: 'R', name: '集团', depth: 0 });
  });

  it('部门已删除的时段被单独收集，不静默丢弃', () => {
    const t = buildDeptRuleTree([dept('D1', '集团')], [rule('r1', 'D1'), rule('gone', 'GONE')]);
    expect(t.orphaned.map((r) => r.id)).toEqual(['gone']);
    expect(t.roots[0].rules).toHaveLength(1);
  });

  it('不改动传入的数组', () => {
    const rules = [rule('r1', 'D1')];
    buildDeptRuleTree([dept('D1', '集团')], rules);
    expect(rules).toHaveLength(1);
  });

  it('空输入不炸', () => {
    const t = buildDeptRuleTree([], []);
    expect(t.roots).toEqual([]);
    expect(t.orphaned).toEqual([]);
  });
});

describe('统计', () => {
  it('配了时段的部门数、时段数、完全没覆盖的部门数', () => {
    const tree = buildDeptRuleTree(
      [dept('D1', '集团', [dept('D2', '市场部'), dept('D9', '空部门')])],
      [rule('r1', 'D1'), rule('r2', 'D1', '晚班')]
    );
    const s = treeStats(tree);
    expect(s.departments).toBe(1); // 只有 D1
    expect(s.rules).toBe(2);
    expect(s.uncovered).toBe(0); // 市场部继承得到，覆盖到了
  });

  it('根也没配时，未覆盖数要把整条链都算上', () => {
    const tree = buildDeptRuleTree([dept('D1', '集团', [dept('D2', '市场部')])], []);
    const s = treeStats(tree);
    expect(s.uncovered).toBe(2); // 集团 + 市场部
    expect(s.departments).toBe(0);
  });
});