import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { permissions as defaultPermissions } from '@/config/permission';

export interface PermissionsState {
  /** 角色 -> 权限码列表；值为 ['*'] 表示全部 */
  permissions: Record<string, string[]>;
  /** 切换某角色对某个权限码的授予 / 收回（对拥有 * 的角色无意义，仅用于非管理员角色） */
  togglePermission: (role: string, code: string) => void;
  setRolePermissions: (role: string, codes: string[]) => void;
  /** 恢复为 config/permission.ts 中的默认字典 */
  resetToDefault: () => void;
}

const clone = (obj: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, [...v]]));

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set) => ({
      permissions: clone(defaultPermissions),

      togglePermission: (role, code) =>
        set((state) => {
          const list = state.permissions[role] ?? [];
          const next = list.includes(code)
            ? list.filter((c) => c !== code)
            : [...list, code];
          return { permissions: { ...state.permissions, [role]: next } };
        }),

      setRolePermissions: (role, codes) =>
        set((state) => ({ permissions: { ...state.permissions, [role]: [...codes] } })),

      resetToDefault: () => set({ permissions: clone(defaultPermissions) }),
    }),
    {
      name: 'ams_permissions',
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { permissions?: Record<string, string[]> };
        // v0 → v1：微信通知生成器上线时，已持久化旧矩阵的客户端补发 notice:view
        if (version < 1 && state?.permissions) {
          for (const role of ['HR', 'EMPLOYEE']) {
            const list = state.permissions[role];
            if (Array.isArray(list) && !list.includes('notice:view') && !list.includes('*')) {
              state.permissions[role] = [...list, 'notice:view'];
            }
          }
        }
        // v1 → v2：/settings 入口下发给全员（个人设置/强制改密需要）、
        // 部门管理拆出独立权限码 departments:view（HR+）
        if (version < 2) {
          const perms = state?.permissions;
          if (perms) {
            const grant = (role: string, code: string) => {
              const list = perms[role];
              if (Array.isArray(list) && !list.includes(code) && !list.includes('*')) {
                perms[role] = [...list, code];
              }
            };
            grant('HR', 'settings:view');
            grant('HR', 'departments:view');
            grant('EMPLOYEE', 'settings:view');
          }
        }
        return state as PermissionsState;
      },
    }
  )
);
