import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AiHistoryPanel from '@/pages/Settings/panels/AiHistoryPanel';

/**
 * 详情抽屉必须走 ui/sheet：此前是手搓 fixed inset-0，读屏听得到"对话框"却关不掉。
 * 这里用假 fetch 喂一条会话，验证打开后的 dialog 语义与 Esc 关闭。
 */
const CONV = { id: 'c1', username: 'admin', title: '年度排座咨询', updatedAt: '2026-09-22T10:00:00Z' };
const DETAIL = { ...CONV, messages: [{ role: 'user', content: '帮我排年会座位' }] };

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.setItem('app_auth_token', 'test-token');
  fetchSpy = vi.fn(async (url: string) => {
    if (String(url).endsWith('/conversations')) {
      return { ok: true, json: async () => [CONV] } as Response;
    }
    return { ok: true, json: async () => DETAIL } as Response;
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
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
});
