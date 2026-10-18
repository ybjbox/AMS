/**
 * 控制台小组件的三档尺寸（参照 iOS 小组件：换档位改变的不只是高度，还有信息密度与占位宽度）。
 *
 * 类名一律写成**完整字面量**：Tailwind 只按源码里出现过的字符串生成 CSS，
 * `md:col-span-${n}` 这种拼法不会进产物，症状是"点了切换但布局毫无反应"。
 */
export type WidgetSize = "small" | "medium" | "large";

export interface WidgetSizePreset {
  label: string;
  /** 图表容器高度 */
  chartClass: string;
  /** 该档在 5 列网格里占的列数 */
  spanClass: string;
}

export const WIDGET_SIZES: Record<WidgetSize, WidgetSizePreset> = {
  small: { label: "小", chartClass: "h-[160px]", spanClass: "md:col-span-2" },
  medium: { label: "中", chartClass: "h-[300px]", spanClass: "md:col-span-3" },
  large: { label: "大", chartClass: "h-[420px]", spanClass: "md:col-span-5" },
};

export const WIDGET_SIZE_ORDER: readonly WidgetSize[] = ["small", "medium", "large"];

/** 从 localStorage / 服务端读回来的值不可信，先过这道 */
export function isWidgetSize(v: unknown): v is WidgetSize {
  return typeof v === "string" && (WIDGET_SIZE_ORDER as readonly string[]).includes(v);
}

export interface ChartLayout {
  showAxis: boolean;
  showGrid: boolean;
  /** 小档只留首尾两个日期：160px 高配 7 个标签会糊成一片 */
  sparseTicks: boolean;
  showDots: boolean;
  showAverage: boolean;
  showSummary: boolean;
}

/**
 * 每档画什么，集中在这里判。
 * 做成纯函数是为了能被 vitest 直接断言（"小档不画 Y 轴"这种规则不该靠肉眼回归）。
 */
export function resolveChartLayout(size: WidgetSize): ChartLayout {
  return {
    showAxis: size !== "small",
    showGrid: size !== "small",
    sparseTicks: size === "small",
    showDots: size === "large",
    showAverage: size === "large",
    showSummary: size === "large",
  };
}

/**
 * 列表型卡片（部门人数分布 / 部门出勤率）的密度规则，一处定死、两张卡共用：
 * 小档前 3 名、中档前 5 名、大档全部并展开明细列。
 *
 * 截断必须配一句"另有 N 个未显示"——否则"只显示 3 个部门"会被读成"公司只有 3 个部门"。
 * 这和考勤判定里"对不上班的人日必须报出来"是同一条原则。
 */
export interface ListDensity {
  rows: number;
  /** 卡片头部右侧的口径 / 总数说明 */
  showMeta: boolean;
  /** 大档才展开的明细列（百分比、人日分子分母等） */
  showDetail: boolean;
}

export function resolveListDensity(size: WidgetSize): ListDensity {
  return {
    rows: size === "small" ? 3 : size === "medium" ? 5 : Number.POSITIVE_INFINITY,
    showMeta: size !== "small",
    showDetail: size === "large",
  };
}
