import React, { useCallback } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useTreeExpand, TreeNode } from '../../hooks/useTreeExpand';

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
                className={`flex items-center space-x-2 ${isSelected ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-700 dark:text-zinc-200'}`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner border-blue-600' : 'border-zinc-200/80 dark:border-zinc-600'}`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
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
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-zinc-700 transition-colors"
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
