import { create } from 'zustand';
import { toast } from 'sonner';
import { DepartmentNode, RoleNode } from '../types';
import { http } from '../services/api';

// 并发去重：同一时刻只允许一个 departments 请求在途（多组件同时 mount 时避免重复请求）
let departmentsInflight: Promise<void> | null = null;

interface DepartmentState {
  departments: DepartmentNode[];
  roles: RoleNode[];
  initialized: boolean;
  /** 整树替换请求在途（两棵树各自独立，保存期间禁用对应提交） */
  savingDepartments: boolean;
  savingRoles: boolean;
  fetchDepartments: () => Promise<void>;
  /** 返回 false 表示服务端没接受这次改动，本地已回滚到改前状态 */
  setDepartments: (newDepts: DepartmentNode[]) => Promise<boolean>;
  setRoles: (newRoles: RoleNode[]) => Promise<boolean>;
}

/**
 * 本地不留演示数据：组织架构的真值是服务端 departments/roles 两张表，
 * 首次进入由 fetchDepartments 拉取。曾经这里硬编码一棵演示树，
 * 拉取失败时界面照旧显示它，用户再点一次保存就把这棵假树整树写进库里。
 */
const initialDepartments: DepartmentNode[] = [];

const initialRoles: RoleNode[] = [];

const sortDepartments = (nodes: DepartmentNode[]): DepartmentNode[] => {
  return [...nodes]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map((node) => ({
      ...node,
      children: node.children ? sortDepartments(node.children) : undefined,
    }));
};

const sortRoles = (rolesList: RoleNode[]): RoleNode[] => {
  return [...rolesList].sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

export const useDepartmentStore = create<DepartmentState>((set, get) => ({
  departments: initialDepartments,
  roles: initialRoles,
  initialized: false,
  savingDepartments: false,
  savingRoles: false,

  /** 从后端加载组织架构（树 + 职位）。
   *  - initialized 去重：已加载过直接跳过（编辑后由 setDepartments/setRoles 增量同步，无需重拉）；
   *  - inflight 去重：并发调用复用同一个 Promise，避免多组件同时 mount 时重复请求。 */
  fetchDepartments: async () => {
    if (get().initialized) return;
    if (departmentsInflight) return departmentsInflight;
    departmentsInflight = (async () => {
      try {
        const res = await http.get<{ departments: DepartmentNode[]; roles: RoleNode[] }>(
          '/departments'
        );
        set({
          departments: sortDepartments(res.departments ?? []),
          roles: sortRoles(res.roles ?? []),
          initialized: true,
        });
      } catch (e) {
        // 拉不到就是拉不到：保持空树并明说，绝不能让用户在"看起来有数据"的空档上做整树替换
        console.error('[departments] 组织架构加载失败：', e);
        toast.error(errText(e, '组织架构加载失败，请先刷新或检查后端是否在线'));
      } finally {
        departmentsInflight = null;
      }
    })();
    return departmentsInflight;
  },

  /** 本地先生效（乐观更新），再整树持久化；服务端没接受就退回改前的树。 */
  setDepartments: async (newDepts) => {
    const prev = get().departments;
    set({ departments: sortDepartments(newDepts), savingDepartments: true });
    try {
      await http.put('/departments/tree', { departments: newDepts });
      return true;
    } catch (e) {
      set({ departments: prev });
      toast.error(`${errText(e, '组织架构保存失败')}，本地已还原`);
      return false;
    } finally {
      set({ savingDepartments: false });
    }
  },

  setRoles: async (newRoles) => {
    const prev = get().roles;
    set({ roles: sortRoles(newRoles), savingRoles: true });
    try {
      await http.put('/departments/roles', { roles: newRoles });
      return true;
    } catch (e) {
      set({ roles: prev });
      toast.error(`${errText(e, '职位保存失败')}，本地已还原`);
      return false;
    } finally {
      set({ savingRoles: false });
    }
  },
}));

// Export departmentStore for backwards compatibility with non-react code if needed
export const departmentStore = {
  getDepartments: () => useDepartmentStore.getState().departments,
  setDepartments: (newDepts: DepartmentNode[]) => void useDepartmentStore.getState().setDepartments(newDepts),
  getRoles: () => useDepartmentStore.getState().roles,
  setRoles: (newRoles: RoleNode[]) => void useDepartmentStore.getState().setRoles(newRoles),
  subscribe: (listener: () => void) => useDepartmentStore.subscribe(listener),
};

export function flattenDepartments(nodes: DepartmentNode[]): { id: string; name: string }[] {
  let result: { id: string; name: string }[] = [];
  nodes.forEach((node) => {
    result.push({ id: node.id, name: node.name });
    if (node.children) {
      result = result.concat(flattenDepartments(node.children));
    }
  });
  return result;
}

export { useDepartmentStore as useDepartments };
