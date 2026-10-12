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
  analyzedAt: string | null;
  /** 最新打卡日距今几天（null = 库里一条打卡都没有） */
  freshness: PunchFreshness | null;
  /**
   * 最近一个考勤月里还有多少条异常。
   * 这里刻意不用全历史异常数：导完 3 个月它就是 70、6 个月就是 140，
   * 而人要处理的永远只有当前这个月 —— 累计数不指向任何动作。
   */
  recentAnomalies: { month: string; count: number } | null;
}

/** 打卡数据新鲜度 */
export interface PunchFreshness {
  latestDate: string;
  daysAgo: number;
}

/** 超过这个天数没有新打卡，第②步就不该再顶着绿色的「已完成」 */
export const STALE_PUNCH_DAYS = 7;

/**
 * 从一堆打卡日期里算「最新一天距今几天」。
 *
 * 日期串是零填充定宽的 YYYY-MM-DD，字符串比较即日期比较；
 * 距今按**本地日**算（与 `daysSinceLast` 同一口径），否则凌晨那班会差一天。
 */
export function punchFreshness(dates: Iterable<string>, today: Date): PunchFreshness | null {
  let latest = '';
  for (const d of dates) if (d > latest) latest = d;
  if (!latest) return null;
  const then = new Date(`${latest}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { latestDate: latest, daysAgo: Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000)) };
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
 *  - 打卡超过 `STALE_PUNCH_DAYS` 天没更新时，第②步回到「待处理」：
 *    原先只要库里有过打卡就永远绿色"已完成"，而"这个月还没导"恰恰是唯一的常态故障
 */
export function deriveWorkflowSteps(input: WorkflowInput): WorkflowStep[] {
  const rulesReady = input.shiftRuleCount > 0;
  const recordsReady = input.recordCount > 0;
  const stale = input.freshness !== null && input.freshness.daysAgo > STALE_PUNCH_DAYS;

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
      detail: input.freshness ? `最新 ${input.freshness.latestDate} · ${input.freshness.daysAgo} 天前` : '尚未导入',
      state: !recordsReady ? (rulesReady ? 'ready' : 'blocked') : stale ? 'todo' : 'done',
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
      detail: input.recentAnomalies
        ? `${input.recentAnomalies.count} 条异常待处理 · ${input.recentAnomalies.month}`
        : '需先有打卡数据',
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