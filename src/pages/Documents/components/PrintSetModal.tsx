import React from 'react';
import { Printer, Check } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { DocumentSet, Document } from '@/store/useDocumentStore';

interface PrintSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  printingSet: DocumentSet | null;
  isPrinting: boolean;
  handlePrint: () => void;
  documents: Document[];
}

export function PrintSetModal({
  isOpen,
  onClose,
  printingSet,
  isPrinting,
  handlePrint,
  documents,
}: PrintSetModalProps) {
  return (
    <BaseModal
      isOpen={isOpen && !!printingSet}
      onClose={() => !isPrinting && onClose()}
      title={`准备打印：${printingSet?.name}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className="btn-secondary w-full sm:w-auto disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="btn-primary w-full sm:w-auto disabled:opacity-50"
          >
            {isPrinting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                处理中...
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                确认打印
              </>
            )}
          </button>
        </>
      }
    >
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
        <Printer className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-center">
        <div className="mt-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            即将为您调用系统打印机，批量打印以下 {printingSet?.documentIds.length} 份文件：
          </p>
          <div className="mt-4 text-left bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 max-h-60 overflow-y-auto border border-zinc-100 dark:border-zinc-700">
            <ul className="space-y-2">
              {printingSet?.documentIds.map((id: string) => {
                const doc = documents.find((d) => d.id === id);
                if (!doc) return null;
                const settings = printingSet.printSettings?.[id] || { duplex: false, color: false, copies: 1 };
                return (
                  <li
                    key={id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 p-2 rounded border border-zinc-200 dark:border-zinc-700 gap-2"
                  >
                    <div className="flex items-center overflow-hidden">
                      <Check className="w-4 h-4 mr-2 text-emerald-500 shrink-0" />
                      <span className="truncate">{doc.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 text-xs">
                      <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                        {settings.copies}份
                      </span>
                      <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                        {settings.color ? '彩色' : '黑白'}
                      </span>
                      <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300">
                        {settings.duplex ? '双面' : '单面'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
