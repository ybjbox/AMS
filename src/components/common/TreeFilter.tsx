import React, { useCallback } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useTreeExpand, TreeNode } from '@/hooks/useTreeExpand';

interface TreeFilterProps {
  nodes: TreeNode[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  getDisplayName?: (node: TreeNode) => string;
}

export function TreeFilter({ nodes, selectedValues, onToggle, getDisplayName = (node) => node.name }: TreeFilterProps) {
  const { expandedNodes, toggleNode, expandAll, collapseAll, isAllExpanded } = useTreeExpand(nodes);

  const renderTree = useCallback(
    (currentNodes: TreeNode[], depth = 0): React.ReactNode[] => {
      return currentNodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const displayName = getDisplayName(node);
        const isSelected = selectedValues.includes(displayName);

        return (
          <div key={node.id}>
            <div
              className="flex items-center py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer text-sm"
              style={{ paddingLeft: `${depth * 1.2}rem` }}
              onClick={() => onToggle(displayName)}
            >
              <div
                className="w-5 h-5 flex items-center justify-center mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) {
                    toggleNode(e, node.id);
                  }
                }}
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  )
                ) : (
                  <div className="w-4 h-4" />
                )}
              </div>
              <div
                className={`flex items-center space-x-2 ${isSelected ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-zinc-700 dark:text-zinc-200'}`}
              >
                {/* 契约复选框：16px / 圆角 4px / 选中实色 brand（MASTER v3 扁平，禁渐变） */}
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${isSelected ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-400' : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900'}`}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
                <span>{displayName}</span>
              </div>
            </div>
            {hasChildren && isExpanded && <div>{renderTree(node.children!, depth + 1)}</div>}
          </div>
        );
      });
    },
    [expandedNodes, onToggle, selectedValues, toggleNode, getDisplayName]
  );

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-md">
      <div className="flex justify-end p-1 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-md">
        <button
          onClick={isAllExpanded() ? collapseAll : expandAll}
          className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-zinc-700 transition-colors"
        >
          {isAllExpanded() ? '一键收起' : '一键展开'}
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto p-2">
        {nodes.length > 0 ? (
          renderTree(nodes)
        ) : (
          <div className="py-2 px-3 text-sm text-zinc-500 dark:text-zinc-400">暂无数据</div>
        )}
      </div>
    </div>
  );
}
