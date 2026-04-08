import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolve, setResolve] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOptions(options);
    setIsOpen(true);
    return new Promise<boolean>((res) => {
      setResolve(() => res);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (resolve) resolve(false);
  }, [resolve]);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolve) resolve(true);
  }, [resolve]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <BaseModal
        isOpen={isOpen}
        onClose={handleClose}
        title={options?.title || '确认'}
        size="md"
        footer={
          <div className="flex space-x-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 sm:flex-none inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:text-sm"
            >
              {options?.cancelText || '取消'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 sm:flex-none inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white active:scale-95 transition-transform sm:text-sm ${
                options?.variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner hover:from-blue-500 hover:to-blue-600'
              }`}
            >
              {options?.confirmText || '确认'}
            </button>
          </div>
        }
      >
        <div className="flex items-start space-x-4">
          {options?.variant === 'danger' && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {options?.description}
            </p>
          </div>
        </div>
      </BaseModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}
