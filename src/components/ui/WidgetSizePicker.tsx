/**
 * 小组件尺寸切换（小 / 中 / 大）。
 *
 * 做成 radiogroup 而不是三个独立按钮：单选语义 + 方向键切换是键盘和屏幕阅读器能用的前提，
 * 而"收在 hover 菜单里"等于告诉用户这里没有尺寸可调。非选中项 `tabIndex=-1`，
 * 组内只有一个 tab 停靠点，符合 WAI-ARIA 的 radio 惯例。
 */
import React from "react";
import { WIDGET_SIZES, WIDGET_SIZE_ORDER, type WidgetSize } from "@/config/widgetSizes";

interface Props {
  value: WidgetSize;
  onChange: (next: WidgetSize) => void;
  /** 同一页面多个组件时用来区分分组，屏幕阅读器会念出来 */
  label?: string;
}

export default function WidgetSizePicker({ value, onChange, label = "图表尺寸" }: Props) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = WIDGET_SIZE_ORDER.indexOf(value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(WIDGET_SIZE_ORDER[(i + 1) % WIDGET_SIZE_ORDER.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(WIDGET_SIZE_ORDER[(i - 1 + WIDGET_SIZE_ORDER.length) % WIDGET_SIZE_ORDER.length]);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-700/60"
    >
      {WIDGET_SIZE_ORDER.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(s)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {WIDGET_SIZES[s].label}
          </button>
        );
      })}
    </div>
  );
}
