import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { FileSignature, Printer } from 'lucide-react';
import { User } from '@/types';
import { ContractTemplate } from './ContractTemplate';

interface ContractPreviewModalProps {
  isOpen: boolean;
  selectedUser: User | null;
  onClose: () => void;
  isDoubleSided: boolean;
  setIsDoubleSided: (val: boolean) => void;
  handlePrint: () => void;
}

export const ContractPreviewModal = ({
  isOpen,
  selectedUser,
  onClose,
  isDoubleSided,
  setIsDoubleSided,
  handlePrint,
}: ContractPreviewModalProps) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <FileSignature className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
          劳动合同预览 - {selectedUser?.name}
        </div>
      }
      size="4xl"
      bodyClassName="p-0"
      footer={
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-700 p-1 rounded-lg">
            <button
              onClick={() => setIsDoubleSided(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!isDoubleSided ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
            >
              单面
            </button>
            <button
              onClick={() => setIsDoubleSided(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isDoubleSided ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
            >
              双面
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              onClick={handlePrint}
              className="btn-primary"
            >
              <Printer className="w-4 h-4 mr-2" />
              打印合同
            </button>
          </div>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto p-8 bg-zinc-100 dark:bg-zinc-900 w-full h-[70vh]">
        {/* Printable Contract Area */}
        {selectedUser && <ContractTemplate user={selectedUser} />}
      </div>
    </BaseModal>
  );
};
