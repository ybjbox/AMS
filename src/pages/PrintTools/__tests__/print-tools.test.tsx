import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PrintTools from '../index';

/**
 * 打印工具容器：只测「标签条 ↔ 面板」这一层，三个工具页替身渲染。
 * 关注点是合并后仍然成立的那几件事：默认标签、深链选中标签、
 * 不存在的 tab 参数不能把用户留在空面板上，以及 aria 关系真的指向已渲染的面板。
 * 排座替身带内部状态，用来钉住「切走再切回不能重新挂载」——
 * 真实排座画布是内存态，重挂载一次就等于把用户排好的位置清空。
 */
vi.mock('@/pages/Seating', async () => {
  const { useState } = await import('react');
  const SeatingStub = () => {
    const [draft, setDraft] = useState('未动的排座画布');
    return (
      <div>
        排座面板
        <input aria-label="排座草稿" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </div>
    );
  };
  return { default: SeatingStub };
});
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

  it('aria-controls 只指向真实存在的面板，没访问过的标签不带该属性', () => {
    renderAt('/print-tools');
    fireEvent.click(screen.getByRole('tab', { name: /会议台卡/ }));
    expect(selectedIds()).toEqual(['print-tool-tab-name-cards']);

    const byId = (id: string) => document.getElementById(id);
    const withControls = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-controls'))
      .map((t) => [t.id, t.getAttribute('aria-controls')!] as const);
    // 已挂载的两个：各自指向自己的面板，且都还在 DOM 里（切走只是隐藏）
    expect(withControls).toEqual([
      ['print-tool-tab-seating', 'print-tool-panel-seating'],
      ['print-tool-tab-name-cards', 'print-tool-panel-name-cards'],
    ]);
    for (const [tabId, panelId] of withControls) {
      expect(byId(panelId)).not.toBeNull();
      expect(byId(panelId)!.getAttribute('aria-labelledby')).toBe(tabId);
    }
    const unvisited = screen.getByRole('tab', { name: /工作餐券/ });
    expect(unvisited.getAttribute('aria-controls')).toBeNull();
    expect(screen.queryByText('餐券面板')).toBeNull();
  });

  it('切走再切回不重新挂载：面板里的内存态原样留着', () => {
    renderAt('/print-tools');
    const draft = screen.getByLabelText('排座草稿');
    fireEvent.change(draft, { target: { value: '3 号桌：员工 11、员工 33' } });

    fireEvent.click(screen.getByRole('tab', { name: /会议台卡/ }));
    expect(document.getElementById('print-tool-panel-seating')!.hidden).toBe(true);
    expect(document.getElementById('print-tool-panel-name-cards')!.hidden).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: /宴会排座/ }));

    expect(screen.getByLabelText('排座草稿')).toHaveValue('3 号桌：员工 11、员工 33');
    expect(document.getElementById('print-tool-panel-seating')!.hidden).toBe(false);
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
