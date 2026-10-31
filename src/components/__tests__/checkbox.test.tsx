import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from '@/components/ui/checkbox';

function Controlled({ variant }: { variant?: 'default' | 'inline' }) {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      aria-label="测试勾选"
      variant={variant}
      checked={checked}
      onCheckedChange={(next) => setChecked(next === true)}
    />
  );
}

describe('ui/Checkbox', () => {
  it('默认 16px、品牌选中态与焦点环', () => {
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: '测试勾选' });
    const classes = box.className.split(/\s+/);

    expect(box.getAttribute('data-variant')).toBe('default');
    expect(classes).toContain('size-4');
    expect(classes).toContain('focus-visible:ring-3');
    expect(classes).toContain('data-checked:bg-primary');
    expect(classes).toContain('after:-inset-x-3');
  });

  it('inline 变体不改变尺寸，只收起外扩热区', () => {
    render(<Controlled variant="inline" />);
    const box = screen.getByRole('checkbox', { name: '测试勾选' });
    const classes = box.className.split(/\s+/);

    expect(box.getAttribute('data-variant')).toBe('inline');
    expect(classes).toContain('size-4');
    expect(classes).toContain('after:hidden');
  });

  it('点击切换选中，状态由原语维护', () => {
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: '测试勾选' });
    fireEvent.click(box);
    expect(box.getAttribute('data-checked')).not.toBeNull();
  });

  it('支持 indeterminate（导入预览全选）并显示减号', () => {
    render(<Checkbox aria-label="部分选中" indeterminate />);
    const box = screen.getByRole('checkbox', { name: '部分选中' });
    expect(box.getAttribute('data-indeterminate')).not.toBeNull();
    expect(box.querySelector('svg')?.getAttribute('class')).toContain('lucide-minus');
  });
});
