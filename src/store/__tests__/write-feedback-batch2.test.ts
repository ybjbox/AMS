/**
 * 2026-09-26 UI/UX 审查批次 2 的回归：失败必须被接住、并且和"没有数据"长得不一样。
 *
 * 覆盖三件事：
 *  1. reportWrite —— store 写动作把失败原因作为返回值（不抛异常），调用点必须接住；
 *  2. scheduleAppReload —— 恢复备份后必须重载，否则其它 store 仍持有恢复前的内存态（B4）；
 *  3. useDepartmentStore.loadError —— 空树要能区分「还没建部门」与「没拉到」（M1）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/api', () => ({ http }));

import { reportWrite } from '@/store/saveFailure';
import { scheduleAppReload, RELOAD_AFTER_RESTORE_MS } from '@/utils/reloadApp';
import { useDepartments } from '@/store/useDepartmentStore';

describe('reportWrite：写失败不能表现成成功', () => {
  beforeEach(() => vi.clearAllMocks());

  it('返回失败原因时只弹错误，不弹成功', async () => {
    const ok = await reportWrite('没有权限，仅管理员可删除班次', '班次已删除');
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('没有权限，仅管理员可删除班次');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('成功时弹一次成功文案', async () => {
    const ok = await reportWrite(null, '班次已创建');
    expect(ok).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('班次已创建');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('可以直接把未 await 的 Promise 交给它（调用点少写一个 await 也不会漏接）', async () => {
    const p = Promise.resolve('后端 500');
    await expect(reportWrite(p, '不该出现')).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledWith('后端 500');
  });
});

describe('scheduleAppReload：换库之后必须重载界面', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it('延迟到 toast 能被看见之后才重载', () => {
    scheduleAppReload();
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RELOAD_AFTER_RESTORE_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('组织架构加载失败要留下可判定的痕迹', () => {
  const reset = () =>
    act(() => {
      useDepartments.setState({ departments: [], roles: [], initialized: false, loadError: null });
    });

  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  it('拉取失败：记 loadError + 保持未初始化（这样"重试"真的会再拉一次）', async () => {
    http.get.mockRejectedValueOnce({ error: '服务器内部错误' });
    await useDepartments.getState().fetchDepartments();

    const s = useDepartments.getState();
    expect(s.loadError).toContain('服务器内部错误');
    expect(s.initialized).toBe(false);
    expect(s.departments).toEqual([]);
    expect(toast.error).toHaveBeenCalled();

    // 失败态下再拉一次必须真的发请求（不是被 initialized 短路）
    http.get.mockResolvedValueOnce({ departments: [], roles: [] });
    await useDepartments.getState().fetchDepartments();
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('拉取成功：清空 loadError', async () => {
    http.get.mockResolvedValueOnce({
      departments: [{ id: 'd1', name: '前厅部', parentId: null, sortOrder: 1 }],
      roles: [],
    });
    await useDepartments.getState().fetchDepartments();

    const s = useDepartments.getState();
    expect(s.loadError).toBeNull();
    expect(s.initialized).toBe(true);
  });
});
