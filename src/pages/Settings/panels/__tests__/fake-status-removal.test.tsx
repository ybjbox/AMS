import React from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PreferencesPanel from '@/pages/Settings/panels/PreferencesPanel';
import ConnectivityListener from '@/components/ConnectivityListener';
import { useUserStore } from '@/store/useUserStore';
import { useAppSettings } from '@/store/appSettings';

/**
 * 批次 E2：拆掉两处"看起来在用、其实不成立"的状态。
 *
 * 1) 系统偏好页以前提供「权限测试 (演示用)」四个角色卡片，点一下就把本地 userInfo.role 改掉
 *    —— 而 permission.ts 正是拿这个字段查权限矩阵，等于在本机伪造身份视图；服务端策略表根本不受影响。
 * 2) 断线遮罩的「立即重试」在 DEV 分支里只看 navigator.onLine（后端进程死了浏览器一直是在线的），
 *    既不发 health 请求，也就永远关不掉遮罩；而遮罩的触发也只跟随浏览器 online 事件，后端失联时不出现。
 */

function setLocalUser(role: string) {
  useUserStore.setState({
    userInfo: { id: 1, username: 'admin', displayName: '管理员', email: '', role },
    token: 't',
  } as never);
}

beforeEach(() => {
  setLocalUser('SUPER_ADMIN');
  useAppSettings.setState({ enableStrictPermission: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('系统偏好：角色只显示、不可在本机改写', () => {
  it('当前角色是只读文本，页面上没有任何可点的角色卡片', () => {
    const { container } = render(<PreferencesPanel />);
    // 角色名与账号名、说明句同在一个 <p> 里，用包含式匹配
    expect(screen.getByText(/超级管理员/).textContent).toContain('超级管理员');
    // 旧实现的形状：<button data-role="HR">人事主管</button>
    expect(container.querySelectorAll('[data-role]').length).toBe(0);
    for (const label of ['超级管理员', '管理员', '人事主管', '普通员工']) {
      const nodes = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes(label));
      expect(nodes.length).toBe(0);
    }
  });

  it('切换"按权限隐藏界面"不会动到角色', () => {
    render(<PreferencesPanel />);
    fireEvent.click(screen.getByRole('switch'));
    expect(useAppSettings.getState().enableStrictPermission).toBe(true);
    expect(useUserStore.getState().userInfo?.role).toBe('SUPER_ADMIN');
  });

  it('开关文案说清它只管界面显隐，不再暗示它是安全边界', () => {
    render(<PreferencesPanel />);
    const copy = screen.getByText('按权限隐藏界面').closest('div');
    expect(copy?.textContent).toContain('不会多出任何权限');
  });
});

describe('断线遮罩：与状态灯同源的真探测', () => {
  function healthStub(results: Array<() => Response | Promise<Response> | Error>) {
    const calls: string[] = [];
    let i = 0;
    const spy = vi.fn(async (url: string) => {
      calls.push(String(url));
      const next = results[Math.min(i, results.length - 1)];
      i += 1;
      const r = next();
      if (r instanceof Error) throw r;
      return r;
    });
    vi.stubGlobal('fetch', spy);
    return { calls, spy };
  }

  const ok = () => ({ ok: true, json: async () => ({ status: 'ok' }) }) as Response;
  const dead = () => new TypeError('Failed to fetch');
  const http500 = () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;

  it('后端连不上才出现遮罩（挂载即真探一次，不再只信 navigator.onLine）', async () => {
    healthStub([dead]);
    render(<ConnectivityListener />);
    await waitFor(() => expect(screen.getByText('后端连接已断开')).toBeTruthy());
    expect(navigator.onLine).toBe(true); // 浏览器在线、后端却死了 —— 旧实现永远不会弹
  });

  it('服务可达但报错（error 态）不弹全屏遮罩，那是状态灯的黄灯', async () => {
    healthStub([http500]);
    render(<ConnectivityListener />);
    await waitFor(() => expect(screen.queryByText('后端连接已断开')).toBeNull());
  });

  it('「立即重试」催一次复检，恢复后遮罩消失；没恢复就留着', async () => {
    const { calls } = healthStub([dead, ok]);
    render(<ConnectivityListener />);
    await waitFor(() => expect(screen.getByText('后端连接已断开')).toBeTruthy());
    const probesBefore = calls.length;

    fireEvent.click(screen.getByRole('button', { name: /立即重试/ }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(probesBefore));
    await waitFor(() => expect(screen.queryByText('后端连接已断开')).toBeNull());

    // 再断一次：按钮不能无条件关遮罩
    healthStub([dead]);
    render(<ConnectivityListener />);
    await waitFor(() => expect(screen.getByText('后端连接已断开')).toBeTruthy());
  });
});
