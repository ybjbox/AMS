import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPermission } from '../permission';
import { useUserStore } from '../../store/useUserStore';
import { useAppSettings } from '../../store/appSettings';

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

// We need to also mock the permissions object to control test behavior.
// Instead of mocking the module, we can rely on how it behaves.
vi.mock('../../config/permission', () => ({
  permissions: {
    ADMIN: ['*'],
    SUPER_ADMIN: ['*'],
    EMPLOYEE: ['attendance:view']
  }
}));

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

    it('employee 角色只有有限权限', () => {
      vi.mocked(useUserStore.getState).mockReturnValue({
        userInfo: { role: 'EMPLOYEE' }
      } as ReturnType<typeof useUserStore.getState>);
      
      expect(hasPermission('attendance:view')).toBe(true);
      expect(hasPermission('attendance:manage')).toBe(false);
    });
  });
});
