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
  fetchDepartments: () => Promise<void>;
  setDepartments: (newDepts: DepartmentNode[]) => void;
  setRoles: (newRoles: RoleNode[]) => void;
}

const initialDepartments: DepartmentNode[] = [
  {
    id: '1',
    name: '集团总部',
    priority: 100,
    children: [
      { id: '2', name: '总经办', priority: 90 },
      { id: '3', name: '财务中心', priority: 80 },
      { id: '4', name: '人力资源中心', priority: 70 },
      { id: '5', name: '法务部', priority: 60 },
      { id: '6', name: '行政部', priority: 50 },
    ],
  },
  {
    id: '7',
    name: '北京分公司',
    priority: 90,
    children: [
      { id: '8', name: '研发部', priority: 90 },
      { id: '9', name: '产品部', priority: 80 },
      { id: '10', name: '设计部', priority: 70 },
      { id: '11', name: '市场部', priority: 60 },
    ],
  },
  {
    id: '12',
    name: '上海分公司',
    priority: 80,
    children: [
      { id: '13', name: '销售部', priority: 90 },
      { id: '14', name: '客户成功部', priority: 80 },
      { id: '15', name: '运营部', priority: 70 },
    ],
  },
];

const initialRoles: RoleNode[] = [
  { id: '1', name: '前端工程师', departmentId: '8', priority: 10 },
  { id: '2', name: '后端工程师', departmentId: '8', priority: 20 },
  { id: '3', name: '产品经理', departmentId: '9', priority: 10 },
  { id: '4', name: 'UI设计师', departmentId: '10', priority: 10 },
  { id: '5', name: 'HR', departmentId: '4', priority: 10 },
  { id: '6', name: '财务经理', departmentId: '3', priority: 10 },
  { id: '7', name: '销售总监', departmentId: '13', priority: 10 },
];

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
  departments: sortDepartments(initialDepartments),
  roles: sortRoles(initialRoles),
  initialized: false,

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
        console.error('[departments] 组织架构加载失败：', e);
      } finally {
        departmentsInflight = null;
      }
    })();
    return departmentsInflight;
  },

  // 保持同步签名（调用方在编辑回调里直接用）：本地先生效，再整树持久化到后端
  setDepartments: (newDepts) => {
    set({ departments: sortDepartments(newDepts) });
    http.put('/departments/tree', { departments: newDepts }).catch((e) => {
      toast.error(errText(e, '组织架构保存失败'));
    });
  },

  setRoles: (newRoles) => {
    set({ roles: sortRoles(newRoles) });
    http.put('/departments/roles', { roles: newRoles }).catch((e) => {
      toast.error(errText(e, '职位保存失败'));
    });
  },
}));

// Export departmentStore for backwards compatibility with non-react code if needed
export const departmentStore = {
  getDepartments: () => useDepartmentStore.getState().departments,
  setDepartments: (newDepts: DepartmentNode[]) => useDepartmentStore.getState().setDepartments(newDepts),
  getRoles: () => useDepartmentStore.getState().roles,
  setRoles: (newRoles: RoleNode[]) => useDepartmentStore.getState().setRoles(newRoles),
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
