import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FileText, Folder, Plus, Trash2, Printer, Upload, File, Image as ImageIcon, FileArchive, MoreVertical, X, Edit2, Check, Download, FolderPlus, ChevronRight, ChevronDown, FolderOpen, CornerDownRight, Search } from 'lucide-react';
import { useDocumentStore, Document, DocumentSet, Folder as FolderType } from '../store/documents';
import { BaseModal } from '../components/ui/BaseModal';

export default function Documents() {
  const folders = useDocumentStore(state => state.folders);
  const documents = useDocumentStore(state => state.documents);
  const documentSets = useDocumentStore(state => state.documentSets);
  const fetchData = useDocumentStore(state => state.fetchData);
  const isLoading = useDocumentStore(state => state.isLoading);
  const addFolder = useDocumentStore(state => state.addFolder);
  const updateFolder = useDocumentStore(state => state.updateFolder);
  const removeFolder = useDocumentStore(state => state.removeFolder);
  const addDocument = useDocumentStore(state => state.addDocument);
  const updateDocument = useDocumentStore(state => state.updateDocument);
  const removeDocument = useDocumentStore(state => state.removeDocument);
  const addDocumentSet = useDocumentStore(state => state.addDocumentSet);
  const updateDocumentSet = useDocumentStore(state => state.updateDocumentSet);
  const removeDocumentSet = useDocumentStore(state => state.removeDocumentSet);
  const [activeTab, setActiveTab] = useState<'files' | 'sets'>('sets');
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Folder state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  // Modals state
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<DocumentSet | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printingSet, setPrintingSet] = useState<DocumentSet | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [expandedModalFolders, setExpandedModalFolders] = useState<Set<string>>(new Set());
  
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [printSettings, setPrintSettings] = useState<Record<string, { duplex: boolean, color: boolean, copies: number }>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFolderModalOpen || isMoveModalOpen || isSetModalOpen || isPrintModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isFolderModalOpen, isMoveModalOpen, isSetModalOpen, isPrintModalOpen]);

  const toggleAllModalFolders = useCallback(() => {
    const foldersWithDocs = folders.filter(f => documents.some(d => d.folderId === f.id));
    if (expandedModalFolders.size === foldersWithDocs.length) {
      setExpandedModalFolders(new Set());
    } else {
      setExpandedModalFolders(new Set(foldersWithDocs.map(f => f.id)));
    }
  }, [folders, documents, expandedModalFolders.size]);

  const toggleModalFolder = useCallback((id: string) => {
    setExpandedModalFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const handleDocToggle = useCallback((docId: string, checked: boolean) => {
    if (checked) {
      setSelectedDocIds(prev => [...prev, docId]);
      setPrintSettings(prev => ({ ...prev, [docId]: { duplex: false, color: false, copies: 1 } }));
    } else {
      setSelectedDocIds(prev => prev.filter(id => id !== docId));
      setPrintSettings(prev => {
        const newSettings = { ...prev };
        delete newSettings[docId];
        return newSettings;
      });
    }
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getFileIcon = useCallback((type: string) => {
    if (!type) return <File className="w-8 h-8 text-slate-500" />;
    if (type.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
    if (type.includes('image')) return <ImageIcon className="w-8 h-8 text-blue-600" />;
    if (type.includes('zip') || type.includes('rar')) return <FileArchive className="w-8 h-8 text-amber-500" />;
    return <File className="w-8 h-8 text-slate-500" />;
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Mock backend processing
    setTimeout(() => {
      Array.from(files).forEach((file: File) => {
        const newDoc: Document = {
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          name: file.name,
          type: file.type || file.name.split('.').pop() || 'unknown',
          url: 'https://picsum.photos/seed/document/800/600', // Mock URL
          size: file.size,
          uploadedAt: new Date().toISOString().split('T')[0],
          folderId: currentFolderId
        };
        addDocument(newDoc);
      });

      alert(`成功上传 ${files.length} 个文件 (Mock)`);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
  }, [addDocument, currentFolderId]);

  const handleCreateSetClick = useCallback(() => {
    setEditingSet(null); 
    setSelectedDocIds([]);
    setPrintSettings({});
    setIsSetModalOpen(true);
  }, []);

  const handleCreateRootFolderClick = useCallback(() => {
    setEditingFolder(null); 
    setFolderParentId(null); 
    setIsFolderModalOpen(true);
  }, []);

  const handleMoveDocClick = useCallback((docId: string, folderId: string | null) => {
    setMovingDocId(docId);
    setTargetFolderId(folderId);
    setIsMoveModalOpen(true);
  }, []);

  const handleDownloadDocClick = useCallback((url: string, name: string) => {
    if (url !== '#') {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      alert('Mock文件无法下载');
    }
  }, []);

  const handleDeleteDocClick = useCallback((docId: string) => {
    if (confirm('确定要删除该文件吗？删除后包含该文件的套件也将受影响。')) {
      removeDocument(docId);
    }
  }, [removeDocument]);

  const handleEditSetClick = useCallback((set: DocumentSet) => {
    setEditingSet(set); 
    setSelectedDocIds(set.documentIds);
    setPrintSettings(set.printSettings || {});
    setIsSetModalOpen(true);
  }, []);

  const handleDeleteSetClick = useCallback((setId: string) => {
    if (confirm('确定要删除该套件吗？')) {
      removeDocumentSet(setId);
    }
  }, [removeDocumentSet]);

  const handlePrintSetClick = useCallback((set: DocumentSet) => {
    setPrintingSet(set); 
    setIsPrintModalOpen(true);
  }, []);

  const handleSaveSet = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (editingSet) {
      updateDocumentSet(editingSet.id, { name, description, documentIds: selectedDocIds, printSettings });
    } else {
      addDocumentSet({
        id: Date.now().toString(),
        name,
        description,
        documentIds: selectedDocIds,
        printSettings
      });
    }
    setIsSetModalOpen(false);
    setEditingSet(null);
  }, [editingSet, selectedDocIds, printSettings, updateDocumentSet, addDocumentSet]);

  const handleSaveFolder = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    if (editingFolder) {
      updateFolder(editingFolder.id, { name });
    } else {
      addFolder({
        id: Date.now().toString(),
        name,
        parentId: folderParentId
      });
      if (folderParentId) {
        setExpandedFolders(prev => new Set(prev).add(folderParentId));
      }
    }
    setIsFolderModalOpen(false);
  }, [editingFolder, folderParentId, updateFolder, addFolder]);

  const handleMoveFile = useCallback(() => {
    if (movingDocId) {
      updateDocument(movingDocId, { folderId: targetFolderId });
    }
    setIsMoveModalOpen(false);
  }, [movingDocId, targetFolderId, updateDocument]);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const onSetCurrentFolderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId) {
      setCurrentFolderId(folderId);
    }
  }, []);

  const onToggleModalFolderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId) {
      toggleModalFolder(folderId);
    }
  }, [toggleModalFolder]);

  const onAddSubFolderClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId) {
      setEditingFolder(null);
      setFolderParentId(folderId);
      setIsFolderModalOpen(true);
    }
  }, []);

  const onEditFolderClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId) {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        setEditingFolder(folder);
        setIsFolderModalOpen(true);
      }
    }
  }, [folders]);

  const onDeleteFolderClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId && confirm('确定要删除该文件夹吗？其包含的子文件夹和文件也将被删除。')) {
      removeFolder(folderId);
    }
  }, [removeFolder]);

  const renderFolderTree = useCallback((parentId: string | null, level: number = 0) => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    if (childFolders.length === 0) return null;

    return (
      <ul className={`space-y-0.5 ${level > 0 ? 'ml-3 border-l border-slate-200 dark:border-slate-700 pl-1.5 mt-0.5' : ''}`}>
        {childFolders.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          const hasChildren = folders.some(f => f.parentId === folder.id);
          const isSelected = currentFolderId === folder.id;

          return (
            <li key={folder.id}>
              <div
                className={`flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors group ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                data-folderid={folder.id}
                onClick={onSetCurrentFolderClick}
              >
                <div className="flex items-center space-x-1.5 overflow-hidden">
                  <button
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                  >
                    {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5 h-3.5 inline-block" />}
                  </button>
                  <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-sm truncate">{folder.name}</span>
                </div>
                <div className="hidden group-hover:flex items-center space-x-1 shrink-0">
                  <button data-folderid={folder.id} onClick={onAddSubFolderClick} className="p-1 text-slate-400 hover:text-blue-600"><Plus className="w-3 h-3"/></button>
                  <button data-folderid={folder.id} onClick={onEditFolderClick} className="p-1 text-slate-400 hover:text-emerald-600"><Edit2 className="w-3 h-3"/></button>
                  <button data-folderid={folder.id} onClick={onDeleteFolderClick} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
              {isExpanded && renderFolderTree(folder.id, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  }, [folders, expandedFolders, currentFolderId, toggleFolder, removeFolder]);

  const [searchQuery, setSearchQuery] = useState('');

  const getBreadcrumbs = useCallback(() => {
    const crumbs = [];
    let current = folders.find(f => f.id === currentFolderId);
    while (current) {
      crumbs.unshift(current);
      current = folders.find(f => f.id === current!.parentId);
    }
    return crumbs;
  }, [folders, currentFolderId]);

  const currentDocs = useMemo(() => {
    return documents.filter(d => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (d.name || '').toLowerCase().includes(query) || (d.type || '').toLowerCase().includes(query);
      }
      return d.folderId === currentFolderId;
    });
  }, [documents, searchQuery, currentFolderId]);

  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    // Simulate printing process
    setTimeout(() => {
      setIsPrinting(false);
      setIsPrintModalOpen(false);
      
      // Create a temporary hidden iframe to trigger print dialog
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
              ${printingSet?.documentIds.map(id => {
                const doc = documents.find(d => d.id === id);
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
              }).join('')}
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
  }, [printingSet, documents, formatFileSize]);

  const onMoveDocClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const folderId = e.currentTarget.dataset.folderid || null;
    if (id) {
      handleMoveDocClick(id, folderId);
    }
  }, [handleMoveDocClick]);

  const onDownloadDocClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const url = e.currentTarget.dataset.url;
    const name = e.currentTarget.dataset.name;
    if (url && name) {
      handleDownloadDocClick(url, name);
    }
  }, [handleDownloadDocClick]);

  const onDeleteDocClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleDeleteDocClick(id);
    }
  }, [handleDeleteDocClick]);

  const onEditSetClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const set = documentSets.find(s => s.id === id);
    if (set) {
      handleEditSetClick(set);
    }
  }, [documentSets, handleEditSetClick]);

  const onDeleteSetClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleDeleteSetClick(id);
    }
  }, [handleDeleteSetClick]);

  const onPrintSetClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const set = documentSets.find(s => s.id === id);
    if (set) {
      handlePrintSetClick(set);
    }
  }, [documentSets, handlePrintSetClick]);

  const onSetColorClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const color = e.currentTarget.dataset.color === 'true';
    if (id) {
      setPrintSettings(prev => ({...prev, [id]: {...(prev[id] || { duplex: false, copies: 1 }), color}}));
    }
  }, []);

  const onSetDuplexClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const duplex = e.currentTarget.dataset.duplex === 'true';
    if (id) {
      setPrintSettings(prev => ({...prev, [id]: {...(prev[id] || { color: false, copies: 1 }), duplex}}));
    }
  }, []);

  const onSetCopiesClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    if (id && action) {
      setPrintSettings(prev => {
        const currentSettings = prev[id] || { duplex: false, color: false, copies: 1 };
        const newCopies = action === 'inc' ? currentSettings.copies + 1 : Math.max(1, currentSettings.copies - 1);
        return {...prev, [id]: {...currentSettings, copies: newCopies}};
      });
    }
  }, []);

  const onTargetFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId !== undefined) {
      setTargetFolderId(folderId === 'null' ? null : folderId);
    }
  }, []);

  const onDocToggleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const docId = e.currentTarget.dataset.docid;
    if (docId) {
      handleDocToggle(docId, e.target.checked);
    }
  }, [handleDocToggle]);

  const onBreadcrumbClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const folderId = e.currentTarget.dataset.folderid;
    if (folderId === 'null') {
      setCurrentFolderId(null);
    } else if (folderId) {
      setCurrentFolderId(folderId);
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
              <input 
                type="file" 
                multiple 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform text-sm font-medium shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                上传文件
              </button>
            </>
          ) : (
            <button
              onClick={handleCreateSetClick}
              className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建套件
            </button>
          )}
        </div>
      </div>

      {activeTab === 'files' && (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-12rem)] min-h-[500px]">
          {/* Sidebar: Folders */}
          <div className="w-full md:w-64 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col overflow-hidden shrink-0">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center">
                <FolderOpen className="w-4 h-4 mr-2 text-slate-400" />
                文件夹
              </span>
              <button 
                onClick={handleCreateRootFolderClick} 
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-md transition-colors"
                title="新建根目录文件夹"
              >
                <FolderPlus className="w-4 h-4"/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div
                className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors ${currentFolderId === null ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onClick={() => setCurrentFolderId(null)}
              >
                <div className="w-3.5 h-3.5 mr-1.5" />
                <FolderOpen className={`w-4 h-4 mr-1.5 shrink-0 ${currentFolderId === null ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-sm font-medium">全部文件 (根目录)</span>
              </div>
              <div className="pt-1">
                {renderFolderTree(null)}
              </div>
            </div>
          </div>

          {/* Main Content: Files */}
          <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:justify-between sm:items-center bg-slate-50/50 dark:bg-slate-800/50 gap-4">
              <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                <button data-folderid="null" onClick={onBreadcrumbClick} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">根目录</button>
                {getBreadcrumbs().map(crumb => (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight className="w-4 h-4 mx-1" />
                    <button data-folderid={crumb.id} onClick={onBreadcrumbClick} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[100px] sm:max-w-[200px]">{crumb.name}</button>
                  </React.Fragment>
                ))}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索文件名称或类型..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200 w-full sm:w-64 transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {currentDocs.length === 0 ? (
                <div className="text-center py-16">
                  {searchQuery ? (
                    <>
                      <Search className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                      <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">未找到匹配的文件</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">请尝试更换搜索词</p>
                    </>
                  ) : (
                    <>
                      <File className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                      <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">当前文件夹为空</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">点击右上角上传文件到此文件夹</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">文件名称</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">大小</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">上传时间</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {isLoading ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col items-center justify-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                              <p>加载中...</p>
                            </div>
                          </td>
                        </tr>
                      ) : currentDocs.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                                {getFileIcon(doc.type)}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-200">{doc.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{doc.type.toUpperCase()}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            {formatFileSize(doc.size)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            {doc.uploadedAt}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              data-id={doc.id}
                              data-folderid={doc.folderId || ''}
                              onClick={onMoveDocClick}
                              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mr-4"
                            >
                              移动
                            </button>
                            <button 
                              data-url={doc.url}
                              data-name={doc.name}
                              onClick={onDownloadDocClick}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                            >
                              下载
                            </button>
                            <button 
                              data-id={doc.id}
                              onClick={onDeleteDocClick}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sets' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-16 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-slate-500 dark:text-slate-400">加载中...</p>
              </div>
            </div>
          ) : documentSets.length === 0 ? (
            <div className="col-span-full text-center py-16 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl border-dashed">
              <Folder className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">暂无文件套件</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-6">点击右上角新建套件，将常用文件组合在一起</p>
              <button
                onClick={handleCreateSetClick}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                立即创建
              </button>
            </div>
          ) : (
            documentSets.map(set => (
              <div key={set.id} className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                <div className="p-5 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{set.name}</h3>
                    <div className="flex space-x-1">
                      <button 
                        data-id={set.id}
                        onClick={onEditSetClick}
                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                        title="编辑套件"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        data-id={set.id}
                        onClick={onDeleteSetClick}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                        title="删除套件"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[40px]">{set.description}</p>
                </div>
                <div className="p-5 flex-1 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">包含文件 ({set.documentIds.length})</div>
                  <ul className="space-y-2">
                    {set.documentIds.slice(0, 3).map(id => {
                      const doc = documents.find(d => d.id === id);
                      if (!doc) return null;
                      return (
                        <li key={id} className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                          <FileText className="w-4 h-4 mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </li>
                      );
                    })}
                    {set.documentIds.length > 3 && (
                      <li className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                        ... 等共 {set.documentIds.length} 份文件
                      </li>
                    )}
                    {set.documentIds.length === 0 && (
                      <li className="text-sm text-slate-500 dark:text-slate-400 italic">未选择任何文件</li>
                    )}
                  </ul>
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <button
                    data-id={set.id}
                    onClick={onPrintSetClick}
                    disabled={set.documentIds.length === 0}
                    className="w-full flex items-center justify-center px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    一键打印套件
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Set Modal */}
      <BaseModal
        isOpen={isSetModalOpen}
        onClose={() => setIsSetModalOpen(false)}
        title={editingSet ? '编辑文件套件' : '新建文件套件'}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setIsSetModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
            <button type="submit" form="set-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">保存</button>
          </>
        }
      >
        <form id="set-form" onSubmit={handleSaveSet} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">套件名称 <span className="text-red-500">*</span></label>
            <input 
              required 
              autoFocus
              name="name"
              type="text" 
              defaultValue={editingSet?.name} 
              placeholder="如：入职文件套件"
              className="block w-full border border-zinc-200/80 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">描述说明</label>
            <textarea 
              name="description"
              rows={2}
              defaultValue={editingSet?.description} 
              placeholder="简要说明该套件的用途"
              className="block w-full border border-zinc-200/80 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm resize-none" 
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">选择包含的文件</label>
              <button 
                type="button"
                onClick={toggleAllModalFolders}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                {expandedModalFolders.size === folders.filter(f => documents.some(d => d.folderId === f.id)).length && expandedModalFolders.size > 0 ? '全部收起' : '全部展开'}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 space-y-1">
              {documents.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">暂无文件，请先在文件库上传</div>
              ) : (
                <>
                  {/* Root files */}
                  {documents.filter(d => d.folderId === null).map(doc => (
                    <label key={doc.id} className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                      <input 
                        type="checkbox" 
                        data-docid={doc.id}
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={onDocToggleChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80 rounded"
                      />
                      <FileText className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{doc.name}</span>
                    </label>
                  ))}
                  
                  {/* Folders and their files */}
                  {folders.map(folder => {
                    const folderDocs = documents.filter(d => d.folderId === folder.id);
                    if (folderDocs.length === 0) return null;
                    const isExpanded = expandedModalFolders.has(folder.id);
                    return (
                      <div key={folder.id} className="pt-2">
                        <div 
                          className="flex items-center px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                          data-folderid={folder.id}
                          onClick={onToggleModalFolderClick}
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                          <Folder className="w-3 h-3 mr-1.5" />
                          {folder.name}
                        </div>
                        {isExpanded && (
                          <div className="pl-4 space-y-1 mt-1">
                            {folderDocs.map(doc => (
                              <label key={doc.id} className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                                <input 
                                  type="checkbox" 
                                  data-docid={doc.id}
                                  checked={selectedDocIds.includes(doc.id)}
                                  onChange={onDocToggleChange}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80 rounded"
                                />
                                <FileText className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{doc.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
          
          {selectedDocIds.length > 0 && (
            <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">已选文件打印设置</label>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {selectedDocIds.map(id => {
                  const doc = documents.find(d => d.id === id);
                  if (!doc) return null;
                  const settings = printSettings[id] || { duplex: false, color: false, copies: 1 };
                  return (
                    <div key={id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 gap-2">
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1" title={doc.name}>{doc.name}</span>
                      <div className="flex items-center space-x-3 shrink-0">
                        <div className="flex items-center space-x-1 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 p-0.5">
                          <button type="button" data-id={id} data-color="false" onClick={onSetColorClick} className={`px-2 py-1 text-xs rounded ${!settings.color ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>黑白</button>
                          <button type="button" data-id={id} data-color="true" onClick={onSetColorClick} className={`px-2 py-1 text-xs rounded ${settings.color ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>彩色</button>
                        </div>
                        <div className="flex items-center space-x-1 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 p-0.5">
                          <button type="button" data-id={id} data-duplex="false" onClick={onSetDuplexClick} className={`px-2 py-1 text-xs rounded ${!settings.duplex ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>单面</button>
                          <button type="button" data-id={id} data-duplex="true" onClick={onSetDuplexClick} className={`px-2 py-1 text-xs rounded ${settings.duplex ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>双面</button>
                        </div>
                        <div className="flex items-center bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                          <button type="button" data-id={id} data-action="dec" onClick={onSetCopiesClick} className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">-</button>
                          <span className="text-xs w-6 text-center text-slate-700 dark:text-slate-300">{settings.copies}</span>
                          <button type="button" data-id={id} data-action="inc" onClick={onSetCopiesClick} className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </BaseModal>

      {/* Print Modal */}
      <BaseModal
        isOpen={isPrintModalOpen && !!printingSet}
        onClose={() => !isPrinting && setIsPrintModalOpen(false)}
        title={`准备打印：${printingSet?.name}`}
        size="md"
        footer={
          <>
            <button 
              type="button" 
              onClick={() => setIsPrintModalOpen(false)} 
              disabled={isPrinting}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              取消
            </button>
            <button 
              type="button" 
              onClick={handlePrint}
              disabled={isPrinting}
              className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              即将为您调用系统打印机，批量打印以下 {printingSet?.documentIds.length} 份文件：
            </p>
            <div className="mt-4 text-left bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-700">
              <ul className="space-y-2">
                {printingSet?.documentIds.map(id => {
                  const doc = documents.find(d => d.id === id);
                  if (!doc) return null;
                  const settings = printingSet.printSettings?.[id] || { duplex: false, color: false, copies: 1 };
                  return (
                    <li key={id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 gap-2">
                      <div className="flex items-center overflow-hidden">
                        <Check className="w-4 h-4 mr-2 text-emerald-500 shrink-0" />
                        <span className="truncate">{doc.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0 text-xs">
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">{settings.copies}份</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">{settings.color ? '彩色' : '黑白'}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">{settings.duplex ? '双面' : '单面'}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Folder Modal */}
      <BaseModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={editingFolder ? '重命名文件夹' : '新建文件夹'}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setIsFolderModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
            <button type="submit" form="folder-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">保存</button>
          </>
        }
      >
        <form id="folder-form" onSubmit={handleSaveFolder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">文件夹名称 <span className="text-red-500">*</span></label>
            <input 
              required 
              autoFocus
              name="name"
              type="text" 
              defaultValue={editingFolder?.name} 
              placeholder="如：人事文件"
              className="block w-full border border-zinc-200/80 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
          </div>
        </form>
      </BaseModal>

      {/* Move File Modal */}
      <BaseModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        title="移动文件"
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setIsMoveModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
            <button onClick={handleMoveFile} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">确认移动</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">选择目标文件夹</label>
            <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800/50 p-2 space-y-1">
              <label className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                <input 
                  type="radio" 
                  name="targetFolder" 
                  data-folderid="null"
                  checked={targetFolderId === null}
                  onChange={onTargetFolderChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80"
                />
                <FolderOpen className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">全部文件 (根目录)</span>
              </label>
              {folders.map(folder => (
                <label key={folder.id} className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                  <input 
                    type="radio" 
                    name="targetFolder" 
                    data-folderid={folder.id}
                    checked={targetFolderId === folder.id}
                    onChange={onTargetFolderChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-600 border-zinc-200/80"
                  />
                  <Folder className="w-4 h-4 ml-3 mr-2 text-slate-400 dark:text-slate-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{folder.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
