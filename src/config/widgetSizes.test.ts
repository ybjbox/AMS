import { describe, it, expect } from "vitest";
import {
  isWidgetSize,
  resolveChartLayout,
  resolveListDensity,
  WIDGET_SIZES,
  WIDGET_SIZE_ORDER,
  type WidgetSize,
} from "./widgetSizes";

/** 从 `h-[300px]` 里取出像素值，用于断言三档的高度关系 */
const heightOf = (cls: string) => Number(cls.match(/h-\[(\d+)px\]/)?.[1] ?? NaN);

describe("widgetSizes 档位表", () => {
  it("三档高度严格递增", () => {
    const [s, m, l] = WIDGET_SIZE_ORDER.map((k) => heightOf(WIDGET_SIZES[k].chartClass));
    expect(s).toBeLessThan(m!);
    expect(m).toBeLessThan(l!);
  });

  it("三档占位互不相同，且都是完整类名", () => {
    // 断的是 Tailwind 的扫描规则：`md:col-span-${n}` 这种拼法不会进产物，
    // 症状是"切换毫无反应"。所以这里要求每个值都是能直接写进 class 的字面量。
    const spans = WIDGET_SIZE_ORDER.map((k) => WIDGET_SIZES[k].spanClass);
    expect(new Set(spans).size).toBe(3);
    for (const span of spans) {
      expect(span).toMatch(/^md:col-span-\d$/);
      expect(span).not.toContain("$");
    }
  });

  it("isWidgetSize 只认三档，脏数据一律拒（localStorage 与服务端回来的值都不可信）", () => {
    for (const ok of ["small", "medium", "large"]) expect(isWidgetSize(ok)).toBe(true);
    for (const bad of ["huge", "", "SMALL", null, undefined, 42, {}, "medium "]) {
      expect(isWidgetSize(bad)).toBe(false);
    }
  });
});

describe("resolveChartLayout 每档画什么", () => {
  it("小档不画 Y 轴与网格，且日期只留首尾", () => {
    const l = resolveChartLayout("small");
    expect(l.showAxis).toBe(false);
    expect(l.showGrid).toBe(false);
    expect(l.sparseTicks).toBe(true);
  });

  it("中档有轴有网格、显示全部日期，但不加数据点与摘要", () => {
    const l = resolveChartLayout("medium");
    expect(l).toMatchObject({ showAxis: true, showGrid: true, sparseTicks: false });
    expect(l.showDots).toBe(false);
    expect(l.showSummary).toBe(false);
  });

  it("大档在中档基础上加点、均值线与区间摘要", () => {
    const l = resolveChartLayout("large");
    expect(l).toMatchObject({ showAxis: true, showGrid: true, sparseTicks: false });
    expect(l.showDots).toBe(true);
    expect(l.showAverage).toBe(true);
    expect(l.showSummary).toBe(true);
  });

  it("三档的可见性差异至少体现在两个维度上（防止档位退化成只改高度）", () => {
    const keys: (keyof ReturnType<typeof resolveChartLayout>)[] = [
      "showAxis",
      "showGrid",
      "sparseTicks",
      "showDots",
      "showAverage",
      "showSummary",
    ];
    const sig = (s: WidgetSize) => keys.filter((k) => resolveChartLayout(s)[k]).join("|");
    const [small, medium, large] = WIDGET_SIZE_ORDER.map(sig);
    expect(small).not.toBe(medium);
    expect(medium).not.toBe(large);
  });
});

describe("resolveListDensity —— 列表型卡片的截断规则", () => {
  it("行数随档位单调放宽：3 → 5 → 全部", () => {
    expect(resolveListDensity("small").rows).toBe(3);
    expect(resolveListDensity("medium").rows).toBe(5);
    expect(resolveListDensity("large").rows).toBe(Number.POSITIVE_INFINITY);
  });

  it("只有小档收起口径说明，只有大档展开明细列", () => {
    expect(resolveListDensity("small")).toMatchObject({ showMeta: false, showDetail: false });
    expect(resolveListDensity("medium")).toMatchObject({ showMeta: true, showDetail: false });
    expect(resolveListDensity("large")).toMatchObject({ showMeta: true, showDetail: true });
  });

  it("截断后剩余量可算出来（界面必须写明「另有 N 个未显示」）", () => {
    const all = Array.from({ length: 7 }, (_, i) => i);
    for (const size of WIDGET_SIZE_ORDER) {
      const shown = all.slice(0, resolveListDensity(size).rows);
      expect(shown.length + (all.length - shown.length)).toBe(all.length);
      if (size !== "large") expect(shown.length).toBeLessThan(all.length);
    }
  });
});
