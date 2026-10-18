/**
 * 控制台卡片的布局模型：顺序 + 每张卡的尺寸档位，合成**一条**记录持久化。
 *
 * 为什么不拆成"一条存顺序、一条存尺寸"：两条记录都是整份覆盖，
 * 改尺寸会把顺序按旧值整份写回去（反之同理），互相抹掉。合并成一条就没有竞态。
 */
import { isWidgetSize, type WidgetSize } from "@/config/widgetSizes";

export type CardId =
  | "chart"
  | "quick"
  | "notices"
  | "workforce"
  | "deptDist"
  | "heatmap"
  | "deptAttendance";

export interface LayoutEntry {
  id: CardId;
  size: WidgetSize;
}

export const CARD_LABELS: Record<CardId, string> = {
  chart: "数据趋势",
  quick: "快捷操作",
  notices: "系统公告",
  workforce: "人员流动",
  deptDist: "部门人数分布",
  heatmap: "考勤热力",
  deptAttendance: "部门出勤率",
};

/**
 * 默认顺序与档位。medium=3/5、small=2/5、large=5/5，
 * 排下来正好是 5/5/5/5 —— 不留改造前那种"左列一张卡、下面整块空"的洞。
 */
export const DEFAULT_LAYOUT: LayoutEntry[] = [
  { id: "chart", size: "medium" },
  { id: "quick", size: "small" },
  { id: "workforce", size: "medium" },
  { id: "deptDist", size: "small" },
  { id: "heatmap", size: "medium" },
  { id: "notices", size: "small" },
  { id: "deptAttendance", size: "large" },
];

const DEFAULT_SIZE: Record<CardId, WidgetSize> = DEFAULT_LAYOUT.reduce(
  (acc, e) => ({ ...acc, [e.id]: e.size }),
  {} as Record<CardId, WidgetSize>
);

/**
 * 把任何来源（localStorage / 服务端 / 旧版本残留）的脏数据收敛成合法布局：
 * 未知 id 与重复项丢弃、档位非法回落到该卡默认值、**缺失的卡补回末尾**。
 * 补回这一步是关键：将来新增一张卡、或用户那份记录被截断时，
 * 症状必须是"卡片回到默认位"，而不是某个功能入口从界面上永久消失。
 */
export function normalizeLayout(raw: unknown): LayoutEntry[] {
  const out: LayoutEntry[] = [];
  const seen = new Set<CardId>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || !(id in CARD_LABELS)) continue;
      const cardId = id as CardId;
      if (seen.has(cardId)) continue;
      const size = (item as { size?: unknown } | null)?.size;
      out.push({ id: cardId, size: isWidgetSize(size) ? size : DEFAULT_SIZE[cardId] });
      seen.add(cardId);
    }
  }

  for (const d of DEFAULT_LAYOUT) {
    if (!seen.has(d.id)) out.push({ ...d });
  }
  return out;
}
