import { useState, useEffect } from 'react';

export type DepartmentNode = {
  id: string;
  name: string;
  priority?: number;
  children?: DepartmentNode[];
};

export type RoleNode = {
  id: string;
  name: string;
  departmentId: string;
  priority?: number;
};

let departments: DepartmentNode[] = [
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
    ]
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
    ]
  },
  {
    id: '12',
    name: '上海分公司',
    priority: 80,
    children: [
      { id: '13', name: '销售部', priority: 90 },
      { id: '14', name: '客户成功部', priority: 80 },
      { id: '15', name: '运营部', priority: 70 },
    ]
  }
];

let roles: RoleNode[] = [
  { id: '1', name: '前端工程师', departmentId: '8', priority: 10 },
  { id: '2', name: '后端工程师', departmentId: '8', priority: 20 },
  { id: '3', name: '产品经理', departmentId: '9', priority: 10 },
  { id: '4', name: 'UI设计师', departmentId: '10', priority: 10 },
  { id: '5', name: 'HR', departmentId: '4', priority: 10 },
  { id: '6', name: '财务经理', departmentId: '3', priority: 10 },
  { id: '7', name: '销售总监', departmentId: '13', priority: 10 },
];

let listeners: (() => void)[] = [];

const sortDepartments = (nodes: DepartmentNode[]): DepartmentNode[] => {
  return [...nodes]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(node => ({
      ...node,
      children: node.children ? sortDepartments(node.children) : undefined
    }));
};

const sortRoles = (rolesList: RoleNode[]): RoleNode[] => {
  return [...rolesList].sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

export const departmentStore = {
  getDepartments: () => sortDepartments(departments),
  setDepartments: (newDepts: DepartmentNode[]) => {
    departments = newDepts;
    listeners.forEach(l => l());
  },
  getRoles: () => sortRoles(roles),
  setRoles: (newRoles: RoleNode[]) => {
    roles = newRoles;
    listeners.forEach(l => l());
  },
  subscribe: (listener: () => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }
};

export function useDepartments() {
  const [depts, setDepts] = useState(departmentStore.getDepartments());
  const [rls, setRls] = useState(departmentStore.getRoles());
  
  useEffect(() => {
    return departmentStore.subscribe(() => {
      setDepts(departmentStore.getDepartments());
      setRls(departmentStore.getRoles());
    });
  }, []);
  
  return { 
    departments: depts, 
    setDepartments: departmentStore.setDepartments,
    roles: rls,
    setRoles: departmentStore.setRoles
  };
}

export function flattenDepartments(nodes: DepartmentNode[]): { id: string, name: string }[] {
  let result: { id: string, name: string }[] = [];
  nodes.forEach(node => {
    result.push({ id: node.id, name: node.name });
    if (node.children) {
      result = result.concat(flattenDepartments(node.children));
    }
  });
  return result;
}
