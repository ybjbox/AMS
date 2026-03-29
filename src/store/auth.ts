import { create } from 'zustand';
import { SystemRole, Permission, RolePermissions, DataScope, RoleDataScope } from '../types';
import { departmentStore, flattenDepartments, DepartmentNode } from './departments';

interface AuthState {
  user: {
    id: string;
    name: string;
    systemRole: SystemRole;
    department?: string;
  } | null;
  setAuth: (newAuth: { user: AuthState['user'] }) => void;
  hasPermission: (permission: Permission, data?: any) => boolean;
}

// Helper to get all sub-departments
const getSubDepartments = (deptName: string, nodes: DepartmentNode[]): string[] => {
  let result: string[] = [];
  
  const findNode = (name: string, currentNodes: DepartmentNode[]): DepartmentNode | null => {
    for (const node of currentNodes) {
      if (node.name === name) return node;
      if (node.children) {
        const found = findNode(name, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const targetNode = findNode(deptName, nodes);
  if (targetNode) {
    result = flattenDepartments([targetNode]).map(d => d.name);
  }
  
  return result;
};

const checkDataScope = (user: AuthState['user'], data: any, scope: DataScope): boolean => {
  if (!user) return false;
  
  switch (scope) {
    case DataScope.ALL:
      return true;
    case DataScope.SELF:
      return data.id === user.id || data.userId === user.id || data.employeeId === user.id;
    case DataScope.DEPARTMENT:
      return data.department === user.department;
    case DataScope.DEPARTMENT_AND_SUB:
      if (!user.department) return false;
      const subDepts = getSubDepartments(user.department, departmentStore.getDepartments());
      return subDepts.includes(data.department);
    default:
      return false;
  }
};

export const getAllowedDepartments = (departments: DepartmentNode[], user: AuthState['user']): DepartmentNode[] => {
  if (!user) return [];
  const scope = RoleDataScope[user.systemRole];
  if (scope === DataScope.ALL) return departments;
  if (scope === DataScope.SELF) return [];
  
  const findNode = (name: string, nodes: DepartmentNode[]): DepartmentNode | null => {
    for (const node of nodes) {
      if (node.name === name) return node;
      if (node.children) {
        const found = findNode(name, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const userDeptNode = findNode(user.department || '', departments);
  if (!userDeptNode) return [];

  if (scope === DataScope.DEPARTMENT) {
    return [{ ...userDeptNode, children: undefined }];
  }

  if (scope === DataScope.DEPARTMENT_AND_SUB) {
    return [userDeptNode];
  }

  return [];
};

export const useAuth = create<AuthState>((set, get) => ({
  user: {
    id: 'ADMIN001',
    name: '管理员',
    systemRole: SystemRole.SUPER_ADMIN,
    department: '集团总部',
  },
  setAuth: (newAuth) => set({ user: newAuth.user }),
  hasPermission: (permission: Permission, data?: any) => {
    const { user } = get();
    if (!user) return false;
    const permissions = RolePermissions[user.systemRole] || [];
    if (!permissions.includes(permission)) return false;

    if (data) {
      const dataScope = RoleDataScope[user.systemRole];
      return checkDataScope(user, data, dataScope);
    }

    return true;
  }
}));

// Export authStore for backwards compatibility with non-react code if needed
export const authStore = {
  getAuth: () => ({ user: useAuth.getState().user }),
  setAuth: (newAuth: { user: AuthState['user'] }) => useAuth.getState().setAuth(newAuth),
  hasPermission: (permission: Permission, data?: any) => useAuth.getState().hasPermission(permission, data),
  subscribe: (listener: () => void) => useAuth.subscribe(listener)
};
