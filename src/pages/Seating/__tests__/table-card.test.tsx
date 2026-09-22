import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { User } from '@/types';
import { TableCard } from '../components/TableCard';
import type { Table } from '../hooks/useSeatingArrange';

const u = (id: string, name: string): User => ({ id, name, department: '技术部', role: '工程师' }) as User;

const table: Table = { number: 3, members: [u('EMP0001', '甲'), u('EMP0002', '乙')] };

function setup(picked: string | null = null) {
  const onPick = vi.fn();
  const onMove = vi.fn();
  const onRemove = vi.fn();
  const { container } = render(
    <TableCard
      table={table}
      viewMode="grid"
      capacity={4}
      pickedUserId={picked}
      onPick={onPick}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
  return { container, onPick, onMove, onRemove };
}

const dropTo = (el: Element, userId: string) =>
  fireEvent.drop(el as HTMLElement, { dataTransfer: { getData: () => userId, setData: () => undefined }, bubbles: true });

describe('TableCard 手动排座交互', () => {
  it('显示「当前人数 / 容量」，满桌时换成警示样式', () => {
    const { container } = render(
      <TableCard
        table={{ number: 1, members: [u('EMP0001', '甲'), u('EMP0002', '乙')] }}
        viewMode="grid"
        capacity={2}
        pickedUserId={null}
        onPick={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText('2 / 2 人')).toBeInTheDocument();
    expect(container.querySelector('.border-amber-200')).toBeTruthy();
  });

  it('点成员卡 = 选中该人等待移入（键盘 Enter 等价）', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: /1 号 甲/ }));
    expect(onPick).toHaveBeenCalledWith('EMP0001');
    onPick.mockClear();
    fireEvent.keyDown(screen.getByRole('button', { name: /2 号 乙/ }), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('EMP0002');
  });

  it('已有人被选中时给出「移入此桌」入口，并把选中人带进 move 语义', () => {
    const { onMove } = setup('EMP0009');
    fireEvent.click(screen.getByRole('button', { name: /移入 3 号桌/ }));
    expect(onMove).toHaveBeenCalledWith({ userId: 'EMP0009', toTable: 3 });
  });

  it('成员自己的移出按钮只针对本人（不冒泡成选中）', () => {
    const { onMove, onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: /把 甲 移出座位/ }));
    expect(onMove).toHaveBeenCalledWith({ userId: 'EMP0001', toTable: null });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('拖到某个成员上＝插到该成员之前；拖到桌面＝追加到桌尾', () => {
    const { container, onMove } = setup();
    dropTo(container.querySelector('[data-member-id="EMP0002"]') as Element, 'EMP0009');
    expect(onMove).toHaveBeenLastCalledWith({ userId: 'EMP0009', toTable: 3, beforeMemberId: 'EMP0002' });

    dropTo(container.querySelector('[data-table-number="3"]') as Element, 'EMP0009');
    expect(onMove).toHaveBeenLastCalledWith({ userId: 'EMP0009', toTable: 3, beforeMemberId: null });
  });

  it('空桌给出可放置提示，而不是渲染成一张无内容的卡片', () => {
    render(
      <TableCard
        table={{ number: 9, members: [] }}
        viewMode="list"
        capacity={8}
        pickedUserId={null}
        onPick={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText(/空桌/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /1 号/ })).toHaveLength(0);
  });
});
