import * as React from 'react';

/**
 * 无样式按钮原语：给卡片、页签、筛选 chip 这类「复合交互」使用。
 *
 * 与 ui/Button 的分工：Button 管标准动作（统一变体/尺寸）；
 * Pressable 只提供原生 button 语义与 ref 透传，视觉全部由调用方类名决定。
 * 功能页不再直接写 <button>，后续焦点/禁用契约只改这一处。
 */
export const Pressable = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  function Pressable(props, ref) {
    return <button ref={ref} data-slot="pressable" {...props} />;
  }
);
