import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { useDocumentStore, Document, DocumentSet, Folder as FolderType } from '@/store/useDocumentStore';

export function useDocumentActions() {
  const confirm = useConfirm();
  const folders = useDocumentStore((state) => state.folders);
  const documents = useDocumentStore((state) => state.documents);
  const addFolder = useDocumentStore((state) => state.addFolder);
  const updateFolder = useDocumentStore((state) => state.updateFolder);
  const removeFolder = useDocumentStore((state) => state.removeFolder);
  const addDocument = useDocumentStore((state) => state.addDocument);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const removeDocument = useDocumentStore((state) => state.removeDocument);
  const addDocumentSet = useDocumentStore((state) => state.addDocumentSet);
  const updateDocumentSet = useDocumentStore((state) => state.updateDocumentSet);
  const removeDocumentSet = useDocumentStore((state) => state.removeDocumentSet);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [folderParentId, setFolderParentId] = useState<string | null>(null);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<DocumentSet | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printingSet, setPrintingSet] = useState<DocumentSet | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [expandedModalFolders, setExpandedModalFolders] = useState<Set<string>>(new Set());

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [printSettings, setPrintSettings] = useState<
    Record<string, { duplex: boolean; color: boolean; copies: number }>
  >({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAllModalFolders = useCallback(() => {
    const foldersWithDocs = folders.filter((f) => documents.some((d) => d.folderId === f.id));
    if (expandedModalFolders.size === foldersWithDocs.length) {
      setExpandedModalFolders(new Set());
    } else {
      setExpandedModalFolders(new Set(foldersWithDocs.map((f) => f.id)));
    }
  }, [folders, documents, expandedModalFolders.size]);

  const toggleModalFolder = useCallback((id: string) => {
    setExpandedModalFolders((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const handleDocToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const docId = e.target.value;
    const checked = e.target.checked;
    if (checked) {
      setSelectedDocIds((prev) => [...prev, docId]);
      setPrintSettings((prev) => ({ ...prev, [docId]: { duplex: false, color: false, copies: 1 } }));
    } else {
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      setPrintSettings((prev) => {
        const newSettings = { ...prev };
        delete newSettings[docId];
        return newSettings;
      });
    }
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setTimeout(() => {
        Array.from(files).forEach((file: File) => {
          const newDoc: Document = {
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            name: file.name,
            type: file.type || file.name.split('.').pop() || 'unknown',
            url: 'https://picsum.photos/seed/document/800/600',
            size: file.size,
            uploadedAt: new Date().toISOString().split('T')[0],
            folderId: currentFolderId,
          };
          addDocument(newDoc);
        });

        toast.success(`成功上传 ${files.length} 个文件 (Mock)`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 500);
    },
    [addDocument, currentFolderId]
  );

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

  const handleEditSetClick = useCallback((set: DocumentSet) => {
    setEditingSet(set);
    setSelectedDocIds(set.documentIds);
    setPrintSettings(set.printSettings || {});
    setIsSetModalOpen(true);
  }, []);

  const handleDeleteSetClick = useCallback(
    async (setId: string) => {
      if (await confirm({ title: '确定要删除该套件吗？', description: '此操作不可恢复。', variant: 'danger' })) {
        removeDocumentSet(setId);
      }
    },
    [removeDocumentSet, confirm]
  );

  const handlePrintSetClick = useCallback((set: DocumentSet) => {
    setPrintingSet(set);
    setIsPrintModalOpen(true);
  }, []);

  const handleSaveSet = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
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
          printSettings,
        });
      }
      setIsSetModalOpen(false);
      setEditingSet(null);
    },
    [editingSet, selectedDocIds, printSettings, updateDocumentSet, addDocumentSet]
  );

  const handleSaveFolder = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;

      if (editingFolder) {
        updateFolder(editingFolder.id, { name });
      } else {
        addFolder({
          id: Date.now().toString(),
          name,
          parentId: folderParentId,
        });
        if (folderParentId) {
          setExpandedFolders((prev) => new Set(prev).add(folderParentId));
        }
      }
      setIsFolderModalOpen(false);
    },
    [editingFolder, folderParentId, updateFolder, addFolder]
  );

  const handleMoveFile = useCallback(() => {
    if (movingDocId) {
      updateDocument(movingDocId, { folderId: targetFolderId });
    }
    setIsMoveModalOpen(false);
  }, [movingDocId, targetFolderId, updateDocument]);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const onSetCurrentFolderClick = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const onAddSubFolderClick = useCallback((folderId: string) => {
    setEditingFolder(null);
    setFolderParentId(folderId);
    setIsFolderModalOpen(true);
  }, []);

  const onEditFolderClick = useCallback(
    (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (folder) {
        setEditingFolder(folder);
        setIsFolderModalOpen(true);
      }
    },
    [folders]
  );

  const onDeleteFolderClick = useCallback(
    async (folderId: string) => {
      if (
        await confirm({
          title: '确定要删除该文件夹吗？',
          description: '其包含的子文件夹和文件也将被删除。',
          variant: 'danger',
        })
      ) {
        removeFolder(folderId);
      }
    },
    [removeFolder, confirm]
  );

  const handleDeleteDocClick = useCallback(
    async (docId: string) => {
      if (
        await confirm({
          title: '确定要删除该文件吗？',
          description: '删除后包含该文件的套件也将受影响。',
          variant: 'danger',
        })
      ) {
        removeDocument(docId);
      }
    },
    [removeDocument, confirm]
  );

  const onSetColorClick = useCallback((id: string, color: boolean) => {
    setPrintSettings((prev) => ({ ...prev, [id]: { ...(prev[id] || { duplex: false, copies: 1 }), color } }));
  }, []);

  const onSetDuplexClick = useCallback((id: string, duplex: boolean) => {
    setPrintSettings((prev) => ({ ...prev, [id]: { ...(prev[id] || { color: false, copies: 1 }), duplex } }));
  }, []);

  const onSetCopiesClick = useCallback((id: string, action: 'inc' | 'dec') => {
    setPrintSettings((prev) => {
      const currentSettings = prev[id] || { duplex: false, color: false, copies: 1 };
      const newCopies = action === 'inc' ? currentSettings.copies + 1 : Math.max(1, currentSettings.copies - 1);
      return { ...prev, [id]: { ...currentSettings, copies: newCopies } };
    });
  }, []);

  const onTargetFolderChange = useCallback((folderId: string | null) => {
    setTargetFolderId(folderId);
  }, []);

  return {
    currentFolderId,
    setCurrentFolderId,
    expandedFolders,
    setExpandedFolders,
    isFolderModalOpen,
    setIsFolderModalOpen,
    editingFolder,
    setEditingFolder,
    folderParentId,
    setFolderParentId,
    isMoveModalOpen,
    setIsMoveModalOpen,
    movingDocId,
    setMovingDocId,
    targetFolderId,
    setTargetFolderId,
    isSetModalOpen,
    setIsSetModalOpen,
    editingSet,
    setEditingSet,
    isPrintModalOpen,
    setIsPrintModalOpen,
    printingSet,
    setPrintingSet,
    isPrinting,
    setIsPrinting,
    expandedModalFolders,
    setExpandedModalFolders,
    selectedDocIds,
    setSelectedDocIds,
    printSettings,
    setPrintSettings,
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
  };
}
