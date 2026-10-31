import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tab, TabList, Tabs, type TabsOrientation, type TabsVariant } from '@/components/ui/Tabs';

function Harness({
  variant = 'page',
  orientation = 'horizontal',
  disabled,
}: {
  variant?: TabsVariant;
  orientation?: TabsOrientation;
  disabled?: string;
}) {
  const [value, setValue] = useState('one');
  return (
    <Tabs value={value} onValueChange={setValue} variant={variant}>
      <TabList aria-label="测试页签" orientation={orientation}>
        <Tab value="one">一</Tab>
        <Tab value="two" disabled={disabled === 'two'}>
          二
        </Tab>
        <Tab value="three" disabled={disabled === 'three'}>
          三
        </Tab>
      </TabList>
    </Tabs>
  );
}

describe('ui/Tabs', () => {
  it('输出 tablist/tab 语义与 roving tabindex', () => {
    render(
      <Tabs value="one" onValueChange={() => {}} variant="page">
        <TabList aria-label="测试页签">
          <Tab value="one" id="tab-one" aria-controls="panel-one">
            一
          </Tab>
          <Tab value="two">二</Tab>
        </TabList>
      </Tabs>
    );

    const list = screen.getByRole('tablist', { name: '测试页签' });
    const first = screen.getByRole('tab', { name: '一' });
    const second = screen.getByRole('tab', { name: '二' });

    expect(list.getAttribute('aria-orientation')).toBe('horizontal');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(first.id).toBe('tab-one');
    expect(first.getAttribute('aria-controls')).toBe('panel-one');
    expect(second.getAttribute('aria-selected')).toBe('false');
    expect(second.getAttribute('tabindex')).toBe('-1');
  });

  it('横向方向键、Home、End 会移动焦点并选中', () => {
    render(<Harness />);
    const first = screen.getByRole('tab', { name: '一' });

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '二' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '二' }));

    fireEvent.keyDown(screen.getByRole('tab', { name: '二' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: '三' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: '三' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: '一' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: '一' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: '三' }).getAttribute('aria-selected')).toBe('true');
  });

  it('纵向只用上下键，并输出 aria-orientation=vertical', () => {
    render(<Harness orientation="vertical" />);
    const first = screen.getByRole('tab', { name: '一' });
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical');

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(first.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: '二' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: '二' }), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: '一' }).getAttribute('aria-selected')).toBe('true');
  });

  it('跳过 disabled 页签', () => {
    render(<Harness disabled="two" />);
    fireEvent.keyDown(screen.getByRole('tab', { name: '一' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '三' }).getAttribute('aria-selected')).toBe('true');
  });

  it('点击切换选中，三种变体各有自己的选中态', () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: '二' }));
    expect(screen.getByRole('tab', { name: '二' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '二' }).className).toContain('bg-white');

    rerender(<Harness variant="segmented" />);
    expect(screen.getByRole('tab', { name: '二' }).className).toContain('text-brand-600');

    rerender(<Harness variant="filter" />);
    expect(screen.getByRole('tab', { name: '二' }).className).toContain('bg-brand-50');
  });

  it('TabList 可以渲染为 nav（设置页纵向导航）', () => {
    render(
      <Tabs value="one" onValueChange={() => {}} variant="page">
        <TabList as="nav" orientation="vertical" aria-label="设置导航">
          <Tab value="one">一</Tab>
        </TabList>
      </Tabs>
    );
    const list = screen.getByRole('tablist', { name: '设置导航' });
    expect(list.tagName).toBe('NAV');
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
  });
});
