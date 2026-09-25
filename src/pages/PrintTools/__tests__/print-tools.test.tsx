import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PrintTools from '../index';

/**
 * 打印工具容器：只测「标签条 ↔ 面板」这一层，三个工具页替身渲染。
 * 关注点是合并后仍然成立的那几件事：默认标签、深链选中标签、
 * 不存在的 tab 参数不能把用户留在空面板上，以及 aria 关系真的指向已渲染的面板。
 */
vi.mock('@/pages/Seating', () => ({ default: () => <div>排座面板</div> }));
vi.mock('@/pages/NameCards', () => ({ default: () => <div>台卡面板</div> }));
vi.mock('@/pages/MealVouchers', () => ({ default: () => <div>餐券面板</div> }));

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PrintTools />
    </MemoryRouter>
  );
}

const selectedIds = () =>
  screen
    .getAllByRole('tab')
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.id);

describe('打印工具标签切换', () => {
  it('默认打开宴会排座，面板与标签一一对应', () => {
    renderAt('/print-tools');
    expect(selectedIds()).toEqual(['print-tool-tab-seating']);
    expect(screen.getByText('排座面板')).toBeInTheDocument();
    expect(screen.queryByText('台卡面板')).toBeNull();
  });

  it('?tab= 决定初始标签（三个工具各自的深链都可用）', () => {
    renderAt('/print-tools?tab=meal-vouchers');
    expect(selectedIds()).toEqual(['print-tool-tab-meal-vouchers']);
    expect(screen.getByText('餐券面板')).toBeInTheDocument();
  });

  it('未知或未授权的 tab 参数回退到首个标签，不停在空面板', () => {
    renderAt('/print-tools?tab=../../admin');
    expect(selectedIds()).toEqual(['print-tool-tab-seating']);
    expect(screen.getByRole('tabpanel').id).toBe('print-tool-panel-seating');
  });

  it('点击标签切面板，aria-controls 只指向真实存在的面板', () => {
    renderAt('/print-tools');
    fireEvent.click(screen.getByRole('tab', { name: /会议台卡/ }));
    expect(selectedIds()).toEqual(['print-tool-tab-name-cards']);
    expect(screen.getByText('台卡面板')).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel');
    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      if (controls) {
        expect(document.getElementById(controls)).toBe(panels[0]);
        expect(tab.getAttribute('aria-selected')).toBe('true');
      } else {
        expect(tab.getAttribute('aria-selected')).toBe('false');
      }
    }
  });

  it('标签条有可读的分组名，且三个工具都在', () => {
    renderAt('/print-tools');
    expect(screen.getByRole('tablist', { name: '打印工具' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      '宴会排座',
      '会议台卡',
      '工作餐券',
    ]);
  });
});
