/**
 * 导入预览的逐行勾选口径（纯函数，可单测）。
 *
 * 为什么单独抽出来：勾选状态、筛选、批量动作三者会交叉出很多组合
 * （"只看重复"下全选，是把全表重复行都勾上，还是只勾当前可见的？）。
 * 这些规则散在组件里必然会出现"数字对不上"的情况，所以收在一处。
 *
 * 一条前提要先说清楚，否则会误解这个功能能干什么：
 * **重复行勾不勾，结果完全一样。** 判重键是 (工号,日期,时间)，
 * 姓名又由工号从员工档案唯一决定，所以重复行携带的信息与它重复的那行
 * 逐字段相同，导进去被唯一索引挡掉。勾选真正的价值是：
 *   - 决定哪些**新记录**要导入（这一项是真差异）
 *   - 配合筛选+批量，快速把成百上千的重复行取消掉而不必手动点
 */

export type PreviewFilter = 'all' | 'problem' | 'duplicate' | 'importable';

/**
 * 行可不可勾。
 *
 * 重复行**不可勾**，这是刻意与"用户想逐行处理重复行"的直觉相反的一条：
 * 重复行的判重键是 (工号,日期,时间)，姓名又由工号从员工档案唯一决定，
 * 所以它携带的信息与库里那一行逐字段相同 —— 勾它与不勾它，数据库结果完全一致。
 * 给一个勾选框等于承诺"勾了会做点什么"，而实际上什么都不会发生。
 * 所以重复行只被**统计和展示**（底部汇总、筛选、列表标记），不参与选择。
 *
 * 真正能靠勾选产生差异的是**有效的新记录**：勾不勾，决定它写不写进库。
 */
export function isRowSelectable(row: { errors: string[]; duplicate: boolean }): boolean {
  return row.errors.length === 0 && !row.duplicate;
}

export function matchesFilter(row: { errors: string[]; duplicate: boolean }, filter: PreviewFilter): boolean {
  switch (filter) {
    case 'problem':
      return row.errors.length > 0;
    case 'duplicate':
      return row.duplicate;
    case 'importable':
      return row.errors.length === 0;
    default:
      return true;
  }
}

export interface RowLike {
  rowNumber: number;
  errors: string[];
  duplicate: boolean;
}

/**
 * 批量动作只作用于**当前筛选下可见的行**。
 *
 * 这样"只看重复 → 全不选"不会顺手把另外四千行也取消掉 —— 用户切筛选是为了
 * 聚焦，不是为了换一批目标。反过来"全选"也只加当前可见的那些。
 */
export function applyBulk(
  rows: RowLike[],
  filter: PreviewFilter,
  action: 'all' | 'none' | 'invert',
  selected: ReadonlySet<number>
): Set<number> {
  const next = new Set(selected);
  for (const r of rows) {
    if (!matchesFilter(r, filter)) continue;
    // 重复行与错误行永远不在选中集合里，批量动作也别把它们塞进来
    if (!isRowSelectable(r)) {
      next.delete(r.rowNumber);
      continue;
    }
    if (action === 'all') next.add(r.rowNumber);
    else if (action === 'none') next.delete(r.rowNumber);
    else if (next.has(r.rowNumber)) next.delete(r.rowNumber);
    else next.add(r.rowNumber);
  }
  return next;
}

/**
 * 实际会送去导入的行。
 *
 * 与旧行为逐字一致（旧代码是 `filter((r) => r.errors.length === 0)`，
 * 而重复行 errors 非空，所以本来就被排除在外），差别只在于多了"用户主动取消"。
 */
export function rowsToImport<T extends RowLike>(rows: T[], selected: ReadonlySet<number>): T[] {
  return rows.filter((r) => selected.has(r.rowNumber) && isRowSelectable(r));
}

export interface ImportPreviewCounts {
  /** 勾中且可导入 → 真正会送去服务端并写进库的行数 */
  willImport: number;
  /** 勾中但被"全部"筛选隐藏的行数（用于提示，而不是错误） */
  willImportHidden: number;
  /** 库中已存在、无论如何都会被跳过的行数 */
  duplicates: number;
  /** 校验有错、导不进去的行数 */
  invalid: number;
  /** 用户主动取消的有效行数 */
  deselected: number;
  /** 当前筛选下可见的可勾选行数 */
  visibleSelectable: number;
  /** 当前筛选下可见的已勾选数 */
  visibleSelected: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

export function computeCounts<T extends RowLike>(
  rows: T[],
  filter: PreviewFilter,
  selected: ReadonlySet<number>
): ImportPreviewCounts {
  let willImport = 0;
  let willImportHidden = 0;
  let duplicates = 0;
  let invalid = 0;
  let deselected = 0;
  let visibleSelectable = 0;
  let visibleSelected = 0;

  for (const r of rows) {
    const visible = matchesFilter(r, filter);
    const selectable = isRowSelectable(r);

    if (selectable) {
      if (selected.has(r.rowNumber)) {
        willImport++;
        if (!visible) willImportHidden++;
      } else {
        deselected++;
      }
    } else if (r.duplicate) {
      duplicates++;
    } else {
      invalid++;
    }

    if (visible && selectable) {
      visibleSelectable++;
      if (selected.has(r.rowNumber)) visibleSelected++;
    }
  }

  return {
    willImport,
    willImportHidden,
    duplicates,
    invalid,
    deselected,
    visibleSelectable,
    visibleSelected,
    allVisibleSelected: visibleSelectable > 0 && visibleSelected === visibleSelectable,
    someVisibleSelected: visibleSelected > 0 && visibleSelected < visibleSelectable,
  };
}

export const PREVIEW_FILTERS: { id: PreviewFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'problem', label: '有问题' },
  { id: 'duplicate', label: '重复' },
  { id: 'importable', label: '可导入' },
];

export function filterLabel(id: PreviewFilter): string {
  return PREVIEW_FILTERS.find((f) => f.id === id)?.label ?? '全部';
}