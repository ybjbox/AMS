import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SeatingToolbar } from '../components/SeatingToolbar';

/**
 * 台卡打印入口：设置与打印合成一个入口（弹窗里就是"设置 + 预览 + 打印"）。
 * 这里钉的是"只有一个入口、且它开的是弹窗"——原来那个跳过预览直接出纸的按钮不该回来。
 */
function renderToolbar(over: { hasTables?: boolean } = {}) {
  const setIsPrintModalOpen = vi.fn();
  render(
    <SeatingToolbar
      viewMode="grid"
      setViewMode={vi.fn()}
      hasTables={over.hasTables ?? true}
      handleClear={vi.fn()}
      setIsParticipantModalOpen={vi.fn()}
      selectedCount={3}
      setIsPrintModalOpen={setIsPrintModalOpen}
      setIsPlansModalOpen={vi.fn()}
      unsaved={false}
    />
  );
  return { setIsPrintModalOpen };
}

describe('排座工具栏的台卡入口', () => {
  it('只有一个「打印台卡」按钮，不再有「台卡设置」', () => {
    renderToolbar();
    expect(screen.getAllByRole('button', { name: /打印台卡/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /台卡设置/ })).toBeNull();
  });

  it('点它是打开弹窗（而不是直接出纸）', () => {
    const { setIsPrintModalOpen } = renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /打印台卡/ }));
    expect(setIsPrintModalOpen).toHaveBeenCalledWith(true);
  });

  it('还没有桌位时禁用，避免打出空白台卡', () => {
    renderToolbar({ hasTables: false });
    expect(screen.getByRole('button', { name: /打印台卡/ })).toBeDisabled();
  });
});
