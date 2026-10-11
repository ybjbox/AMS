/**
 * 部门工作时段按**组织架构**呈现（纯函数，可单测）。
 *
 * 为什么不能是一张平铺表：时段是"部门属性"，而判定规则是「没配就沿用上级」。
 * 平铺成「部门 / 时段 / 上班 / 下班」后，父子继承这条最关键的信息完全看不见 ——
 * 用户看到市场部办公室配了 08:30-18:00，却不知道它下面还有 5 个部门在用它；
 * 看到某个部门一行都没有，也不知道是没配还是在继承。
 *
 * 所以这里把组织树和时段合成一棵树，让"谁配的、谁在继承、谁真的没配"一眼可见。
 */
import type { DepartmentNode } from '@/types/department';
import type { DeptShiftRule } from '@/services/attendanceApi';

export interface DeptRuleNode {
  department: DepartmentNode;
  /** 本部门直接配置的时段 */
  rules: DeptShiftRule[];
  /**
   * 本部门没配时，实际生效来自哪个祖先部门。
   * null 表示本部门自己配了（或自己是根且没配）。
   */
  inheritedFrom: { id: string; name: string; depth: number } | null;
  /** 本部门实际生效的时段数（含继承）。为 0 表示这个部门的员工不参与异常判定 */
  effectiveCount: number;
  children: DeptRuleNode[];
}

export interface DeptRuleTree {
  roots: DeptRuleNode[];
  /**
   * 挂在已删除部门上的时段（部门树里已经没有它们了）。
   * 必须单独报出来而不是悄悄丢掉 —— 否则用户会以为规则不存在，
   * 实际上这些规则还在库里生效条件之外悬着。
   */
  orphaned: DeptShiftRule[];
}

export function buildDeptRuleTree(departments: DepartmentNode[], rules: DeptShiftRule[]): DeptRuleTree {
  const byDept = new Map<string, DeptShiftRule[]>();
  for (const r of rules) {
    const list = byDept.get(r.departmentId);
    if (list) list.push(r);
    else byDept.set(r.departmentId, [r]);
  }

  const walk = (
    nodes: DepartmentNode[],
    /** 最近的、已配时段的祖先（自己之前那一层） */
    ancestor: { id: string; name: string; depth: number } | null,
    depth: number
  ): DeptRuleNode[] =>
    nodes.map((node) => {
      const own = (byDept.get(node.id) ?? []).slice();
      const hasOwn = own.length > 0;
      const inheritedFrom = hasOwn ? null : ancestor;
      // 生效数 = 自己的 + 继承来的（继承的那份已经算在祖先节点上了，这里只标出来源）
      const effectiveCount = hasOwn ? own.length : ancestor ? 1 : 0;
      return {
        department: node,
        rules: own,
        inheritedFrom,
        effectiveCount,
        children: walk(node.children ?? [], hasOwn ? { id: node.id, name: node.name, depth } : ancestor, depth + 1),
      };
    });

  const roots = walk(departments, null, 0);

  // 挂在树外（部门已删）的时段单独收集
  const seen = new Set<string>();
  const collect = (nodes: DeptRuleNode[]) => {
    for (const n of nodes) {
      seen.add(n.department.id);
      collect(n.children);
    }
  };
  collect(roots);
  const orphaned = rules.filter((r) => !seen.has(r.departmentId));

  return { roots, orphaned };
}

/** 整棵树里配了时段的部门数 / 时段总数 / 没有任何可用时段的部门数 */
export function treeStats(tree: DeptRuleTree): { departments: number; rules: number; uncovered: number } {
  let departments = 0;
  let rules = 0;
  let uncovered = 0;
  const walk = (nodes: DeptRuleNode[]) => {
    for (const n of nodes) {
      if (n.rules.length > 0) {
        departments += 1;
        rules += n.rules.length;
      } else if (n.effectiveCount === 0) {
        uncovered += 1;
      }
      walk(n.children);
    }
  };
  walk(tree.roots);
  return { departments, rules, uncovered };
}