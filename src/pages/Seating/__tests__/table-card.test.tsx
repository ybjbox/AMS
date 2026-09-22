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
  const onRename = vi.fn();
  const { container } = render(
    <TableCard
      table={table}
      viewMode="grid"
      capacity={4}
      pickedUserId={picked}
      onPick={onPick}
      onMove={onMove}
      onRemove={onRemove}
      onRename={onRename}
    />
  );
  return { container, onPick, onMove, onRemove, onRename };
}

const renderCard = (number: number, members: User[], cap?: number) =>
  render(
    <TableCard
      table={{ number, members }}
      viewMode="grid"
      capacity={cap}
      pickedUserId={null}
      onPick={vi.fn()}
      onMove={vi.fn()}
      onRemove={vi.fn()}
      onRename={vi.fn()}
    />
  );

const dropTo = (el: Element, userId: string) =>
  fireEvent.drop(el as HTMLElement, { dataTransfer: { getData: () => userId, setData: () => undefined }, bubbles: true });

describe('TableCard 手动排座交互', () => {
  it('显示「当前人数 / 容量」，满桌时换成警示样式', () => {
    const { container } = renderCard(1, [u('EMP0001', '甲'), u('EMP0002', '乙')], 2);
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
});

describe('TableCard 拖拽落点提示', () => {
  it('悬停在某个成员上时，只有那个成员上方出现插入线', () => {
    const { container } = setup();
    const second = container.querySelector('[data-member-id="EMP0002"]') as HTMLElement;
    fireEvent.dragOver(second);
    expect(second.className).toContain('before:bg-brand-500');
    expect((container.querySelector('[data-member-id="EMP0001"]') as HTMLElement).className).not.toContain('before:bg-brand-500');
  });

  it('悬停在桌面空白处时，桌尾出现「松手落座」占位', () => {
    const { container } = setup();
    const card = container.querySelector('[data-table-number="3"]') as HTMLElement;
    fireEvent.dragOver(card);
    expect(container.querySelector('[data-drop-tail]')).toBeTruthy();
    expect(screen.getByText('松手落座桌尾')).toBeInTheDocument();
  });

  it('落点提示在 drop 之后清掉，不会留一条假线', () => {
    const { container } = setup();
    const card = container.querySelector('[data-table-number="3"]') as HTMLElement;
    fireEvent.dragOver(card);
    expect(container.querySelector('[data-drop-tail]')).toBeTruthy();
    dropTo(card, 'EMP0009');
    expect(container.querySelector('[data-drop-tail]')).toBeNull();
  });
});

describe('TableCard 改桌号', () => {
  it('点标题上的编辑入口 → 输入新号 → 回车提交', () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByRole('button', { name: '修改 3 号桌的桌号' }));
    const input = screen.getByRole('spinbutton', { name: '新桌号' });
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith(3, 7);
  });

  it('Esc 取消：不提交也不改', () => {
    const { onRename, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: '修改 3 号桌的桌号' }));
    const input = screen.getByRole('spinbutton', { name: '新桌号' });
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector('[data-table-number="3"]')).toBeTruthy();
  });

  it('号没变或不是数字时不提交', () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByRole('button', { name: '修改 3 号桌的桌号' }));
    const input = screen.getByRole('spinbutton', { name: '新桌号' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });
});

describe('TableCard 空桌', () => {
  it('空桌给出可放置提示，而不是渲染成一张无内容的卡片', () => {
    renderCard(9, [], 8);
    expect(screen.getByText(/空桌/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /1 号/ })).toHaveLength(0);
  });
});
