import React from 'react';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /**
   * 内容最大宽度：
   * - '7xl'（默认）：绝大多数页面
   * - '6xl'：窄内容页（如系统设置）
   * - 'none'：不限宽，由调用方通过内容自行控制
   */
  width?: '6xl' | '7xl' | 'none';
}

const WIDTH_CLASS: Record<NonNullable<PageContainerProps['width']>, string> = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  none: '',
};

/**
 * 统一页面容器：替代各页散落的 `p-4 sm:p-6 lg:p-8` + `max-w-7xl mx-auto`（部分页用
 * max-w-6xl、部分无限制）。默认 mx-auto max-w-7xl + 统一的水平/垂直内边距（与旧手写
 * `p-4 sm:p-6 lg:p-8` 一致），间距/动画由调用方通过 className 追加（如
 * `space-y-8 animate-in fade-in duration-500`）；全高滚动页追加 `flex-1 min-h-0`。
 */
export function PageContainer({ children, className = '', width = '7xl' }: PageContainerProps) {
  return (
    <div
      className={`w-full min-h-full mx-auto ${WIDTH_CLASS[width]} px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-24 print:pb-8 flex flex-col ${className}`}
    >
      {children}
    </div>
  );
}

export default PageContainer;
