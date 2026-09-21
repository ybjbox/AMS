/**
 * 部门/职位整树替换的失败回滚回归（第 11 批）。
 *
 * 原实现是「先本地 set()，再 fire-and-forget http.put().catch(toast)」：
 * 服务端拒绝时界面仍停在那棵没有落库的树上，initialized 也已是 true 不会再重拉，
 * 于是下一次保存会把这棵幻影树整树写进库里 —— 未落库的差异就这样被真删掉。
 * 现在要求：失败必须回滚 + 明确返回 false；拉取失败不得留下任何演示数据。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http } from '../../services/api';
import { toast } from 'sonner';
import { useDepartmentStore } from '../useDepartmentStore';
import type { DepartmentNode, RoleNode } from '../../types';

vi.mock('../../services/api', () => ({
  http: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const TREE: DepartmentNode[] = [
  { id: '1', name: '集团总部', priority: 100, children: [{ id: '2', name: '行政部', priority: 50 }] },
];
const ROLES: RoleNode[] = [{ id: 'r1', name: 'HR', departmentId: '1', priority: 10 }];

const putMock = vi.mocked(http.put);
const getMock = vi.mocked(http.get);
const toastError = vi.mocked(toast.error);

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
  toastError.mockReset();
  useDepartmentStore.setState({
    departments: TREE,
    roles: ROLES,
    initialized: true,
    savingDepartments: false,
    savingRoles: false,
  });
});

describe('setDepartments', () => {
  it('服务端接受时保留新树并返回 true', async () => {
    putMock.mockResolvedValue({ ok: true });
    const next: DepartmentNode[] = [...TREE, { id: '9', name: '新设部门', priority: 5 }];

    await expect(useDepartmentStore.getState().setDepartments(next)).resolves.toBe(true);
    expect(putMock).toHaveBeenCalledWith('/departments/tree', { departments: next });
    expect(useDepartmentStore.getState().departments.map((d) => d.name)).toContain('新设部门');
    expect(useDepartmentStore.getState().savingDepartments).toBe(false);
  });

  it('服务端拒绝时退回改前的树、给出原因并返回 false', async () => {
    putMock.mockRejectedValue({ error: '部门名称重复' });

    const ok = await useDepartmentStore.getState().setDepartments([
      { id: '1', name: '改名了', priority: 100 },
    ]);

    expect(ok).toBe(false);
    expect(useDepartmentStore.getState().departments).toEqual(TREE);
    expect(toastError).toHaveBeenCalled();
    expect(String(toastError.mock.calls[0][0])).toContain('部门名称重复');
    expect(String(toastError.mock.calls[0][0])).toContain('已还原');
  });
});

describe('setRoles', () => {
  it('失败回滚，成功保留', async () => {
    putMock.mockRejectedValueOnce({ error: '无权限' });
    expect(await useDepartmentStore.getState().setRoles([])).toBe(false);
    expect(useDepartmentStore.getState().roles).toEqual(ROLES);

    putMock.mockResolvedValueOnce({ ok: true });
    expect(await useDepartmentStore.getState().setRoles([])).toBe(true);
    expect(useDepartmentStore.getState().roles).toEqual([]);
  });
});

describe('fetchDepartments', () => {
  it('拉取失败时保持空树、不置 initialized，并提示用户', async () => {
    useDepartmentStore.setState({ departments: [], roles: [], initialized: false });
    getMock.mockRejectedValue({ error: '网络请求失败' });

    await useDepartmentStore.getState().fetchDepartments();

    expect(useDepartmentStore.getState().initialized).toBe(false);
    expect(useDepartmentStore.getState().departments).toEqual([]);
    expect(toastError).toHaveBeenCalled();
  });

  it('本地不再硬编码演示组织树（否则拉取失败会被当成真数据保存回库）', () => {
    expect(TREE.length).toBe(1);
    expect(useDepartmentStore.getInitialState().departments).toEqual([]);
    expect(useDepartmentStore.getInitialState().roles).toEqual([]);
  });
});
