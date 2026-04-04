import React, { useEffect, useRef, useState } from 'react';
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

export const BaseModal: React.FC<BaseModalProps> = React.memo(({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = '',
  bodyClassName = 'p-4 sm:p-6',
}) => {
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
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
        if (footerRef.current) setFooterHeight(footerRef.current.offsetHeight);
      }, 0);
    }
  }, [isOpen, title, footer]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm"
            aria-hidden="true"
            onClick={onClose}
          />

          {/* Modal Panel (外层容器) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`relative z-10 w-full bg-white dark:bg-slate-800 rounded-3xl text-left shadow-2xl shadow-black/10 flex flex-col max-h-full ${sizeClasses[size]} ${size === 'full' ? 'h-full' : ''} ${className}`}
          >
            {/* Header */}
            <div ref={headerRef} className="px-4 py-4 sm:px-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0 bg-white dark:bg-slate-800 rounded-t-3xl">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white" id="modal-title">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body (内容区域) */}
            <div 
              className={`flex-[1_1_auto] overflow-y-auto custom-scrollbar ${bodyClassName}`}
              style={{ 
                maxHeight: '80vh',
                height: headerHeight || footerHeight ? `calc(100% - ${headerHeight}px - ${footerHeight}px)` : 'auto'
              }}
            >
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div ref={footerRef} className="px-4 py-3 sm:px-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0 flex justify-end gap-3 rounded-b-3xl">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
