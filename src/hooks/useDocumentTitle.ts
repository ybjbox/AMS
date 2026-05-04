import { useEffect } from 'react';

/**
 * 设置页面 document.title，组件卸载时自动还原为 'AMS 系统'
 * @param title 页面标题（不含 ' - AMS' 后缀，hook 自动添加）
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} - AMS` : 'AMS 系统';
    return () => {
      document.title = 'AMS 系统';
    };
  }, [title]);
}
