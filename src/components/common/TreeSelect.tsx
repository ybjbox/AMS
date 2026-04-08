import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTreeExpand, TreeNode } from '../../hooks/useTreeExpand';

export type { TreeNode };

interface TreeSelectProps {
  nodes: TreeNode[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  renderLeaf?: (node: TreeNode, depth: number, closeDropdown: () => void) => React.ReactNode;
  getDisplayName?: (node: TreeNode) => string;
  isNodeSelectable?: (node: TreeNode) => boolean;
}

export function TreeSelect({
  nodes,
  value,
  onChange,
  placeholder,
  required,
  renderLeaf,
  getDisplayName = (node) => node.name,
  isNodeSelectable = () => true
}: TreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { expandedNodes, toggleNode, expandAll, collapseAll, isAllExpanded } = useTreeExpand(nodes);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onNodeClick = useCallback((e: React.MouseEvent<HTMLDivElement>, node: TreeNode, hasChildren: boolean) => {
    if (isNodeSelectable(node)) {
      onChange(getDisplayName(node));
      setIsOpen(false);
    } else {
      // If not selectable, toggle expansion
      toggleNode(e, node.id);
    }
  }, [onChange, getDisplayName, isNodeSelectable, toggleNode]);

  const renderTree = useCallback((currentNodes: TreeNode[], depth = 0): React.ReactNode[] => {
    return currentNodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const leafContent = renderLeaf ? renderLeaf(node, depth, () => setIsOpen(false)) : null;
      const hasLeafContent = !!leafContent;
      const isExpanded = expandedNodes.has(node.id);
      const displayName = getDisplayName(node);
      
      return (
        <div key={node.id}>
          <div 
            className="flex items-center py-2 px-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
            style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
            onClick={(e) => onNodeClick(e, node, hasChildren)}
          >
            <div 
              className="w-5 h-5 flex items-center justify-center mr-1"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren || hasLeafContent) {
                  toggleNode(e, node.id);
                }
              }}
            >
              {(hasChildren || hasLeafContent) ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
              ) : <div className="w-4 h-4" />}
            </div>
            <span className={value === displayName ? 'font-semibold text-blue-600 dark:text-blue-400' : 'font-medium'}>{displayName}</span>
          </div>
          
          {isExpanded && (
            <div>
              {leafContent}
              {hasChildren && renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }, [expandedNodes, value, toggleNode, getDisplayName, renderLeaf, onNodeClick]);

  return (
    <div className="relative mt-1" ref={wrapperRef}>
      <div 
        className="relative cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <input
          type="text"
          value={value}
          readOnly
          className="block w-full bg-white dark:bg-slate-800 border border-zinc-200/80 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm cursor-pointer text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          placeholder={placeholder}
          required={required}
        />
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400 dark:text-slate-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg max-h-60 rounded-md ring-1 ring-black ring-opacity-5 dark:ring-white/10 flex flex-col focus:outline-none sm:text-sm">
          {nodes.length > 0 ? (
            <>
              <div className="flex justify-end p-1 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-t-md shrink-0">
                <button
                  type="button"
                  onClick={isAllExpanded() ? collapseAll : expandAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {isAllExpanded() ? '一键收起' : '一键展开'}
                </button>
              </div>
              <div className="overflow-auto py-1">
                {renderTree(nodes)}
              </div>
            </>
          ) : (
            <div className="py-2 px-3 text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
          )}
        </div>
      )}
    </div>
  );
}
