import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  className?: string;
  bodyClassName?: string;
}

export const BaseModal: React.FC<BaseModalProps> = React.memo(
  ({ isOpen, onClose, title, children, footer, size = 'md', className = '', bodyClassName = 'p-4 sm:p-6' }) => {
    const sizeClasses = {
      sm: 'sm:max-w-sm',
      md: 'sm:max-w-md',
      lg: 'sm:max-w-lg',
      xl: 'sm:max-w-xl',
      '2xl': 'sm:max-w-2xl',
      '3xl': 'sm:max-w-3xl',
      '4xl': 'sm:max-w-4xl',
      '5xl': 'sm:max-w-5xl',
      full: 'sm:max-w-[1600px] sm:w-[95vw]',
    };

    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (isOpen) {
        // Handle Escape key
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            onClose();
          }

          if (e.key === 'Tab' && modalRef.current) {
            /**
             * 焦点陷阱：首尾回环。
             *
             * 必须**过滤掉不可见与 disabled 的候选**，否则回环会失效：
             * 选择器 `input` 会选中 base-ui Select 藏在控件里的 hidden input（实测 0×0 或 1×1）
             * 和文件选择 input（0×0）。这些元素 focus() 得动但用户看不见，
             * 一旦它正好是"最后一个"，浏览器把焦点送上去后下一次 Tab 就从文档头开始走 ——
             * 实测 ImportModal（上传步只有 4 个候选，末尾是 0×0 的 file input）
             * 连按 22 次 Tab 有 20 次落到弹窗外的侧栏导航上。
             */
            const focusableElements = Array.from(
              modalRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
              )
            ).filter((el) => {
              if (el.hasAttribute('disabled')) return false;
              if (el.getAttribute('aria-hidden') === 'true') return false;
              if (el.closest('[aria-hidden="true"]')) return false;
              if (el.tabIndex < 0) return false;
              // getClientRects().length === 0 表示 display:none 或零尺寸，聚焦它等于把焦点丢进虚空
              return el.getClientRects().length > 0;
            });
            if (focusableElements.length === 0) return;
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const active = document.activeElement;
            // 焦点已经在弹窗外（点背景、或浏览器自己跑出去）时，先收回来
            if (!active || !modalRef.current.contains(active)) {
              firstElement.focus();
              e.preventDefault();
              return;
            }

            if (e.shiftKey) {
              if (active === firstElement || !focusableElements.includes(active as HTMLElement)) {
                lastElement.focus();
                e.preventDefault();
              }
            } else {
              if (active === lastElement || !focusableElements.includes(active as HTMLElement)) {
                firstElement.focus();
                e.preventDefault();
              }
            }
          }
        };

        document.addEventListener('keydown', handleKeyDown);

        // Focus the first element or the modal itself
        setTimeout(() => {
          if (modalRef.current) {
            // 同样要过滤：否则第一个"可聚焦元素"可能是 0×0 的隐藏 input，焦点会落进虚空
            const firstFocusable = Array.from(
              modalRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
              )
            ).find(
              (el) =>
                !el.hasAttribute('disabled') &&
                el.getAttribute('aria-hidden') !== 'true' &&
                !el.closest('[aria-hidden="true"]') &&
                el.tabIndex >= 0 &&
                el.getClientRects().length > 0
            );
            if (firstFocusable) {
              firstFocusable.focus();
            } else {
              modalRef.current.focus();
            }
          }
        }, 100);

        return () => document.removeEventListener('keydown', handleKeyDown);
      }
    }, [isOpen, onClose]);

    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              aria-hidden="true"
              onClick={onClose}
            />

            {/* Modal Panel (外层容器) */}
            <motion.div
              ref={modalRef}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`relative z-10 w-full bg-white dark:bg-zinc-800 rounded-2xl text-left shadow-xl flex flex-col outline-none ${size === 'full' ? 'h-[90vh] max-h-[90vh]' : 'max-h-[90vh]'} ${sizeClasses[size]} ${className}`}
            >
              {/* Header */}
              <div
                className="px-4 py-4 sm:px-6 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-800 rounded-t-2xl"
              >
                {/* h2 而非 h3：弹窗经 portal 挂到 body，脱离了页面里「h1 → h2」的原有上下文。
                用 h3 时整篇 heading 序列变成 h1→h3，axe 判 heading-order 跳档（WCAG 1.3.1）。
                改成 h2 后「页面 h1 → 弹窗 h2 → 弹窗内 h3/h4」成为合法序列，
                语义也更准：弹窗标题是二级标题。视觉尺寸不变（text-lg 保持）。 */}
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white" id="modal-title">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  aria-label="关闭弹窗"
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body (内容区域) */}
              <div
                id="modal-description"
                className={`flex-1 overflow-y-auto min-h-0 ${bodyClassName}`}
              >
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div
                  className="px-4 py-3 sm:px-6 border-t border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 rounded-b-2xl"
                >
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  }
);
