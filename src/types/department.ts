export interface DepartmentNode {
  id: string;
  name: string;
  priority?: number;
  children?: DepartmentNode[];
}

export interface RoleNode {
  id: string;
  name: string;
  departmentId: string;
  priority?: number;
}
