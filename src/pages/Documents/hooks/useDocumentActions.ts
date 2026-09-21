import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { useDocumentStore, DocumentSet, Folder as FolderType } from '@/store/useDocumentStore';
import { documentApi } from '@/services/documentApi';
import { printInIframe } from '@/utils/printWindow';
import { buildDocumentSetPrintHtml, type PrintJobItem } from '../lib/printHtml';
import type { PrintPart } from '@/types/document';

export function useDocumentActions() {
  const confirm = useConfirm();
  const folders = useDocumentStore((state) => state.folders);
  const documents = useDocumentStore((state) => state.documents);
  const addFolder = useDocumentStore((state) => state.addFolder);
  const updateFolder = useDocumentStore((state) => state.updateFolder);
  const removeFolder = useDocumentStore((state) => state.removeFolder);
  const uploadDocument = useDocumentStore((state) => state.uploadDocument);
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

  // store 的 createAsyncAction 吞掉 rejection（写入 state.error 后 resolve），
  // 且每次动作开始都会把 error 清空，因此 await 之后读到的 error 就是本次动作的结果。
  const lastActionError = useCallback(() => useDocumentStore.getState().error, []);

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

  const handleDocToggle = useCallback((docId: string, checked: boolean) => {
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

  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const list = Array.from(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setIsUploading(true);
      let succeeded = 0;
      let firstError: string | null = null;
      for (const file of list) {
        await uploadDocument(file, currentFolderId);
        const error = lastActionError();
        if (error) {
          firstError = firstError ?? `${file.name}：${error}`;
        } else {
          succeeded += 1;
        }
      }
      setIsUploading(false);

      if (succeeded > 0) toast.success(`成功上传 ${succeeded} 个文件`);
      if (firstError) toast.error(`上传失败：${firstError}`);
    },
    [uploadDocument, currentFolderId, lastActionError]
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

  /**
   * 真内容打包打印：逐份向服务端要「打印片段」（文本/表格/图片页），拼成一页一份的
   * A4 版面后送进打印对话框。份数与彩色/黑白在版面里真实生效；双面只能镜像页边距，
   * 真正的双面开关仍需在打印对话框里选（浏览器无法代驱动设置）。
   */
  const handlePrintSet = useCallback(async () => {
    if (!printingSet) return;
    const ids = printingSet.documentIds;
    if (ids.length === 0) {
      toast.error('套件里没有文件');
      return;
    }
    setIsPrinting(true);
    const pendingToast = toast.loading(`正在准备 ${ids.length} 份文件的内容…`);
    try {
      const items: PrintJobItem[] = await Promise.all(
        ids.map(async (id) => {
          const doc = documents.find((d) => d.id === id);
          const settings = printingSet.printSettings?.[id] || {
            duplex: false,
            color: false,
            copies: 1,
          };
          let part: PrintPart | null;
          try {
            part = await documentApi.getPrintPart(id);
          } catch {
            part = null;
          }
          return { documentId: id, name: doc?.name || id, settings, part };
        })
      );
      toast.dismiss(pendingToast);

      const printable = items.filter((i) => i.part && i.part.kind !== 'unsupported').length;
      if (printable === 0) {
        const reason =
          items.map((i) => (i.part?.kind === 'unsupported' ? i.part.note : null)).find(Boolean) ||
          '文件内容读取失败';
        toast.error(`没有可打印的内容：${reason}`);
        return;
      }

      const html = buildDocumentSetPrintHtml(
        printingSet,
        items,
        new Date().toLocaleString('zh-CN', { hour12: false })
      );
      await printInIframe(html);
      setIsPrintModalOpen(false);
      if (printable < items.length) {
        toast.message(`${printable}/${items.length} 份已输出正文，其余在打印页上标注了原因`);
      } else {
        toast.success('已送往打印对话框');
      }
    } finally {
      setIsPrinting(false);
    }
  }, [printingSet, documents, setIsPrintModalOpen]);

  const handleSaveSet = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const name = formData.get('name') as string;
      const description = formData.get('description') as string;

      if (editingSet) {
        updateDocumentSet(editingSet.id, { name, description, documentIds: selectedDocIds, printSettings });
      } else {
        // id 由服务端生成（uuid），前端不再自造
        addDocumentSet({ name, description, documentIds: selectedDocIds, printSettings });
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
        // id 由服务端生成（uuid），前端不再自造
        addFolder({ name, parentId: folderParentId });
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
  };
}
