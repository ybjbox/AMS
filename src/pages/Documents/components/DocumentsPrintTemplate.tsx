import React from 'react';
import { DocumentSet, Document } from '@/store/useDocumentStore';
import { formatFileSize } from '@/utils/fileUtils';

interface DocumentsPrintTemplateProps {
  printRef: React.RefObject<HTMLDivElement | null>;
  printingSet: DocumentSet | null;
  documents: Document[];
}
/**
 * 文件套件打印模板
 * - 隐藏于页面（screen 时 hidden，print 时显示）
 * - 所有内容通过 React textContent 渲染，自动 escape XSS
 */
export function DocumentsPrintTemplate({
  printRef,
  printingSet,
  documents,
}: DocumentsPrintTemplateProps) {
  if (!printingSet) return null;
  return (
    <div ref={printRef} className="hidden print:block p-8 font-sans">
      {/* 封面 */}
      <div className="text-center mb-8 pb-6 border-b border-gray-300">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{printingSet.name}</h1>
        <p className="text-sm text-gray-500">
          共 {printingSet.documentIds.length} 份文件
        </p>
      </div>
      {/* 文件列表 */}
      {printingSet.documentIds.map((id, index) => {
        const doc = documents.find((d) => d.id === id);
        if (!doc) return null;
        const settings = printingSet.printSettings?.[id] || {
          duplex: false,
          color: false,
          copies: 1,
        };
        return (
          <div
            key={id}
            className="mb-8 pb-8 border-b border-dashed border-gray-200 last:border-0 break-after-page"
          >
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                {index + 1}. {doc.name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0 ml-4">
                <span className="border border-gray-200 rounded px-2 py-0.5">
                  {settings.copies} 份
                </span>
                <span className="border border-gray-200 rounded px-2 py-0.5">
                  {settings.color ? '彩色' : '黑白'}
                </span>
                <span className="border border-gray-200 rounded px-2 py-0.5">
                  {settings.duplex ? '双面' : '单面'}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <p>文件大小：{formatFileSize(doc.size)}</p>
              <p>上传时间：{doc.uploadedAt}</p>
            </div>
            {/* 内容占位区域 */}
            <div className="mt-4 p-8 border border-dashed border-gray-300 rounded text-center text-gray-400 text-sm">
              [ 实际打印时将输出文件真实内容 ]
            </div>
          </div>
        );
      })}
    </div>
  );
}
