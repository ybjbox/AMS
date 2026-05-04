import React, { useEffect, useRef, useState } from 'react';
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

    const headerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    useEffect(() => {
      if (isOpen) {
        // Handle Escape key
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            onClose();
          }

          if (e.key === 'Tab' && modalRef.current) {
            const focusableElements = modalRef.current.querySelectorAll(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey) {
              if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
              }
            } else {
              if (document.activeElement === lastElement) {
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
            const firstFocusable = modalRef.current.querySelector(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            ) as HTMLElement;
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

    useEffect(() => {
      if (!isOpen) return;
      const updateHeights = () => {
        if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
        if (footerRef.current) setFooterHeight(footerRef.current.offsetHeight);
      };
      // 使用 ResizeObserver 确保 DOM 渲染后正确测量，并响应内容高度变化
      const observer = new ResizeObserver(updateHeights);
      if (headerRef.current) observer.observe(headerRef.current);
      if (footerRef.current) observer.observe(footerRef.current);
      // 首次立即执行一次
      updateHeights();
      return () => observer.disconnect();
    }, [isOpen, title, footer]);

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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`relative z-10 w-full bg-white dark:bg-zinc-800 rounded-2xl text-left shadow-xl flex flex-col max-h-full outline-none ${sizeClasses[size]} ${size === 'full' ? 'h-full' : ''} ${className}`}
            >
              {/* Header */}
              <div
                ref={headerRef}
                className="px-4 py-4 sm:px-6 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-800 rounded-t-2xl"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white" id="modal-title">
                  {title}
                </h3>
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
                className={`flex-[1_1_auto] overflow-y-auto ${bodyClassName}`}
                style={{
                  maxHeight: '80vh',
                  height: headerHeight || footerHeight ? `calc(100% - ${headerHeight}px - ${footerHeight}px)` : 'auto',
                }}
              >
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div
                  ref={footerRef}
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
