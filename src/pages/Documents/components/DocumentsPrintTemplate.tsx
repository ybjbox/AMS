import React from 'react';
import { createPortal } from 'react-dom';
import { DocumentSet, Document } from '@/store/useDocumentStore';
import { formatFileSize } from '@/utils/fileUtils';

interface DocumentsPrintTemplateProps {
  printRef: React.RefObject<HTMLDivElement | null>;
  printingSet: DocumentSet | null;
  documents: Document[];
}

/**
 * 文件套件打印模板
 * - 通过 createPortal 渲染到 document.body（脱离 #root，不受 #root > * {display:none} 影响）
 * - 屏幕显示时通过 CSS 隐藏（display:none）
 * - 打印时通过 #documents-print-template { display: block !important } 强制显示
 * - 所有内容通过 React 渲染，自动 escape，无 XSS 风险
 */
export function DocumentsPrintTemplate({
  printRef,
  printingSet,
  documents,
}: DocumentsPrintTemplateProps) {
  if (!printingSet) return null;

  return createPortal(
    <div
      id="documents-print-template"
      ref={printRef}
      style={{ display: 'none' }}
    >
      <div style={{ padding: '32px', fontFamily: 'sans-serif' }}>
        {/* 封面 */}
        <div style={{ textAlign: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #d1d5db' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            {printingSet.name}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
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
              style={{
                marginBottom: '32px',
                paddingBottom: '32px',
                borderBottom: '1px dashed #e5e7eb',
                pageBreakAfter: 'always',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                  {index + 1}. {doc.name}
                </h2>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#6b7280', flexShrink: 0, marginLeft: '16px' }}>
                  <span style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px' }}>
                    {settings.copies} 份
                  </span>
                  <span style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px' }}>
                    {settings.color ? '彩色' : '黑白'}
                  </span>
                  <span style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px' }}>
                    {settings.duplex ? '双面' : '单面'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <p>文件大小：{formatFileSize(doc.size)}</p>
                <p>上传时间：{doc.uploadedAt}</p>
              </div>
              {/* 内容占位区域 */}
              <div style={{ marginTop: '16px', padding: '32px', border: '1px dashed #d1d5db', borderRadius: '8px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                [ 实际打印时将输出文件真实内容 ]
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
