import { useState, useCallback } from 'react';
import { useConfirm } from '../../../hooks/useConfirm';
import { useDepartments as useDepartmentStore, flattenDepartments } from '../../../store/useDepartmentStore';
import { DepartmentNode, RoleNode } from '../../../types';

export type DeptModalState = {
  isOpen: boolean;
  mode: 'add' | 'edit';
  targetId: string | null;
  parentId: string | null;
  defaultName: string;
  defaultPriority: number;
};

export type RoleModalState = {
  isOpen: boolean;
  mode: 'add' | 'edit';
  targetId: string | null;
  departmentId: string | null;
  defaultName: string;
  defaultPriority: number;
};

export function useDepartmentsLogic() {
  const confirm = useConfirm();
  const departments = useDepartmentStore((state) => state.departments);
  const setDepartments = useDepartmentStore((state) => state.setDepartments);
  const roles = useDepartmentStore((state) => state.roles);
  const setRoles = useDepartmentStore((state) => state.setRoles);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedRoleDepts, setExpandedRoleDepts] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<DeptModalState>({
    isOpen: false,
    mode: 'add',
    targetId: null,
    parentId: null,
    defaultName: '',
    defaultPriority: 0,
  });

  const [roleModal, setRoleModal] = useState<RoleModalState>({
    isOpen: false,
    mode: 'add',
    targetId: null,
    departmentId: null,
    defaultName: '',
    defaultPriority: 0,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }, []);

  const handleAddChild = useCallback((parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({ isOpen: true, mode: 'add', targetId: null, parentId, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleAddRoot = useCallback(() => {
    setModal({ isOpen: true, mode: 'add', targetId: null, parentId: null, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleEdit = useCallback((node: DepartmentNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({
      isOpen: true,
      mode: 'edit',
      targetId: node.id,
      parentId: null,
      defaultName: node.name,
      defaultPriority: node.priority || 0,
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        await confirm({ title: '确定要删除该部门吗？', description: '如果包含子部门也将一并删除。', variant: 'danger' })
      ) {
        const deleteNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
          return nodes
            .filter((n) => n.id !== id)
            .map((n) => ({
              ...n,
              children: n.children ? deleteNode(n.children) : undefined,
            }));
        };
        setDepartments(deleteNode(departments));
      }
    },
    [departments, setDepartments, confirm]
  );

  const handleModalSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const priority = parseInt(formData.get('priority') as string) || 0;

      if (modal.mode === 'add') {
        const newNode: DepartmentNode = { id: Date.now().toString(), name, priority };
        if (modal.parentId) {
          const addNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
            return nodes.map((n) => {
              if (n.id === modal.parentId) {
                return { ...n, children: [...(n.children || []), newNode] };
              }
              return { ...n, children: n.children ? addNode(n.children) : undefined };
            });
          };
          setDepartments(addNode(departments));
          setExpandedIds((prev) => new Set(prev).add(modal.parentId!));
        } else {
          setDepartments([...departments, newNode]);
        }
      } else if (modal.mode === 'edit' && modal.targetId) {
        const editNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
          return nodes.map((n) => {
            if (n.id === modal.targetId) {
              return { ...n, name, priority };
            }
            return { ...n, children: n.children ? editNode(n.children) : undefined };
          });
        };
        setDepartments(editNode(departments));
      }

      setModal((prev) => ({ ...prev, isOpen: false }));
    },
    [modal, departments, setDepartments]
  );

  const toggleRoleDept = useCallback((id: string) => {
    setExpandedRoleDepts((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const handleAddRole = useCallback((departmentId: string) => {
    setRoleModal({ isOpen: true, mode: 'add', targetId: null, departmentId, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleEditRole = useCallback((role: RoleNode) => {
    setRoleModal({
      isOpen: true,
      mode: 'edit',
      targetId: role.id,
      departmentId: role.departmentId,
      defaultName: role.name,
      defaultPriority: role.priority || 0,
    });
  }, []);

  const handleDeleteRole = useCallback(
    async (id: string) => {
      if (await confirm({ title: '确定要删除该职位吗？', description: '此操作不可恢复。', variant: 'danger' })) {
        setRoles(roles.filter((r) => r.id !== id));
      }
    },
    [roles, setRoles, confirm]
  );

  const handleRoleModalSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const priority = parseInt(formData.get('priority') as string) || 0;

      if (roleModal.mode === 'add' && roleModal.departmentId) {
        setRoles([...roles, { id: Date.now().toString(), name, departmentId: roleModal.departmentId, priority }]);
      } else if (roleModal.mode === 'edit' && roleModal.targetId) {
        setRoles(roles.map((r) => (r.id === roleModal.targetId ? { ...r, name, priority } : r)));
      }
      setRoleModal((prev) => ({ ...prev, isOpen: false }));
    },
    [roleModal, roles, setRoles]
  );

  const flatDepts = flattenDepartments(departments);

  const expandAllRoleDepts = useCallback(() => {
    setExpandedRoleDepts(new Set(flatDepts.map((d) => d.id)));
  }, [flatDepts]);

  const collapseAllRoleDepts = useCallback(() => {
    setExpandedRoleDepts(new Set());
  }, []);

  const isAllRoleDeptsExpanded = flatDepts.length > 0 && expandedRoleDepts.size === flatDepts.length;

  return {
    departments,
    roles,
    expandedIds,
    expandedRoleDepts,
    modal,
    roleModal,
    setModal,
    setRoleModal,
    toggleExpand,
    handleAddChild,
    handleAddRoot,
    handleEdit,
    handleDelete,
    handleModalSubmit,
    toggleRoleDept,
    handleAddRole,
    handleEditRole,
    handleDeleteRole,
    handleRoleModalSubmit,
    flatDepts,
    expandAllRoleDepts,
    collapseAllRoleDepts,
    isAllRoleDeptsExpanded,
  };
}
