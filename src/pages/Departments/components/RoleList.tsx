import React, { useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2 } from 'lucide-react';
import { DepartmentNode, RoleNode } from '@/types';

interface RoleTreeNodeProps {
  node: DepartmentNode;
  level: number;
  expandedRoleDepts: Set<string>;
  roles: RoleNode[];
  onToggleRoleDept: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddRole: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onEditRole: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteRole: (e: React.MouseEvent<HTMLButtonElement>) => void;
  canManage: boolean;
}

const RoleTreeNode = React.memo(function RoleTreeNode({
  node,
  level,
  expandedRoleDepts,
  roles,
  onToggleRoleDept,
  onAddRole,
  onEditRole,
  onDeleteRole,
  canManage,
}: RoleTreeNodeProps) {
  const isExpanded = expandedRoleDepts.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const deptRoles = roles.filter((r) => r.departmentId === node.id);

  return (
    <li className="relative">
      <div
        className={`border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden ${level === 0 ? 'bg-white dark:bg-zinc-800' : 'bg-zinc-50/50 dark:bg-zinc-800/30'}`}
      >
        <div
          className={`px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${level === 0 ? 'bg-zinc-50 dark:bg-zinc-800/50 font-medium' : ''}`}
          data-id={node.id}
          onClick={onToggleRoleDept}
        >
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
            )}
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{node.name}</span>
            <span className="text-xs text-zinc-400">({deptRoles.length})</span>
          </div>
          {canManage && (
            <button
              data-id={node.id}
              onClick={onAddRole}
              className="p-1 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors shrink-0"
              title="新增职位"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="p-2 bg-white dark:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-700">
            {deptRoles.length > 0 ? (
              <ul className="space-y-1">
                {deptRoles.map((role) => (
                  <li
                    key={role.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700/50 group"
                  >
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{role.name}</span>
                    {canManage && (
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          data-id={role.id}
                          onClick={onEditRole}
                          className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          data-id={role.id}
                          onClick={onDeleteRole}
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-zinc-400 text-center py-2">暂无职位</div>
            )}

            {hasChildren && (
              <div className="mt-2">
                <ul className="space-y-2 ml-4 border-l border-zinc-200 dark:border-zinc-700 pl-2 mt-2">
                  {node.children!.map((childNode) => (
                    <RoleTreeNode
                      key={childNode.id}
                      node={childNode}
                      level={level + 1}
                      expandedRoleDepts={expandedRoleDepts}
                      roles={roles}
                      onToggleRoleDept={onToggleRoleDept}
                      onAddRole={onAddRole}
                      onEditRole={onEditRole}
                      onDeleteRole={onDeleteRole}
                      canManage={canManage}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
});

interface RoleListProps {
  departments: DepartmentNode[];
  roles: RoleNode[];
  expandedRoleDepts: Set<string>;
  toggleRoleDept: (id: string) => void;
  handleAddRole: (departmentId: string) => void;
  handleEditRole: (role: RoleNode) => void;
  handleDeleteRole: (id: string) => void;
  canManage: boolean;
}

export function RoleList({
  departments,
  roles,
  expandedRoleDepts,
  toggleRoleDept,
  handleAddRole,
  handleEditRole,
  handleDeleteRole,
  canManage,
}: RoleListProps) {
  const onToggleRoleDeptClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const id = e.currentTarget.dataset.id;
      if (id) toggleRoleDept(id);
    },
    [toggleRoleDept]
  );

  const onAddRoleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (id) handleAddRole(id);
    },
    [handleAddRole]
  );

  const onEditRoleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const role = roles.find((r) => r.id === id);
      if (role) handleEditRole(role);
    },
    [roles, handleEditRole]
  );

  const onDeleteRoleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (id) handleDeleteRole(id);
    },
    [handleDeleteRole]
  );

  const renderRoleTree = (nodes: DepartmentNode[], level = 0): React.ReactNode => {
    return (
      <ul className={`space-y-2 ${level > 0 ? 'ml-4 border-l border-zinc-200 dark:border-zinc-700 pl-2 mt-2' : ''}`}>
        {nodes.map((node) => (
          <RoleTreeNode
            key={node.id}
            node={node}
            level={level}
            expandedRoleDepts={expandedRoleDepts}
            roles={roles}
            onToggleRoleDept={onToggleRoleDeptClick}
            onAddRole={onAddRoleClick}
            onEditRole={onEditRoleClick}
            onDeleteRole={onDeleteRoleClick}
            canManage={canManage}
          />
        ))}
      </ul>
    );
  };

  return <>{renderRoleTree(departments)}</>;
}
