import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from '@/components/ui/FilterChip';

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/);
}

describe('ui/FilterChip', () => {
  it('默认是 rect/compact 的切换按钮，移动端至少 44px', () => {
    render(<FilterChip>全部</FilterChip>);
    const chip = screen.getByRole('button', { name: '全部' });
    const classes = classesOf(chip);

    expect(chip.getAttribute('type')).toBe('button');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(classes).toContain('rounded-md');
    expect(classes).toContain('h-7');
    expect(classes).toContain('text-xs');
    expect(classes).toContain('max-sm:min-h-11');
    expect(classes).toContain('border-transparent');
  });

  it('rect 与 pill 共用同一选中态', () => {
    const { rerender } = render(<FilterChip active>已过期</FilterChip>);
    const rect = screen.getByRole('button', { name: '已过期' });
    const selected = ['border-brand-500', 'bg-white', 'text-brand-800', 'shadow-sm'];
    for (const cls of selected) expect(classesOf(rect)).toContain(cls);

    rerender(
      <FilterChip active shape="pill">
        已过期
      </FilterChip>
    );
    const pill = screen.getByRole('button', { name: '已过期' });
    expect(classesOf(pill)).toContain('rounded-full');
    for (const cls of selected) expect(classesOf(pill)).toContain(cls);
  });

  it('计数不靠透明度弱化，未选中时保留语义色', () => {
    render(
      <FilterChip shape="pill" tone="danger" count={3} disabled>
        已逾期
      </FilterChip>
    );
    const chip = screen.getByRole('button', { name: /已逾期\s*3/ });
    expect(classesOf(chip)).toContain('text-red-700');
    expect(classesOf(chip)).toContain('disabled:opacity-50');

    const count = chip.querySelector('span');
    expect(count?.textContent).toBe('3');
    expect(classesOf(count!)).toContain('tabular-nums');
    expect(classesOf(count!)).toContain('font-semibold');
    expect(chip.className).not.toContain('opacity-70');
  });

  it('can change size and clicks; disabled blocks the click', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <FilterChip size="comfortable" onClick={onClick}>
        本月
      </FilterChip>
    );
    const chip = screen.getByRole('button', { name: '本月' });
    expect(classesOf(chip)).toContain('h-8');
    expect(classesOf(chip)).toContain('text-sm');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <FilterChip size="comfortable" disabled onClick={onClick}>
        本月
      </FilterChip>
    );
    fireEvent.click(screen.getByRole('button', { name: '本月' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
