import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clampZoom,
  iframeZoomStyle,
  usePreviewZoom,
  zoomStyle,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/hooks/usePreviewZoom';
import { PreviewZoomControl } from '@/components/PreviewZoomControl';

/**
 * 预览缩放的公共口径：所有按纸面排版的预览共用这一档比例与这个控件。
 * 关键是"只改渲染、不改版面"——所以这里钉的是比例边界与持久化，不是任何毫米值。
 */
describe('clampZoom', () => {
  beforeEach(() => localStorage.clear());

  it('夹在 50–200 之间并按 10 取整', () => {
    expect(clampZoom(10)).toBe(ZOOM_MIN);
    expect(clampZoom(999)).toBe(ZOOM_MAX);
    expect(clampZoom(97)).toBe(100);
    expect(clampZoom(NaN)).toBe(100);
  });

  it('比例按面各存一份，互不覆盖', () => {
    const a = renderHook(() => usePreviewZoom('a'));
    const b = renderHook(() => usePreviewZoom('b'));
    act(() => a.result.current.change(150));
    expect(b.result.current.zoom).toBe(100);
    expect(localStorage.getItem('ams_preview_zoom_a')).toBe('150');
    expect(localStorage.getItem('ams_preview_zoom_b')).toBeNull();
  });

  it('读回上次比例；脏值回到 100', () => {
    localStorage.setItem('ams_preview_zoom_c', '170');
    expect(renderHook(() => usePreviewZoom('c')).result.current.zoom).toBe(170);
    localStorage.setItem('ams_preview_zoom_c', 'abc');
    expect(renderHook(() => usePreviewZoom('c')).result.current.zoom).toBe(100);
  });
});

describe('PreviewZoomControl', () => {
  it('加减各走一档；重置只在不是 100% 时可用', () => {
    const onChange = vi.fn();
    render(<PreviewZoomControl zoom={100} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '放大预览' }));
    expect(onChange).toHaveBeenLastCalledWith(110);
    fireEvent.click(screen.getByRole('button', { name: '缩小预览' }));
    expect(onChange).toHaveBeenLastCalledWith(90);
    // 已经是 100% 时没有东西可重置
    expect(screen.getByRole('button', { name: '恢复 100%' })).toBeDisabled();

    render(<PreviewZoomControl zoom={120} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: '恢复 100%' }).pop()!);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('到边界禁用对应按钮（100% 时重置也禁用）', () => {
    const { unmount } = render(<PreviewZoomControl zoom={ZOOM_MIN} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '缩小预览' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '放大预览' })).toBeEnabled();
    unmount();
    render(<PreviewZoomControl zoom={ZOOM_MAX} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '放大预览' })).toBeDisabled();
  });
});

describe('缩放样式', () => {
  it('React 内容用 zoom；iframe 还要把宽高按 1/zoom 补回来铺满容器', () => {
    expect(zoomStyle(80)).toEqual({ zoom: 0.8 });
    expect(iframeZoomStyle(80)).toEqual({ zoom: 0.8, width: '125%', height: '125%' });
  });
});
