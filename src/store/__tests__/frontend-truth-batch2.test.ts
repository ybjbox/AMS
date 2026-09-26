import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 批次 2 的前端真值回归：
 *  1. 名册快照必须能在批量写入后重新拉取（否则导入 200 人后表格还是旧名单，
 *     而 users 是排座/台卡/餐券/通讯录/业务单共用的名单源）；
 *  2. 侧栏自定义顺序要能在路由改名/合并后自愈（否则新入口静默沉到最后）；
 *  3. 控制台快捷入口按能力码过滤（不摆出点了必 403 的入口）。
 */
const userApi = vi.hoisted(() => ({ fetchUsers: vi.fn() }));
vi.mock('@/services/userApi', () => ({ fetchUsers: userApi.fetchUsers }));

import { useEmployeeStore } from '@/store/useEmployeeStore';
import { useAppSettings } from '@/store/appSettings';
import { filterQuickActions } from '@/pages/Dashboard/hooks/useDashboard';

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `EMP${i}`, name: `员工${i}`, status: '在职' }) as never);

describe('员工名册快照', () => {
  beforeEach(() => {
    userApi.fetchUsers.mockReset();
    useEmployeeStore.setState({ users: [], initialized: false, error: null, isLoading: false });
  });

  it('懒加载：已初始化且非空时，普通调用不再打接口', async () => {
    userApi.fetchUsers.mockResolvedValue(roster(3));
    await useEmployeeStore.getState().fetchUsers();
    expect(userApi.fetchUsers).toHaveBeenCalledTimes(1);

    await useEmployeeStore.getState().fetchUsers();
    expect(userApi.fetchUsers).toHaveBeenCalledTimes(1);
  });

  it('force：批量写入之后必须真的重新拉一次并换上服务端名单', async () => {
    userApi.fetchUsers.mockResolvedValueOnce(roster(3)).mockResolvedValueOnce(roster(200));
    await useEmployeeStore.getState().fetchUsers();
    expect(useEmployeeStore.getState().users).toHaveLength(3);

    await useEmployeeStore.getState().fetchUsers({ force: true });
    expect(userApi.fetchUsers).toHaveBeenCalledTimes(2);
    expect(useEmployeeStore.getState().users).toHaveLength(200);
  });
});

describe('侧栏自定义顺序的迁移', () => {
  beforeEach(() => {
    localStorage.removeItem('app_settings_theme');
    useAppSettings.setState({ navOrder: [] });
  });

  const storedNavOrder = () =>
    JSON.parse(localStorage.getItem('app_settings_theme') ?? '{}')?.state?.navOrder as string[] | undefined;

  it('三个打印面合并后：旧 path 换成 /print-tools 且保持原位，不再把新入口挤到最后', async () => {
    localStorage.setItem(
      'app_settings_theme',
      JSON.stringify({
        state: {
          loginBackground: null,
          systemIcon: null,
          theme: 'system',
          navOrder: ['/todos', '/name-cards', '/users', '/nope-gone'],
        },
        version: 0,
      })
    );
    const { useAppSettings: rehydrated } = await import('@/store/appSettings');
    await rehydrated.persist.rehydrate();
    expect(storedNavOrder()).toEqual(['/todos', '/print-tools', '/users']);
  });

  it('navOrder 缺失/类型不对时落回空数组（默认序），而不是崩掉', async () => {
    localStorage.setItem('app_settings_theme', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
    const { useAppSettings: rehydrated } = await import('@/store/appSettings');
    await rehydrated.persist.rehydrate();
    expect(rehydrated.getState().navOrder).toEqual([]);
  });
});

describe('控制台快捷入口过滤', () => {
  const codesFor = (granted: string[]) => (code: string) => granted.includes(code);

  it('普通员工看不到「添加员工 / 部门调整」，仍看得到自助入口', () => {
    const names = filterQuickActions(codesFor(['todos:view', 'settings:view'])).map((a) => a.name);
    expect(names).toEqual(['待办事项', '系统设置']);
  });

  it('管理员四个都在', () => {
    const names = filterQuickActions(
      codesFor(['users:manage', 'todos:view', 'departments:manage', 'settings:view'])
    ).map((a) => a.name);
    expect(names).toEqual(['添加员工', '待办事项', '部门调整', '系统设置']);
  });

  it('能力码全部登记（漏登记的码会被服务端 fail-closed 一律拒绝）', async () => {
    // 这一条只保证常量表里每个入口都带上了 permission，具体码是否登记由服务端能力表测试兜
    const all = filterQuickActions(() => true);
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) expect(typeof a.permission).toBe('string');
  });
});
