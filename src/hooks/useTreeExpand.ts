import { useState, useCallback } from 'react';

export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
}

export function useTreeExpand<T extends { id: string; children?: T[] }>(nodes: T[]) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = useCallback((e: React.SyntheticEvent, id: string) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }, []);

  const expandAll = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const allIds = new Set<string>();
      const traverse = (currentNodes: T[]) => {
        currentNodes.forEach((node) => {
          allIds.add(node.id);
          if (node.children && node.children.length > 0) {
            traverse(node.children);
          }
        });
      };
      traverse(nodes);
      setExpandedNodes(allIds);
    },
    [nodes]
  );

  const collapseAll = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes(new Set());
  }, []);

  const isAllExpanded = useCallback(() => {
    let totalNodes = 0;
    const traverse = (currentNodes: T[]) => {
      currentNodes.forEach((node) => {
        totalNodes++;
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      });
    };
    traverse(nodes);
    return expandedNodes.size === totalNodes && totalNodes > 0;
  }, [nodes, expandedNodes.size]);

  return { expandedNodes, toggleNode, expandAll, collapseAll, isAllExpanded };
}
