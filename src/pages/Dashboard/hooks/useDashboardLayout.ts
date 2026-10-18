/**
 * 控制台布局（顺序 + 每卡尺寸）。
 *
 * 持久化直接复用 `useServerPrefs`（saved_items 一条记录、防抖写回、
 * "读失败绝不当成没有偏好"），这里只加两件事：
 * 1. **本地镜像**：把上一次的结果写进 localStorage，作为下次冷启动的初值 ——
 *    否则服务端往返期间会先闪一下默认布局。
 * 2. **normalizeLayout**：服务端/本地存的都是不可信输入，未知卡丢弃、非法档位回落、
 *    缺卡补回。合并成一条记录（而不是顺序一条、尺寸一条）是为了消除互相整份覆盖。
 */
import { useCallback } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { useServerPrefs } from "@/hooks/useServerPrefs";
import { STORAGE_KEYS } from "@/config/constants";
import type { WidgetSize } from "@/config/widgetSizes";
import { DEFAULT_LAYOUT, normalizeLayout, type CardId, type LayoutEntry } from "../layout";

interface LayoutPrefs {
  entries: LayoutEntry[];
}

function readLocal(): LayoutEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DASHBOARD_LAYOUT);
    return raw ? normalizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** 冷启动初值只算一次：useServerPrefs 每次渲染都会拿到这个引用 */
function initialLayout(): LayoutEntry[] {
  const cached = initialLayout.cached;
  if (cached) return cached;
  const v = readLocal();
  initialLayout.cached = v;
  return v;
}
initialLayout.cached = null as LayoutEntry[] | null;

function writeLocal(next: LayoutEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DASHBOARD_LAYOUT, JSON.stringify(next));
  } catch {
    /* 隐私模式写不进 localStorage，只影响"下次打开还记得"，不影响本次会话 */
  }
}

export function useDashboardLayout() {
  const { value, setValue } = useServerPrefs<LayoutPrefs>("dashboard-layout", { entries: initialLayout() });
  const layout = normalizeLayout(value.entries);

  const commit = useCallback(
    (next: LayoutEntry[]) => {
      writeLocal(next);
      setValue({ entries: next });
    },
    [setValue]
  );

  const setSize = useCallback(
    (id: CardId, size: WidgetSize) => {
      commit(layout.map((e) => (e.id === id ? { ...e, size } : e)));
    },
    [layout, commit]
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      commit(arrayMove(layout, from, to));
    },
    [layout, commit]
  );

  const reset = useCallback(() => commit(DEFAULT_LAYOUT.map((e) => ({ ...e }))), [commit]);

  return { layout, setSize, move, reset };
}
