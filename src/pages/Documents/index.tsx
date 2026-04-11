import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useBodyOverflow } from '../../hooks/useBodyOverflow';
import { useDocumentStore } from '../../store/documents';

import { FolderTree } from './components/FolderTree';
import { FileList } from './components/FileList';
import { DocumentSetGrid } from './components/DocumentSetGrid';
import { SetFormModal } from './components/SetFormModal';
import { FolderFormModal } from './components/FolderFormModal';
import { MoveFileModal } from './components/MoveFileModal';
import { PrintSetModal } from './components/PrintSetModal';

import { useDocumentActions } from './hooks/useDocumentActions';

export default function Documents() {
  const folders = useDocumentStore((state) => state.folders);
  const documents = useDocumentStore((state) => state.documents);
  const documentSets = useDocumentStore((state) => state.documentSets);
  const fetchData = useDocumentStore((state) => state.fetchData);
  const isLoading = useDocumentStore((state) => state.isLoading);

  const [activeTab, setActiveTab] = useState<'files' | 'sets'>('sets');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    currentFolderId,
    setCurrentFolderId,
    expandedFolders,
    isFolderModalOpen,
    setIsFolderModalOpen,
    editingFolder,
    isMoveModalOpen,
    setIsMoveModalOpen,
    targetFolderId,
    isSetModalOpen,
    setIsSetModalOpen,
    editingSet,
    isPrintModalOpen,
    setIsPrintModalOpen,
    printingSet,
    isPrinting,
    setIsPrinting,
    expandedModalFolders,
    selectedDocIds,
    printSettings,
    fileInputRef,
    toggleAllModalFolders,
    toggleModalFolder,
    handleDocToggle,
    handleFileUpload,
    handleCreateSetClick,
    handleCreateRootFolderClick,
    handleMoveDocClick,
    handleEditSetClick,
    handleDeleteSetClick,
    handlePrintSetClick,
    handleSaveSet,
    handleSaveFolder,
    handleMoveFile,
    toggleFolder,
    onSetCurrentFolderClick,
    onAddSubFolderClick,
    onEditFolderClick,
    onDeleteFolderClick,
    handleDeleteDocClick,
    onSetColorClick,
    onSetDuplexClick,
    onSetCopiesClick,
    onTargetFolderChange,
  } = useDocumentActions();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useBodyOverflow(isFolderModalOpen || isMoveModalOpen || isSetModalOpen || isPrintModalOpen);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getBreadcrumbs = useCallback(() => {
    const crumbs = [];
    let current = folders.find((f) => f.id === currentFolderId);
    while (current) {
      crumbs.unshift(current);
      current = folders.find((f) => f.id === current!.parentId);
    }
    return crumbs;
  }, [folders, currentFolderId]);

  const currentDocs = useMemo(() => {
    return documents.filter((d) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (d.name || '').toLowerCase().includes(query) || (d.type || '').toLowerCase().includes(query);
      }
      return d.folderId === currentFolderId;
    });
  }, [documents, searchQuery, currentFolderId]);

  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    setTimeout(() => {
      setIsPrinting(false);
      setIsPrintModalOpen(false);

      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'absolute';
      printIframe.style.top = '-1000px';
      printIframe.style.left = '-1000px';
      document.body.appendChild(printIframe);

      const printDoc = printIframe.contentWindow?.document;
      if (printDoc) {
        printDoc.write(`
          <html>
            <head>
              <title>打印套件 - ${printingSet?.name}</title>
              <style>
                body { font-family: sans-serif; padding: 20px; }
                h1 { text-align: center; }
                .doc-item { margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
                .doc-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
                .doc-content { font-size: 14px; color: #666; }
                @media print {
                  .page-break { page-break-after: always; }
                }
              </style>
            </head>
            <body>
              <h1>${printingSet?.name}</h1>
              <p style="text-align: center; color: #666;">包含 ${printingSet?.documentIds.length} 份文件</p>
              <hr/>
              ${printingSet?.documentIds
                .map((id) => {
                  const doc = documents.find((d) => d.id === id);
                  if (!doc) return '';
                  const settings = printingSet.printSettings?.[id] || { duplex: false, color: false, copies: 1 };
                  return `
                  <div class="doc-item page-break">
                    <div class="doc-title">文件：${doc.name}</div>
                    <div class="doc-content">
                      <p>文件大小：${formatFileSize(doc.size)}</p>
                      <p>上传时间：${doc.uploadedAt}</p>
                      <p><strong>打印设置：</strong>${settings.copies}份 | ${settings.color ? '彩色' : '黑白'} | ${settings.duplex ? '双面' : '单面'}</p>
                      <div style="margin-top: 20px; padding: 20px; border: 1px dashed #ccc; text-align: center; color: #999;">
                        [ 此处为文件内容占位符，实际打印时将按照上述设置输出真实文件内容 ]
                      </div>
                    </div>
                  </div>
                `;
                })
                .join('')}
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.print();
                    setTimeout(function() {
                      window.parent.document.body.removeChild(printIframe);
                    }, 1000);
                  }, 500);
                };
              </script>
            </body>
          </html>
        `);
        printDoc.close();
      }
    }, 1500);
  }, [printingSet, documents, formatFileSize, setIsPrinting, setIsPrintModalOpen]);

  const handleDownloadDocClick = useCallback((url: string, name: string) => {
    if (url !== '#') {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast.error('Mock文件无法下载');
    }
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">常用文件</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理公司常用文件模板，支持一键打包打印</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex">
            <button
              onClick={() => setActiveTab('sets')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sets'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              文件套件
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'files'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              文件库
            </button>
          </div>
          {activeTab === 'files' ? (
            <>
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                上传文件
              </button>
            </>
          ) : (
            <button
              onClick={handleCreateSetClick}
              className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建套件
            </button>
          )}
        </div>
      </div>

      {activeTab === 'files' && (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
          <FolderTree
            folders={folders}
            currentFolderId={currentFolderId}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onSetCurrentFolderClick={onSetCurrentFolderClick}
            onAddSubFolderClick={onAddSubFolderClick}
            onEditFolderClick={onEditFolderClick}
            onDeleteFolderClick={onDeleteFolderClick}
            handleCreateRootFolderClick={handleCreateRootFolderClick}
          />

          <FileList
            documents={currentDocs}
            isLoading={isLoading}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            breadcrumbs={getBreadcrumbs()}
            onBreadcrumbClick={setCurrentFolderId}
            onMoveDocClick={handleMoveDocClick}
            handleDownloadDocClick={handleDownloadDocClick}
            handleDeleteDocClick={handleDeleteDocClick}
            formatFileSize={formatFileSize}
          />
        </div>
      )}

      {activeTab === 'sets' && (
        <DocumentSetGrid
          documentSets={documentSets}
          documents={documents}
          isLoading={isLoading}
          onEditSetClick={handleEditSetClick}
          onDeleteSetClick={handleDeleteSetClick}
          onPrintSetClick={handlePrintSetClick}
          handleCreateSetClick={handleCreateSetClick}
        />
      )}

      <SetFormModal
        isOpen={isSetModalOpen}
        onClose={() => setIsSetModalOpen(false)}
        editingSet={editingSet}
        handleSaveSet={handleSaveSet}
        folders={folders}
        documents={documents}
        selectedDocIds={selectedDocIds}
        onDocToggleChange={handleDocToggle}
        expandedModalFolders={expandedModalFolders}
        toggleAllModalFolders={toggleAllModalFolders}
        toggleModalFolder={toggleModalFolder}
        printSettings={printSettings}
        onSetColorClick={onSetColorClick}
        onSetDuplexClick={onSetDuplexClick}
        onSetCopiesClick={onSetCopiesClick}
      />

      <FolderFormModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        editingFolder={editingFolder}
        handleSaveFolder={handleSaveFolder}
      />

      <MoveFileModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        folders={folders}
        targetFolderId={targetFolderId}
        onTargetFolderChange={onTargetFolderChange}
        handleMoveFile={handleMoveFile}
      />

      <PrintSetModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        printingSet={printingSet}
        isPrinting={isPrinting}
        handlePrint={handlePrint}
        documents={documents}
      />
    </div>
  );
}
