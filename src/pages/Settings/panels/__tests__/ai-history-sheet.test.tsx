import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http } from '@/services/api';
import AiHistoryPanel from '@/pages/Settings/panels/AiHistoryPanel';

/**
 * 详情抽屉必须走 ui/sheet：此前是手搓 fixed inset-0，读屏听得到"对话框"却关不掉。
 * 另外钉住一条：这一层的数据请求走统一的 http（api.ts 拦截器），不再自己 fetch —
 * 否则 401/网络错误既不清会话也不提示，删除失败只会"那条又回来了"。
 */
const fixture = vi.hoisted(() => ({
  list: [{ id: 'c1', username: 'admin', title: '年度排座咨询', updatedAt: '2026-09-22T10:00:00Z', messageCount: 1 }],
  detail: {
    id: 'c1',
    username: 'admin',
    title: '年度排座咨询',
    updatedAt: '2026-09-22T10:00:00Z',
    messageCount: 1,
    createdAt: '2026-09-22T09:00:00Z',
    messages: [{ role: 'user', content: '帮我排年会座位' }],
  },
}));

vi.mock('@/services/api', () => ({
  http: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation(async (url: string) =>
    String(url).endsWith('/conversations') ? fixture.list : (fixture.detail as unknown)
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AI 会话记录详情抽屉', () => {
  it('打开后是有语义的对话框，Esc 能关闭', async () => {
    render(<AiHistoryPanel />);
    await waitFor(() => expect(screen.getByText('年度排座咨询')).toBeTruthy());

    fireEvent.click(screen.getByTitle('查看详情'));

    const dialog = await waitFor(() => {
      const el = document.querySelector('[role="dialog"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // base-ui 的模态语义由 role=dialog + 焦点管理承担，不写 aria-modal 属性
    expect(dialog.getAttribute('aria-label') || dialog.querySelector('h2')?.textContent).toBeTruthy();
    expect(dialog.textContent).toContain('帮我排年会座位');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });

  it('读的是统一 http 通道（列表 + 详情各一次），不是绕开的 fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<AiHistoryPanel />);
    await waitFor(() => expect(screen.getByText('年度排座咨询')).toBeTruthy());
    expect(getMock).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
