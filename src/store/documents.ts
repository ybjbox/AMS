import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type Document = {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  uploadedAt: string;
  folderId: string | null;
};

export type PrintSettings = {
  duplex: boolean;
  color: boolean;
  copies: number;
};

export type DocumentSet = {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
  printSettings?: Record<string, PrintSettings>;
};

interface DocumentState {
  folders: Folder[];
  documents: Document[];
  documentSets: DocumentSet[];
  addFolder: (folder: Folder) => void;
  updateFolder: (id: string, folder: Partial<Folder>) => void;
  removeFolder: (id: string) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, doc: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  addDocumentSet: (set: DocumentSet) => void;
  updateDocumentSet: (id: string, set: Partial<DocumentSet>) => void;
  removeDocumentSet: (id: string) => void;
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set) => ({
      folders: [
        { id: 'f1', name: '人事文件', parentId: null },
        { id: 'f2', name: '入职办理', parentId: 'f1' },
        { id: 'f3', name: '离职办理', parentId: 'f1' },
        { id: 'f4', name: '公司制度', parentId: null },
      ],
      documents: [
        { id: '1', name: '员工入职登记表.pdf', type: 'pdf', url: '#', size: 1024 * 500, uploadedAt: '2026-03-01', folderId: 'f2' },
        { id: '2', name: '保密协议.pdf', type: 'pdf', url: '#', size: 1024 * 800, uploadedAt: '2026-03-01', folderId: 'f2' },
        { id: '3', name: '员工手册.pdf', type: 'pdf', url: '#', size: 1024 * 2000, uploadedAt: '2026-03-01', folderId: 'f4' },
        { id: '4', name: '离职申请表.pdf', type: 'pdf', url: '#', size: 1024 * 300, uploadedAt: '2026-03-02', folderId: 'f3' },
        { id: '5', name: '交接清单.pdf', type: 'pdf', url: '#', size: 1024 * 400, uploadedAt: '2026-03-02', folderId: 'f3' },
      ],
      documentSets: [
        { id: 'set1', name: '入职文件套件', description: '新员工入职需要填写的全部文件', documentIds: ['1', '2', '3'] },
        { id: 'set2', name: '离职文件套件', description: '员工离职需要填写的全部文件', documentIds: ['4', '5'] },
      ],
      addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
      updateFolder: (id, folder) => set((state) => ({
        folders: state.folders.map(f => f.id === id ? { ...f, ...folder } : f)
      })),
      removeFolder: (id) => set((state) => {
        // Find all subfolders recursively to delete them and their documents
        const getSubFolders = (parentId: string, allFolders: Folder[]): string[] => {
          const children = allFolders.filter(f => f.parentId === parentId).map(f => f.id);
          return children.reduce((acc, childId) => [...acc, ...getSubFolders(childId, allFolders)], children);
        };
        const folderIdsToRemove = [id, ...getSubFolders(id, state.folders)];
        
        const remainingDocs = state.documents.filter(d => d.folderId === null || !folderIdsToRemove.includes(d.folderId));
        const removedDocIds = state.documents.filter(d => d.folderId !== null && folderIdsToRemove.includes(d.folderId)).map(d => d.id);

        return {
          folders: state.folders.filter(f => !folderIdsToRemove.includes(f.id)),
          documents: remainingDocs,
          documentSets: state.documentSets.map(s => ({
            ...s,
            documentIds: s.documentIds.filter(did => !removedDocIds.includes(did))
          }))
        };
      }),
      addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
      updateDocument: (id, doc) => set((state) => ({
        documents: state.documents.map(d => d.id === id ? { ...d, ...doc } : d)
      })),
      removeDocument: (id) => set((state) => ({ 
        documents: state.documents.filter(d => d.id !== id),
        documentSets: state.documentSets.map(s => ({ ...s, documentIds: s.documentIds.filter(did => did !== id) }))
      })),
      addDocumentSet: (docSet) => set((state) => ({ documentSets: [...state.documentSets, docSet] })),
      updateDocumentSet: (id, docSet) => set((state) => ({
        documentSets: state.documentSets.map(s => s.id === id ? { ...s, ...docSet } : s)
      })),
      removeDocumentSet: (id) => set((state) => ({ documentSets: state.documentSets.filter(s => s.id !== id) })),
    }),
    {
      name: 'document-storage',
    }
  )
);
