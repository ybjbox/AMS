import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TableConfig } from '@/pages/Seating/components/TableConfig';
import type { Table, TableCapacity } from '@/pages/Seating/hooks/useSeatingArrange';
import type { User } from '@/types';

/**
 * 钉住「座位」按画布算，不按容量配置行求和。
 *
 * 配置行是计划：删桌（`removeTable`）与「清空」都只动画布，配置行不会自己缩。
 * 原先这里直接 `tableCapacities.reduce(...)`，于是删过桌之后屏幕上的座位数仍然虚高 ——
 * 按这个数去订餐、订桌花，现场座位其实更少。
 */
const cap = (n: number, capacity: number): TableCapacity => ({ id: `c${n}`, tableNumber: n, capacity });
const table = (n: number, members: number): Table => ({
  number: n,
  members: Array.from({ length: members }, (_, i) => ({ id: `u${n}-${i}`, name: `宾${n}-${i}` }) as User),
});
const capacities = (list: TableCapacity[]) => Object.fromEntries(list.map((c) => [c.tableNumber, c.capacity]));

function renderWith(tables: Table[], capacitiesList: TableCapacity[], selectedCount: number) {
  return render(
    <TableConfig
      tableCapacities={capacitiesList}
      tables={tables}
      capacities={capacities(capacitiesList)}
      addTableCapacity={vi.fn()}
      updateTableCapacity={vi.fn()}
      removeTableCapacity={vi.fn()}
      skippedNumbers=""
      setSkippedNumbers={vi.fn()}
      selectedCount={selectedCount}
    />
  );
}

/** 标签与数字是同一个 .text-center 块里的两个 div */
const stat = (label: string) => {
  const block = screen.getByText(label).parentElement;
  return block?.lastElementChild?.textContent ?? '';
};

describe('排座的座位数与已入座数', () => {
  it('删过桌之后只算画布上还在的桌：5 桌计划、画布 3 桌 → 30 席，不是 50', () => {
    const plan = [1, 2, 3, 4, 5].map((n) => cap(n, 10));
    renderWith([table(1, 10), table(2, 10), table(3, 10)], plan, 30);

    expect(stat('座位')).toBe('30');
    expect(stat('已入座')).toBe('30');
    expect(screen.queryByText('50')).not.toBeInTheDocument();
  });

  it('清空画布后座位归零（配置行还挂着，但那是计划不是现场）', () => {
    renderWith([], [cap(1, 10), cap(2, 10)], 0);
    expect(stat('座位')).toBe('0');
    expect(stat('已入座')).toBe('0');
  });

  it('坐进去的人多于容量行时，按人多算 —— 座位数不能小于已坐的人', () => {
    renderWith([table(1, 12)], [cap(1, 10)], 12);
    expect(stat('座位')).toBe('12');
    expect(stat('已入座')).toBe('12');
  });

  it('还有人没入座时，已入座用琥珀色标出来（与未入座条同一件事的两个说法）', () => {
    renderWith([table(1, 3)], [cap(1, 10)], 8);
    expect(stat('已入座')).toBe('3');
    expect(screen.getByText('3').className).toContain('amber');
  });
});
