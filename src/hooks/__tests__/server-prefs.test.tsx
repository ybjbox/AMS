import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/**
 * 打印参数持久化（批次 2）：读失败绝不能被当成「用户没有偏好」。
 * 三个打印面共用这一条链，一旦把默认值当现值写回去，机构名/纸张/编号位数会被整条覆盖，
 * 而且只在覆盖成功后提示「已保存」——用户没有任何机会知道发生了什么。
 *
 * 只 mock 最底下的 http，让真实的 savedItemApi / loadSingle 语义一起参与测试。
 */
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/api', () => ({ http }));

import { PREFS_NAME } from '@/services/savedItemApi';
import { useServerPrefs } from '@/hooks/useServerPrefs';

const DEFAULTS = { org: '默认单位', paper: 'A4' };
const settle = () => new Promise((r) => setTimeout(r, 900));

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  http.post.mockResolvedValue({ id: 'x' });
});

describe('useServerPrefs', () => {
  it('服务端存着参数时按服务端值显示', async () => {
    http.get.mockResolvedValue([{ name: PREFS_NAME, payload: { org: '第一餐厅' } }]);
    const { result } = renderHook(() => useServerPrefs('seating-prefs', DEFAULTS));
    await waitFor(() => expect(result.current.value.org).toBe('第一餐厅'));
    expect(result.current.degraded).toBe(false);
  });

  it('读失败：降级、不回写，值停在默认值上也不会污染服务端', async () => {
    http.get.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useServerPrefs('seating-prefs', DEFAULTS));
    await waitFor(() => expect(result.current.degraded).toBe(true));

    act(() => result.current.setValue({ org: '我改了一下' }));
    await settle();
    expect(http.post).not.toHaveBeenCalled();
    // 画面仍然可编辑（不是把人锁住），只是不再落库
    expect(result.current.value.org).toBe('我改了一下');
  });

  it('首次使用（请求成功但没有这一条）照常落库', async () => {
    http.get.mockResolvedValue([]);
    const { result } = renderHook(() => useServerPrefs('seating-prefs', DEFAULTS));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.setValue({ org: '新单位' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post).toHaveBeenCalledWith('/saved-items', {
      kind: 'seating-prefs',
      name: PREFS_NAME,
      payload: { org: '新单位', paper: 'A4' },
    });
  });

  it('防抖窗口内就切走（卸载）时把改动冲出去，而不是静默丢弃', async () => {
    http.get.mockResolvedValue([]);
    const { result, unmount } = renderHook(() => useServerPrefs('seating-prefs', DEFAULTS));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.setValue({ org: '切标签前改的' }));
    unmount();
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1]).toMatchObject({
      payload: { org: '切标签前改的' },
    });
  });
});
