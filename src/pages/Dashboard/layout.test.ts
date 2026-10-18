import { describe, it, expect } from "vitest";
import { CARD_LABELS, DEFAULT_LAYOUT, normalizeLayout, type CardId, type LayoutEntry } from "./layout";
import { WIDGET_SIZES } from "@/config/widgetSizes";

const ids = (l: LayoutEntry[]) => l.map((e) => e.id);
const spanOf = (e: LayoutEntry) => Number(WIDGET_SIZES[e.size].spanClass.match(/col-span-(\d)/)?.[1] ?? 0);

describe("normalizeLayout —— 脏数据必须收敛成完整布局", () => {
  it("空值、非数组、数组里全是垃圾，都回落到完整默认布局", () => {
    for (const bad of [null, undefined, "x", 42, {}, [], [null, 1, "a"]]) {
      expect(ids(normalizeLayout(bad))).toEqual(ids(DEFAULT_LAYOUT));
    }
  });

  it("未知 id 丢弃、重复 id 只留第一个（第一个的档位生效）", () => {
    const r = normalizeLayout([
      { id: "chart", size: "large" },
      { id: "ghost-card", size: "small" },
      { id: "chart", size: "small" },
    ]);
    expect(r[0]).toEqual({ id: "chart", size: "large" });
    expect(r.filter((e) => e.id === "chart")).toHaveLength(1);
    expect(r).toHaveLength(DEFAULT_LAYOUT.length);
  });

  it("记录里缺的卡补回末尾 —— 少一张卡就是少一个功能入口，且界面看着「正常」", () => {
    const r = normalizeLayout([{ id: "notices", size: "large" }]);
    expect(r[0].id).toBe("notices");
    expect(new Set(ids(r))).toEqual(new Set(Object.keys(CARD_LABELS) as CardId[]));
    expect(r).toHaveLength(DEFAULT_LAYOUT.length);
  });

  it("非法档位回落到该卡默认值，合法档位保留", () => {
    const r = normalizeLayout([
      { id: "chart", size: "huge" },
      { id: "quick", size: "large" },
    ]);
    const chartDefault = DEFAULT_LAYOUT.find((e) => e.id === "chart")!.size;
    expect(r.find((e) => e.id === "chart")!.size).toBe(chartDefault);
    expect(r.find((e) => e.id === "quick")!.size).toBe("large");
  });
});

describe("默认布局的占位", () => {
  it("每张卡都落在 5 列网格内，且没有任何一行留有空位", () => {
    let row = 0;
    const rows: number[] = [];
    for (const e of DEFAULT_LAYOUT) {
      const span = spanOf(e);
      expect(span).toBeGreaterThan(0);
      expect(span).toBeLessThanOrEqual(5);
      if (row + span > 5) {
        rows.push(row);
        row = span;
      } else {
        row += span;
      }
    }
    rows.push(row);
    expect(rows.every((r) => r === 5)).toBe(true);
  });
});
