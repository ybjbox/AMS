import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableFrame, StickyCell, StickyHeaderCell } from '@/components/ui/Table';

describe('ui/Table 宽表原语', () => {
  it('默认铺满容器，不额外设下限', () => {
    render(
      <Table aria-label="测试表">
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </Table>
    );
    const table = screen.getByRole('table', { name: '测试表' });
    expect(table.className).toContain('w-full');
    expect(table.className).not.toContain('min-w-200');
  });

  it('宽表可显式给下限与表头不换行，且不写死像素宽度', () => {
    render(
      <Table aria-label="测试表" minWidth="min-w-180" nowrapHeaders>
        <tbody />
      </Table>
    );
    const table = screen.getByRole('table', { name: '测试表' });
    expect(table.className).toContain('min-w-180');
    expect(table.className).toContain('[&_th]:whitespace-nowrap');
    expect(table.getAttribute('style')).toBeNull();
  });

  it('首末列冻结的定位、层级与阴影只由原语提供', () => {
    render(
      <table>
        <thead>
          <tr>
            <StickyHeaderCell side="left">左表头</StickyHeaderCell>
            <StickyHeaderCell side="right">右表头</StickyHeaderCell>
          </tr>
        </thead>
        <tbody>
          <tr>
            <StickyCell side="left">左单元格</StickyCell>
            <StickyCell side="right">右单元格</StickyCell>
          </tr>
        </tbody>
      </table>
    );

    const [leftHead, rightHead] = screen.getAllByRole('columnheader');
    expect(leftHead.className).toContain('sticky');
    expect(leftHead.className).toContain('left-0');
    expect(leftHead.className).toContain('z-30');
    expect(leftHead.className).toContain('shadow-sticky-left');
    expect(rightHead.className).toContain('right-0');
    expect(rightHead.className).toContain('shadow-sticky-right');

    const [leftCell, rightCell] = screen.getAllByRole('cell');
    expect(leftCell.className).toContain('z-10');
    expect(leftCell.className).toContain('left-0');
    expect(rightCell.className).toContain('right-0');
  });

  it('TableFrame 是独立的横向滚动层', () => {
    render(
      <TableFrame data-testid="frame">
        <div />
      </TableFrame>
    );
    expect(screen.getByTestId('frame').className).toContain('overflow-auto');
    expect(screen.getByTestId('frame').className).toContain('w-full');
  });
});
