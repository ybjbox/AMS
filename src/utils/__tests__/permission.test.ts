import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPermission } from '../permission';
import { useUserStore } from '../../store/useUserStore';

/**
 * 界面门禁的唯一数据源 = 服务端按鉴权策略表算出、随会话下发的 permissions 列表
 * （server/capabilities.ts）。
 *
 * 本文件此前保护的是两套已被消灭的东西：默认关闭的"严格权限拦截"开关（关着就对任何码
 * 返回 true，等于门禁形同虚设），和 localStorage 里可编辑的权限矩阵。
 * 现在钉住的是反向性质：**没有下发就不放行**，宁可让旧会话重新登录一次。
 */
vi.mock('../../store/useUserStore', () => ({
  useUserStore: { getState: vi.fn() },
}));

function seedUser(userInfo: unknown) {
  vi.mocked(useUserStore.getState).mockReturnValue({ userInfo } as ReturnType<
    typeof useUserStore.getState
  >);
}

describe('hasPermission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未登录一律无权限', () => {
    seedUser(null);
    expect(hasPermission('attendance:view')).toBe(false);
  });

  it('服务端说有什么就有什么（HR 拿得到 manage，拿不到 purge）', () => {
    seedUser({ role: 'HR', permissions: ['attendance:view', 'attendance:manage'] });
    expect(hasPermission('attendance:view')).toBe(true);
    expect(hasPermission('attendance:manage')).toBe(true);
    expect(hasPermission('attendance:purge')).toBe(false);
  });

  it("通配 * 授予全部（管理员/超管的下发形状）", () => {
    seedUser({ role: 'ADMIN', permissions: ['*'] });
    expect(hasPermission('attendance:purge')).toBe(true);
    expect(hasPermission('任何将来新增的码')).toBe(true);
  });

  it('旧会话没有下发列表时判无权限，而不是按本地缓存的旧矩阵放行', () => {
    seedUser({ role: 'ADMIN' }); // 改动前登录的 userInfo：只有角色，没有 permissions
    expect(hasPermission('attendance:view')).toBe(false);
    seedUser({ role: 'ADMIN', permissions: undefined });
    expect(hasPermission('attendance:view')).toBe(false);
    seedUser({ role: 'ADMIN', permissions: 'attendance:view' }); // 非数组（脏值）也不放行
    expect(hasPermission('attendance:view')).toBe(false);
  });

  it('本地偏好再也左右不了门禁（原 kill-switch 的语义反转）', () => {
    // 旧行为：enableStrictPermission=false 时对任何码返回 true。
    // 现在这个开关已被删除，同样的输入必须走"按下发列表判定"。
    seedUser({ role: 'EMPLOYEE', permissions: ['todos:view', 'settings:view'] });
    expect(hasPermission('todos:view')).toBe(true);
    expect(hasPermission('users:manage')).toBe(false);
  });
});
