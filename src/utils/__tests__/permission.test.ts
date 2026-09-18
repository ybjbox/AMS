import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPermission } from '../permission';
import { useUserStore } from '../../store/useUserStore';
import { useAppSettings } from '../../store/appSettings';
import { usePermissionsStore } from '../../store/permissions';

// Mock dependencies
vi.mock('../../store/useUserStore', () => ({
  useUserStore: {
    getState: vi.fn()
  }
}));

vi.mock('../../store/appSettings', () => ({
  useAppSettings: {
    getState: vi.fn()
  }
}));

// #14 对齐后 hasPermission 读的是可编辑的权限矩阵 store（不再是 config 静态字典）
vi.mock('../../store/permissions', () => ({
  usePermissionsStore: {
    getState: vi.fn()
  }
}));

function seedStore(permissions: Record<string, string[]>) {
  vi.mocked(usePermissionsStore.getState).mockReturnValue({ permissions } as ReturnType<
    typeof usePermissionsStore.getState
  >);
}

describe('hasPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('如果未开启严格权限拦截，默认返回 true', () => {
    vi.mocked(useAppSettings.getState).mockReturnValue({ enableStrictPermission: false } as ReturnType<typeof useAppSettings.getState>);

    expect(hasPermission('any:permission')).toBe(true);
  });

  describe('Strict Permission Enabled', () => {
    beforeEach(() => {
      vi.mocked(useAppSettings.getState).mockReturnValue({ enableStrictPermission: true } as ReturnType<typeof useAppSettings.getState>);
      seedStore({
        ADMIN: ['*'],
        SUPER_ADMIN: ['*'],
        EMPLOYEE: ['attendance:view'],
      });
    });

    it('未登录用户应返回 false', () => {
      vi.mocked(useUserStore.getState).mockReturnValue({ userInfo: null } as ReturnType<typeof useUserStore.getState>);

      expect(hasPermission('attendance:view')).toBe(false);
    });

    it('admin 角色拥有所有权限', () => {
      vi.mocked(useUserStore.getState).mockReturnValue({
        userInfo: { role: 'ADMIN' }
      } as ReturnType<typeof useUserStore.getState>);

      expect(hasPermission('attendance:manage')).toBe(true);
      expect(hasPermission('some:random:permission')).toBe(true); // Should return true because it has '*'
    });

    it('employee 角色只有矩阵里授予的权限', () => {
      vi.mocked(useUserStore.getState).mockReturnValue({
        userInfo: { role: 'EMPLOYEE' }
      } as ReturnType<typeof useUserStore.getState>);

      expect(hasPermission('attendance:view')).toBe(true);
      expect(hasPermission('attendance:manage')).toBe(false);
    });

    it('矩阵修改即时生效（store 是唯一数据源）', () => {
      vi.mocked(useUserStore.getState).mockReturnValue({
        userInfo: { role: 'EMPLOYEE' }
      } as ReturnType<typeof useUserStore.getState>);

      seedStore({ EMPLOYEE: ['attendance:view', 'users:view'] });
      expect(hasPermission('users:view')).toBe(true);
    });
  });
});
