import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { useUserStore } from '@/store/useUserStore';
import { accountApi, type Account } from '@/services/accountApi';
import AccountManager from '@/components/AccountManager';

vi.mock('@/services/accountApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/accountApi')>()),
  accountApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
    revokeSessions: vi.fn(),
    remove: vi.fn(),
  },
  randomInitialPassword: vi.fn(() => 'InitPass123456'),
}));

const listMock = vi.mocked(accountApi.list);

const acct = (over: Partial<Account> & { username: string }): Account => ({
  employeeId: null,
  displayName: '',
  email: '',
  avatar: '',
  systemRole: 'EMPLOYEE',
  enabled: true,
  mustChangePassword: false,
  locked: false,
  lastLoginAt: null,
  createdAt: '2026-09-01',
  ...over,
});

beforeEach(() => {
  listMock.mockReset();
  useUserStore.setState({ userInfo: { username: 'admin', role: 'SUPER_ADMIN' } as never });
  useEmployeeStore.setState({
    initialized: true,
    users: [{ id: 'EMP0001', name: '张三', department: '办公室' } as never],
  } as never);
});

function renderManager() {
  return render(
    <ConfirmProvider>
      <AccountManager />
    </ConfirmProvider>
  );
}

describe('账号管理面板（第 8 批）', () => {
  it('列出账号并区分已绑定 / 未绑定 / 绑定失效', async () => {
    listMock.mockResolvedValue([
      acct({ username: 'zhangsan', employeeId: 'EMP0001', displayName: '张三' }),
      acct({ username: 'lisi', systemRole: 'HR', mustChangePassword: true }),
      acct({ username: 'ghost', employeeId: 'EMP9999' }),
      acct({ username: 'admin', enabled: false, systemRole: 'SUPER_ADMIN', locked: true }),
    ]);
    renderManager();

    await waitFor(() => expect(screen.getByText('zhangsan')).toBeTruthy());

    // 顶部汇总按口径分别计数，绑定失效单列一项（未绑定 = lisi + admin）
    const summary = screen.getByText(/共 4 个账号/).textContent ?? '';
    expect(summary).toContain('未绑定 2');
    expect(summary).toContain('绑定失效 1');
    expect(summary).toContain('停用 1');
    expect(summary).toContain('待改密 1');
    expect(summary).toContain('锁定 1');

    expect(screen.getAllByText(/张三/).length).toBeGreaterThan(0);
    expect(screen.getByText(/绑定失效 · EMP9999/)).toBeTruthy();
    expect(screen.getAllByText('未绑定')).toHaveLength(2);
    expect(screen.getByText('人事主管')).toBeTruthy();
    expect(screen.getByText('超级管理员')).toBeTruthy();
    expect(screen.getAllByText('从未登录')).toHaveLength(4);
  });

  it('普通管理员对秩 ≥ 自己的账号拿不到任何管理动作（服务端同规则会 403）', async () => {
    useUserStore.setState({ userInfo: { username: 'op_admin', role: 'ADMIN' } as never });
    listMock.mockResolvedValue([
      acct({ username: 'op_admin', systemRole: 'ADMIN' }),
      acct({ username: 'root', systemRole: 'SUPER_ADMIN' }),
      acct({ username: 'peer', systemRole: 'ADMIN' }),
      acct({ username: 'staff', systemRole: 'EMPLOYEE' }),
    ]);
    renderManager();
    await waitFor(() => expect(screen.getByText('root')).toBeTruthy());

    const rowActions = (username: string) => {
      const row = screen.getByText(username).closest('tr') as HTMLTableRowElement;
      return ['重置密码', '强制下线', '删除账号'].map((label) =>
        within(row).getByTitle(new RegExp(`^${label}`)).hasAttribute('disabled')
      );
    };
    // 自己的账号：停用/下线/删除按自锁禁用，重置密码仍可用；超管与同级：全禁用；下级：全可用
    expect(rowActions('op_admin')).toEqual([false, true, true]);
    expect(rowActions('root')).toEqual([true, true, true]);
    expect(rowActions('peer')).toEqual([true, true, true]);
    expect(rowActions('staff')).toEqual([false, false, false]);
    // 禁用态要说清为什么，而不是让人对着灰按钮猜
    const rootRow = screen.getByText('root').closest('tr') as HTMLTableRowElement;
    expect(within(rootRow).getByTitle(/^重置密码/).getAttribute('title')).toContain('只有权限更高的管理员');
  });

  it('当前登录账号的停用/下线/删除按钮禁用（服务端也会拒）', async () => {
    listMock.mockResolvedValue([acct({ username: 'admin' }), acct({ username: 'other' })]);
    renderManager();
    await waitFor(() => expect(screen.getByText('当前登录')).toBeTruthy());

    // 第一行是 admin（当前登录），第二行是 other
    const disabledOf = (label: RegExp) =>
      screen.getAllByLabelText(label).map((b) => b.hasAttribute('disabled'));
    expect(disabledOf(/^停用$/)).toEqual([true, false]);
    expect(disabledOf(/强制下线/)).toEqual([true, false]);
    expect(disabledOf(/删除账号/)).toEqual([true, false]);
  });

  it('没有账号时给出空态而不是空表', async () => {
    listMock.mockResolvedValue([]);
    renderManager();
    await waitFor(() => expect(screen.getByText('没有符合条件的账号')).toBeTruthy());
  });

  it('绑定弹窗里选过一次后列表仍在，且本账号当前的绑定不算「被他人占用」', async () => {
    listMock.mockResolvedValue([acct({ username: 'zhangsan', employeeId: 'EMP0001' })]);
    renderManager();
    await waitFor(() => expect(screen.getByText('zhangsan')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('改绑员工'));
    await screen.findByText('编辑账号：zhangsan');
    const scope = (await screen.findByRole('dialog')) as HTMLElement;

    // 自己已绑的员工不该显示成「已绑 …」而点不动
    const pickerRow = within(scope).getByRole('button', { name: /张三/ });
    expect(pickerRow.textContent).toContain('EMP0001');
    expect(pickerRow.hasAttribute('disabled')).toBe(false);

    fireEvent.click(pickerRow);
    expect(await within(scope).findByText(/已选：张三/)).toBeTruthy();
    // 选完仍要能直接换别人（回归：曾经整块列表被「已选」替换掉）
    expect(within(scope).getByText('清除')).toBeTruthy();
    expect(within(scope).getByRole('button', { name: /张三/ })).toBeTruthy();
  });
});
