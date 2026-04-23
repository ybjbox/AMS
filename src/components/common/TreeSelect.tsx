import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTreeExpand, TreeNode } from '@/hooks/useTreeExpand';

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
  isNodeSelectable = () => true,
}: TreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { expandedNodes, toggleNode, expandAll, collapseAll, isAllExpanded } = useTreeExpand(nodes);

  // Flatten visible nodes for keyboard navigation
  const getVisibleNodes = useCallback(() => {
    const visible: TreeNode[] = [];
    const traverse = (currentNodes: TreeNode[]) => {
      for (const node of currentNodes) {
        visible.push(node);
        if (expandedNodes.has(node.id) && node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return visible;
  }, [nodes, expandedNodes]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    const visibleNodes = getVisibleNodes();
    const currentIndex = visibleNodes.findIndex((n) => n.id === focusedNodeId);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < visibleNodes.length - 1) {
          setFocusedNodeId(visibleNodes[currentIndex + 1].id);
        } else {
          setFocusedNodeId(visibleNodes[0].id);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          setFocusedNodeId(visibleNodes[currentIndex - 1].id);
        } else {
          setFocusedNodeId(visibleNodes[visibleNodes.length - 1].id);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedNodeId) {
          const node = visibleNodes.find((n) => n.id === focusedNodeId);
          if (node) {
            if (isNodeSelectable(node)) {
              onChange(getDisplayName(node));
              setIsOpen(false);
            } else {
              toggleNode(e, node.id);
            }
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowRight':
        if (focusedNodeId) {
          const node = visibleNodes.find((n) => n.id === focusedNodeId);
          if (node && node.children && node.children.length > 0 && !expandedNodes.has(node.id)) {
            toggleNode(e, node.id);
          }
        }
        break;
      case 'ArrowLeft':
        if (focusedNodeId) {
          const node = visibleNodes.find((n) => n.id === focusedNodeId);
          if (node && expandedNodes.has(node.id)) {
            toggleNode(e, node.id);
          }
        }
        break;
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onNodeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, node: TreeNode) => {
      setFocusedNodeId(node.id);
      if (isNodeSelectable(node)) {
        onChange(getDisplayName(node));
        setIsOpen(false);
      } else {
        // If not selectable, toggle expansion
        toggleNode(e, node.id);
      }
    },
    [onChange, getDisplayName, isNodeSelectable, toggleNode]
  );

  const renderTree = useCallback(
    (currentNodes: TreeNode[], depth = 0): React.ReactNode[] => {
      return currentNodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const leafContent = renderLeaf ? renderLeaf(node, depth, () => setIsOpen(false)) : null;
        const hasLeafContent = !!leafContent;
        const isExpanded = expandedNodes.has(node.id);
        const displayName = getDisplayName(node);
        const isFocused = focusedNodeId === node.id;

        return (
          <div key={node.id} role="none">
            <div
              role="treeitem"
              aria-expanded={hasChildren || hasLeafContent ? isExpanded : undefined}
              aria-selected={value === displayName}
              className={`flex items-center py-2 px-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer text-sm text-zinc-700 dark:text-zinc-200 outline-none ${
                isFocused ? 'bg-blue-50 dark:bg-zinc-700 ring-1 ring-inset ring-blue-500' : ''
              }`}
              style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
              onClick={(e) => onNodeClick(e, node)}
              onMouseEnter={() => setFocusedNodeId(node.id)}
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
                {hasChildren || hasLeafContent ? (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  )
                ) : (
                  <div className="w-4 h-4" />
                )}
              </div>
              <span
                className={value === displayName ? 'font-semibold text-blue-600 dark:text-blue-400' : 'font-medium'}
              >
                {displayName}
              </span>
            </div>

            {isExpanded && (
              <div role="group">
                {leafContent}
                {hasChildren && renderTree(node.children!, depth + 1)}
              </div>
            )}
          </div>
        );
      });
    },
    [expandedNodes, value, toggleNode, getDisplayName, renderLeaf, onNodeClick, focusedNodeId]
  );

  return (
    <div className="relative mt-1" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <div className="relative cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <input
          type="text"
          value={value}
          readOnly
          className="block w-full bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 rounded-md shadow-sm py-2 px-3 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm cursor-pointer text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
          placeholder={placeholder}
          required={required}
          aria-haspopup="tree"
          aria-expanded={isOpen}
        />
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-zinc-400 dark:text-zinc-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 shadow-lg max-h-60 rounded-md ring-1 ring-black ring-opacity-5 dark:ring-white/10 flex flex-col focus:outline-none sm:text-sm"
          role="tree"
          tabIndex={-1}
        >
          {nodes.length > 0 ? (
            <>
              <div className="flex justify-end p-1 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 rounded-t-md shrink-0">
                <button
                  type="button"
                  onClick={isAllExpanded() ? collapseAll : expandAll}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  {isAllExpanded() ? '一键收起' : '一键展开'}
                </button>
              </div>
              <div className="overflow-auto py-1">{renderTree(nodes)}</div>
            </>
          ) : (
            <div className="py-2 px-3 text-sm text-zinc-500 dark:text-zinc-400">暂无数据</div>
          )}
        </div>
      )}
    </div>
  );
}
