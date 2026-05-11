import React, { useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import { DepartmentNode } from '@/types';

interface DepartmentTreeNodeProps {
  node: DepartmentNode;
  level: number;
  expandedIds: Set<string>;
  onToggleExpand: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddChild: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onEdit: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete: (e: React.MouseEvent<HTMLButtonElement>) => void;
  canManage: boolean;
}

const DepartmentTreeNode = React.memo(function DepartmentTreeNode({
  node,
  level,
  expandedIds,
  onToggleExpand,
  onAddChild,
  onEdit,
  onDelete,
  canManage,
}: DepartmentTreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li
      className="relative"
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <div
        className={`flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-zinc-100 group ${level === 0 ? 'bg-zinc-50 border border-zinc-200 dark:border-zinc-700 mb-2' : ''}`}
        data-id={node.id}
        data-haschildren={hasChildren}
        onClick={onToggleExpand}
      >
        <div className="flex items-center space-x-2">
          <span className="w-5 h-5 flex items-center justify-center text-zinc-400 shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <span className="w-4 h-4" />
            )}
          </span>

          {level === 0 ? (
            <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
          ) : isExpanded && hasChildren ? (
            <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-blue-600 shrink-0" />
          )}

          <span
            className={`text-sm ${level === 0 ? 'font-semibold text-zinc-800 dark:text-zinc-200' : 'font-medium text-zinc-700 dark:text-zinc-300'}`}
          >
            {node.name}
          </span>

          {hasChildren && (
            <span className="ml-2 px-2 py-0.5 text-[10px] font-medium bg-zinc-200 text-zinc-600 rounded-full">
              {node.children!.length}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canManage && (
            <>
              <button
                data-id={node.id}
                onClick={onAddChild}
                className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                title="添加子部门"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                data-id={node.id}
                onClick={onEdit}
                className="p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                title="编辑"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                data-id={node.id}
                onClick={onDelete}
                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <ul
            className={`space-y-1 ml-6 border-l border-zinc-200 dark:border-zinc-700 pl-2 mt-1`}
            role="group"
          >
            {node.children!.map((child) => (
              <DepartmentTreeNode
                key={child.id}
                node={child}
                level={level + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                canManage={canManage}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
});

interface DepartmentTreeProps {
  departments: DepartmentNode[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  handleAddChild: (parentId: string, e: React.MouseEvent) => void;
  handleEdit: (node: DepartmentNode, e: React.MouseEvent) => void;
  handleDelete: (id: string, e: React.MouseEvent) => void;
  canManage: boolean;
}

export function DepartmentTree({
  departments,
  expandedIds,
  toggleExpand,
  handleAddChild,
  handleEdit,
  handleDelete,
  canManage,
}: DepartmentTreeProps) {
  const onToggleExpandClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const id = e.currentTarget.dataset.id;
      const hasChildren = e.currentTarget.dataset.haschildren === 'true';
      if (id && hasChildren) {
        toggleExpand(id);
      }
    },
    [toggleExpand]
  );

  const onAddChildClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (id) handleAddChild(id, e);
    },
    [handleAddChild]
  );

  const onEditClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      const findNode = (nodes: DepartmentNode[]): DepartmentNode | undefined => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return undefined;
      };
      const node = findNode(departments);
      if (node) handleEdit(node, e);
    },
    [departments, handleEdit]
  );

  const onDeleteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (id) handleDelete(id, e);
    },
    [handleDelete]
  );

  const renderTree = (nodes: DepartmentNode[], level = 0): React.ReactNode => {
    return (
      <ul
        className={`space-y-1 ${level > 0 ? 'ml-6 border-l border-zinc-200 dark:border-zinc-700 pl-2 mt-1' : ''}`}
        role={level === 0 ? "tree" : "group"}
        aria-label={level === 0 ? "部门组织架构" : undefined}
      >
        {nodes.map((node) => (
          <DepartmentTreeNode
            key={node.id}
            node={node}
            level={level}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpandClick}
            onAddChild={onAddChildClick}
            onEdit={onEditClick}
            onDelete={onDeleteClick}
            canManage={canManage}
          />
        ))}
      </ul>
    );
  };

  return <>{renderTree(departments)}</>;
}
