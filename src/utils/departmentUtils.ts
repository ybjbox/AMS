import { flattenDepartments } from '../store/departments';
import { DepartmentNode } from '../types';

export const getSubDepartments = (deptName: string, nodes: DepartmentNode[]): string[] => {
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
