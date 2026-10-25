import { http } from './api';
import type { SystemRole } from '@/types';

export interface RoleCapability {
  code: string;
  label: string;
  group: '员工自助' | 'HR 数据' | '管理' | '安全';
  floor: SystemRole;
  defaultMinRole: SystemRole;
  dependsOn?: string[];
  threshold: SystemRole;
}

export interface RolePermissionsMatrix {
  roles: SystemRole[];
  capabilities: RoleCapability[];
  hardcoded: string[];
}

export const rolePermissionsApi = {
  get: () => http.get<RolePermissionsMatrix>('/role-permissions'),
  save: (thresholds: Record<string, SystemRole>) =>
    http.put<{ thresholds: Record<string, SystemRole>; matrix: RolePermissionsMatrix }>('/role-permissions', {
      thresholds,
    }),
  reset: () =>
    http.post<{ thresholds: Record<string, SystemRole>; matrix: RolePermissionsMatrix }>(
      '/role-permissions/reset',
      {}
    ),
};
