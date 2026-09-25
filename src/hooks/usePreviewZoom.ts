import type { CSSProperties } from "react";
import { useCallback, useState } from 'react';

/**
 * 「预览缩放」的公共口径：所有按纸面排版的预览（餐券 / 会议台卡 / 座次卡 / 通讯录 / 导出…）
 * 共用同一档 50%–200%、步进 10% 的比例。
 *
 * 比例按面分别记在本机 localStorage（视图偏好，不进任何业务参数），
 * 存不下来只影响"下次打开是否还记得"，不影响本次预览。
 */
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;
export const ZOOM_DEFAULT = 100;

const KEY_PREFIX = 'ams_preview_zoom_';

export function clampZoom(pct: number): number {
  if (!Number.isFinite(pct)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pct / ZOOM_STEP) * ZOOM_STEP));
}

export function usePreviewZoom(id: string) {
  const [zoom, setZoom] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(KEY_PREFIX + id));
      return raw >= ZOOM_MIN && raw <= ZOOM_MAX ? clampZoom(raw) : ZOOM_DEFAULT;
    } catch {
      return ZOOM_DEFAULT;
    }
  });

  const change = useCallback(
    (next: number) => {
      const value = clampZoom(next);
      setZoom(value);
      try {
        localStorage.setItem(KEY_PREFIX + id, String(value));
      } catch {
        /* 隐私模式 / 配额满：仍然缩放，只是下次打开回到默认 */
      }
    },
    [id]
  );

  return {
    zoom,
    change,
    reset: () => change(ZOOM_DEFAULT),
    atMin: zoom <= ZOOM_MIN,
    atMax: zoom >= ZOOM_MAX,
  };
}

/** 给 React 渲染的预览内容（台卡 / 座次卡 / 表格…）用的缩放样式 */
export function zoomStyle(zoom: number): CSSProperties {
  return { zoom: zoom / 100 };
}

/**
 * 给 iframe 预览用的缩放样式：iframe 的内部视口 = 元素指定尺寸（不含 zoom），
 * 所以把宽高按 1/zoom 放大，缩放后正好铺满外层容器，不出现空白边。
 */
export function iframeZoomStyle(zoom: number): CSSProperties {
  const scale = zoom / 100;
  return { zoom: scale, width: `${100 / scale}%`, height: `${100 / scale}%` };
}
