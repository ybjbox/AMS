import PageContainer from "@/components/PageContainer";
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Upload } from 'lucide-react';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useDocumentStore } from '@/store/useDocumentStore';
import { usePermissionsStore } from '@/store/permissions';
import { hasPermission } from '@/utils/permission';

import { FolderTree } from './components/FolderTree';
import { FileList } from './components/FileList';
import { DocumentSetGrid } from './components/DocumentSetGrid';
import { SetFormModal } from './components/SetFormModal';
import { FolderFormModal } from './components/FolderFormModal';
import { MoveFileModal } from './components/MoveFileModal';
import { PrintSetModal } from './components/PrintSetModal';

import { useDocumentActions } from './hooks/useDocumentActions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Documents() {
  const folders = useDocumentStore((state) => state.folders);
  const documents = useDocumentStore((state) => state.documents);
  const documentSets = useDocumentStore((state) => state.documentSets);
  const fetchData = useDocumentStore((state) => state.fetchData);
  const isLoading = useDocumentStore((state) => state.isLoading);
  // 订阅权限矩阵，使设置页的矩阵修改即时反映到按钮可见性
  usePermissionsStore((state) => state.permissions);
  const canManageDocs = hasPermission('documents:manage');

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
    expandedModalFolders,
    selectedDocIds,
    printSettings,
    isUploading,
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
    handlePrintSet,
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

  return (
    <PageContainer className="space-y-6 animate-in fade-in duration-400">
      <div className="page-header shrink-0">
        <div>
          <h1 className="page-title">常用文件</h1>
          <p className="page-subtitle">管理公司常用文件模板，支持一键打包打印</p>
        </div>
        <div className="toolbar">
          <div className="tab-group" role="tablist" aria-label="文件管理">
            <button
              role="tab"
              aria-selected={activeTab === 'sets'}
              onClick={() => handleTabChange('sets')}
              className={activeTab === 'sets' ? 'tab-item-active' : 'tab-item'}
            >
              文件套件
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'files'}
              onClick={() => handleTabChange('files')}
              className={activeTab === 'files' ? 'tab-item-active' : 'tab-item'}
            >
              文件库
            </button>
          </div>
          {canManageDocs && (activeTab === 'files' ? (
            <>
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary"
                disabled={isUploading}
              >
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{isUploading ? '上传中…' : '上传文件'}</span>
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
          ))}
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
        handlePrint={handlePrintSet}
        documents={documents}
      />
    </PageContainer>
  );
}
