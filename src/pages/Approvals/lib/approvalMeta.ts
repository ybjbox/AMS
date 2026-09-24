import type { Approval } from '@/services/approvalApi';

/**
 * 审批类型的展示口径（列表标题、单行摘要、提交区的类型页签）。
 *
 * 原先这三段散在 Approvals/index.tsx 里：页签一份字面量、标题一份 map、摘要一份 if 链。
 * 服务端另有一份（server/approvalTypes.ts 的标签与通知文案）。两处的职责不同
 * —— 那份管"发给申请人的话"，这份管"列表里怎么看" —— 但类型名必须一致，
 * 所以每加一类，两边各改一处即可，不再在同一个 700 多行的页面里找分支。
 */
export const APPROVAL_TABS = [
  { id: 'leave', label: '请假' },
  { id: 'makeup', label: '补卡' },
  { id: 'conversion', label: '转正' },
  { id: 'resign', label: '离职' },
  { id: 'overtime', label: '加班' },
] as const;

export type ApprovalTabId = (typeof APPROVAL_TABS)[number]['id'];

const TITLE_BY_TYPE: Record<string, string> = {
  makeup: '补卡',
  conversion: '转正',
  resign: '离职',
  overtime: '加班',
};

/** 条目主标题：补卡/转正/离职/加班显示类型名，请假显示假别（事假/病假/…） */
export function approvalTitle(item: Pick<Approval, 'type' | 'leaveType'>): string {
  return TITLE_BY_TYPE[item.type] ?? item.leaveType;
}

/** 单行摘要：按类型展示最关键的信息 */
export function approvalSummary(item: Approval): string {
  switch (item.type) {
    case 'makeup':
      return `${item.punchDate || item.startDate} ${item.punchTime} · ${item.punchKind}`;
    case 'resign':
      return `最后工作日 ${item.startDate}`;
    case 'conversion':
      return '试用期转正申请';
    case 'overtime':
      return `${item.startDate} · ${item.hours} 小时`;
    default:
      return `${item.startDate}${item.endDate && item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}`;
  }
}
