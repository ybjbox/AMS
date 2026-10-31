import React from 'react';
import { render, screen } from '@testing-library/react';
import { Bot } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import SettingsPanel from '../SettingsPanel';

describe('SettingsPanel 设置面板壳', () => {
  it('标题、说明与操作同屏，标题走 section-title', () => {
    render(
      <SettingsPanel
        title="AI 助手配置"
        description="配置接入的大模型与可用范围"
        icon={Bot}
        actions={<button type="button">保存</button>}
      >
        <p>正文</p>
      </SettingsPanel>
    );

    const title = screen.getByRole('heading', { level: 2, name: 'AI 助手配置' });
    expect(title.className).toContain('section-title');
    expect(screen.getByText('配置接入的大模型与可用范围')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy();
    expect(title.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('默认正文独立滚动，头部留在滚动区外', () => {
    const { container } = render(
      <SettingsPanel title="数据库备份">
        <p>正文</p>
      </SettingsPanel>
    );

    const section = container.querySelector('section');
    const header = section?.querySelector('header');
    const body = section?.querySelector(':scope > div');
    expect(header).toBeTruthy();
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.contains(screen.getByText('正文'))).toBe(true);
    expect(header?.contains(screen.getByText('正文'))).toBe(false);
  });

  it('表体模式不额外套滚动，交给 TableFrame 占满剩余高度', () => {
    const { container } = render(
      <SettingsPanel title="权限矩阵" scroll="none">
        <div>表格</div>
      </SettingsPanel>
    );

    const body = container.querySelector('section > div');
    const classes = body?.className.split(/\s+/) ?? [];
    expect(classes).toContain('flex-col');
    expect(classes).not.toContain('overflow-y-auto');
    expect(classes).toContain('max-md:overflow-y-auto');
  });

  it('没有标题时不渲染空头部（账号/日志自带头部）', () => {
    const { container } = render(
      <SettingsPanel scroll="none">
        <div>自带头部的内容</div>
      </SettingsPanel>
    );

    expect(container.querySelector('header')).toBeNull();
  });
});
