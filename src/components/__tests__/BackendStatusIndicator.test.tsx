import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import BackendStatusIndicator from '@/components/BackendStatusIndicator';

// 让 react act 环境可用（不必引入 @testing-library）
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

function mockFetch(body: unknown, ok = true, delay = 10) {
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise((res) =>
        setTimeout(() => res({ ok, json: async () => body } as unknown as Response), delay)
      )
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(createElement(BackendStatusIndicator));
  });
  return {
    container,
    text: () => container.textContent ?? '',
    flush: () => act(async () => { await new Promise((r) => setTimeout(r, 30)); }),
    unmount: () => act(() => root.unmount()),
  };
}

describe('BackendStatusIndicator', () => {
  it('先显示“检测中…”，health 返回 ok 后变为“后端在线”', async () => {
    mockFetch({ status: 'ok' });
    const h = await mount();
    expect(h.text()).toContain('检测中');
    await h.flush();
    expect(h.text()).toContain('后端在线');
    h.unmount();
  });

  it('health 返回 JSON 但 status≠ok 时判定“后端异常”（黄灯：服务可达但健康检查未通过）', async () => {
    mockFetch({ status: 'down' });
    const h = await mount();
    await h.flush();
    expect(h.text()).toContain('后端异常');
    h.unmount();
  });

  it('HTTP 状态码非 2xx 时判定“后端异常”', async () => {
    mockFetch({}, false);
    const h = await mount();
    await h.flush();
    expect(h.text()).toContain('后端异常');
    h.unmount();
  });

  it('响应非 JSON（dev 纯前端兜底返回 HTML）时判定“后端离线”', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const h = await mount();
    await h.flush();
    expect(h.text()).toContain('后端离线');
    h.unmount();
  });

  it('fetch 抛错（网络断开）时判定“后端离线”', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const h = await mount();
    await h.flush();
    expect(h.text()).toContain('后端离线');
    h.unmount();
  });

  it('navigator.onLine 为 false 时立即判定“后端离线”且不发请求', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const h = await mount();
    await h.flush();
    expect(h.text()).toContain('后端离线');
    expect(fetchMock).not.toHaveBeenCalled();
    h.unmount();
  });
});
