import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus, Upload } from 'lucide-react';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useDocumentStore } from '@/store/useDocumentStore';

import { FolderTree } from './components/FolderTree';
import { FileList } from './components/FileList';
import { DocumentSetGrid } from './components/DocumentSetGrid';
import { SetFormModal } from './components/SetFormModal';
import { FolderFormModal } from './components/FolderFormModal';
import { MoveFileModal } from './components/MoveFileModal';
import { PrintSetModal } from './components/PrintSetModal';

import { useDocumentActions } from './hooks/useDocumentActions';
import { DocumentsPrintTemplate } from './components/DocumentsPrintTemplate';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Documents() {
  const folders = useDocumentStore((state) => state.folders);
  const documents = useDocumentStore((state) => state.documents);
  const documentSets = useDocumentStore((state) => state.documentSets);
  const fetchData = useDocumentStore((state) => state.fetchData);
  const isLoading = useDocumentStore((state) => state.isLoading);

  const [activeTab, setActiveTab] = useState<'files' | 'sets'>('sets');
  const [searchQuery, setSearchQuery] = useState('');

  // 使用统一的 title hook 管理页面标题
  useDocumentTitle(activeTab === 'files' ? '文件库' : '文件套件');

  const handleTabChange = useCallback((tab: 'files' | 'sets') => {
    setActiveTab(tab);
  }, []);

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

  const documentsPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useBodyOverflow(isFolderModalOpen || isMoveModalOpen || isSetModalOpen || isPrintModalOpen);

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
    // 使用 React 渲染的隐藏模板，通过 window.print() 触发打印
    // CSS @media print 规则确保只有打印模板显示
    setTimeout(() => {
      setIsPrinting(false);
      setIsPrintModalOpen(false);
      window.print();
    }, 300);
  }, [setIsPrinting, setIsPrintModalOpen]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto w-full min-h-full">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">常用文件</h1>
          <p className="page-subtitle">管理公司常用文件模板，支持一键打包打印</p>
        </div>
        <div className="toolbar">
          <div className="tab-group">
            <button
              onClick={() => handleTabChange('sets')}
              className={activeTab === 'sets' ? 'tab-item-active' : 'tab-item'}
            >
              文件套件
            </button>
            <button
              onClick={() => handleTabChange('files')}
              className={activeTab === 'files' ? 'tab-item-active' : 'tab-item'}
            >
              文件库
            </button>
          </div>
          {activeTab === 'files' ? (
            <>
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary"
              >
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">上传文件</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleCreateSetClick}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">新建套件</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'files' && (
        <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-[400px] md:min-h-[500px]">
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
            handleDeleteDocClick={handleDeleteDocClick}
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

      {/* 打印模板（screen 时隐藏，print 时显示） */}
      <DocumentsPrintTemplate
        printRef={documentsPrintRef}
        printingSet={printingSet}
        documents={documents}
      />
    </div>
  );
}
