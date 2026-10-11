/**
 * 考勤四步工作流的状态推导（纯函数，可单测）。
 *
 * 这里是整个模块"操作逻辑"的收口处：跨页的判断 —— 时段配了没、打卡导了没、
 * 分析跑过没、哪一步被什么卡住 —— 全部集中在这里算一次。
 * 界面上的工作流条、页头按钮、空状态、提示横幅都读同一份推导结果，
 * 不再各自写 if（那正是原来"异常是 0 条却看不出原因"的根源）。
 *
 * 放 lib 而不是组件文件：一是要单测，二是组件文件导出非组件会破坏
 * Fast Refresh（eslint react-refresh/only-export-components）。
 */
import type { TabType } from '../hooks/useAttendance';

export type StepState =
  /** 还没做，且也不依赖别人 */
  | 'todo'
  /** 可以做了 */
  | 'ready'
  /** 做完了 */
  | 'done'
  /** 前置没满足，强行做会得到误导性的空结果 */
  | 'blocked';

/**
 * 工作流涉及的目标。注意它比 TabType 多一个 'shift-rules' ——
 * 第①步不在标签栏里，是弹窗，所以不能直接复用标签的类型。
 */
export type WorkflowTab = TabType | 'shift-rules';

export interface WorkflowStep {
  tab: WorkflowTab;
  index: number;
  title: string;
  /** 状态徽章里的那行字，例如「11 条已配置」 */
  detail: string;
  state: StepState;
  /**
   * 该步是配置而非日常视图：点它打开弹窗而不是切标签。
   * 目前只有「配部门时段」是这样 —— 它配好后基本不动，不该和每天都要看的
   * 打卡记录/异常分析/月报抢同一个标签栏。
   */
  opensDialog?: boolean;
}

export interface WorkflowInput {
  shiftRuleCount: number;
  recordCount: number;
  anomalyCount: number;
  /** 上一次分析的时间（ISO，null = 从没分析过） */
  analyzedAt: string | null;
}

/**
 * ①配部门时段 → ②导打卡记录 → ③分析异常 → ④看月度报表
 *
 * 四步里只有 ① 是**配置**：时段配好后基本不动，而②③④每天都要看。所以①不放标签栏，
 * 由顶部工作流条点开一个弹窗；其余三步才是标签。
 *
 * 状态判定规则（"缺前置"= 会让人得到错误结论的那些情况）：
 *  - 时段为 0 时，打卡与分析都标 blocked：导进来也只是躺着，判定会整批「未判定」
 *  - 打卡为 0 时，分析与月报都标 blocked：给出"0 条异常"会被当成"大家都准时"
 */
export function deriveWorkflowSteps(input: WorkflowInput): WorkflowStep[] {
  const rulesReady = input.shiftRuleCount > 0;
  const recordsReady = input.recordCount > 0;

  return [
    {
      tab: 'shift-rules',
      index: 1,
      title: '配部门时段',
      detail: rulesReady ? `${input.shiftRuleCount} 条已配置` : '尚未配置',
      state: rulesReady ? 'done' : 'todo',
      /** 该步不在标签栏里，点它开配置弹窗而不是切标签 */
      opensDialog: true,
    },
    {
      tab: 'records',
      index: 2,
      title: '导打卡记录',
      detail: recordsReady ? `${input.recordCount} 条已导入` : '尚未导入',
      state: recordsReady ? 'done' : rulesReady ? 'ready' : 'blocked',
      opensDialog: false,
    },
    {
      tab: 'anomalies',
      index: 3,
      title: '分析异常',
      detail: input.analyzedAt ? `上次 ${formatAnalyzedAt(input.analyzedAt)}` : '尚未分析',
      state: input.analyzedAt ? 'done' : recordsReady && rulesReady ? 'ready' : 'blocked',
      opensDialog: false,
    },
    {
      tab: 'monthly',
      index: 4,
      title: '看月度报表',
      detail: recordsReady ? `${input.anomalyCount} 条异常待处理` : '需先有打卡数据',
      state: recordsReady ? 'ready' : 'blocked',
      opensDialog: false,
    },
  ];
}

export function formatAnalyzedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '已分析';
  return d.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 当前步骤被卡住时显示的一句话，渲染在面板顶部的琥珀色横幅上。 */
export const STEP_BLOCK_HINTS: Partial<Record<WorkflowTab, string>> = {
  records: '需要先配置部门时段，否则导入的记录无法对班判定。',
  anomalies: '需要先配置部门时段并导入打卡记录，才能进行异常判定。',
  monthly: '需要先导入打卡记录，月度报表才有数据来源。',
};