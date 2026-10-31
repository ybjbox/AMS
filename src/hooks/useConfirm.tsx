/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
            <Button
              type="button"
              onClick={handleClose}
              variant="outline"
              size="toolbar"
              className="flex-1 sm:flex-none"
            >
              {options?.cancelText || '取消'}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              variant={options?.variant === 'danger' ? 'danger' : 'default'}
              size="toolbar"
              className="flex-1 sm:flex-none"
            >
              {options?.confirmText || '确认'}
            </Button>
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
            <p className="text-sm text-muted-foreground">{options?.description}</p>
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
