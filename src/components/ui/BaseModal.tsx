import React from 'react';
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

export const BaseModal: React.FC<BaseModalProps> = ({
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
    full: 'sm:max-w-[1600px] sm:w-[95vw] h-[95vh] sm:h-[90vh]',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              aria-hidden="true"
              onClick={onClose}
            />

            {/* This element is to trick the browser into centering the modal contents. */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            {/* Modal Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`relative z-10 inline-block align-bottom w-full bg-white dark:bg-slate-800 rounded-2xl text-left overflow-hidden shadow-2xl sm:my-8 sm:align-middle ${sizeClasses[size]} ${size === 'full' ? 'flex flex-col h-[calc(100vh-2rem)] sm:h-[calc(100vh-4rem)] max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]' : ''} ${className}`}
            >
              {size === 'full' ? (
                <>
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
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

                  {/* Body */}
                  <div className={`flex-1 min-h-0 flex flex-col ${bodyClassName}`}>
                    {children}
                  </div>

                  {/* Footer */}
                  {footer && (
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0 flex justify-end gap-3">
                      {footer}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col max-h-[85vh]">
                  {/* Header */}
                  <div className="flex justify-between items-center px-4 py-4 sm:px-6 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
                    <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white" id="modal-title">
                      {title}
                    </h3>
                    <button
                      onClick={onClose}
                      className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className={`overflow-y-auto custom-scrollbar ${bodyClassName}`}>
                    {children}
                  </div>

                  {/* Footer */}
                  {footer && (
                    <div className="px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0 gap-3">
                      {footer}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
