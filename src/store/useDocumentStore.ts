import { create } from 'zustand';
import { documentApi, type FolderInput, type DocumentSetInput } from '../services/documentApi';
import { Folder, Document, DocumentSet } from '../types/document';
import { createAsyncAction } from './utils';

export type { Folder, Document, DocumentSet };

interface DocumentState {
  folders: Folder[];
  documents: Document[];
  documentSets: DocumentSet[];
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<void>;

  addFolder: (input: FolderInput) => Promise<void>;
  updateFolder: (id: string, folder: Partial<Folder>) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  uploadDocument: (file: File, folderId: string | null) => Promise<void>;
  updateDocument: (id: string, doc: Partial<Document>) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;

  addDocumentSet: (input: DocumentSetInput) => Promise<void>;
  updateDocumentSet: (id: string, set: Partial<DocumentSet>) => Promise<void>;
  removeDocumentSet: (id: string) => Promise<void>;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  folders: [],
  documents: [],
  documentSets: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    return createAsyncAction(set, async () => {
      const [folders, documents, documentSets] = await Promise.all([
        documentApi.listFolders(),
        documentApi.listDocuments(),
        documentApi.listDocumentSets(),
      ]);
      return { folders, documents, documentSets };
    });
  },

  addFolder: async (input) => {
    return createAsyncAction(set, async () => {
      const newFolder = await documentApi.createFolder(input);
      return { folders: [...get().folders, newFolder] };
    });
  },

  updateFolder: async (id, folder) => {
    return createAsyncAction(set, async () => {
      const updatedFolder = await documentApi.updateFolder(id, folder);
      return {
        folders: get().folders.map((f) => (f.id === id ? updatedFolder : f)),
      };
    });
  },

  removeFolder: async (id) => {
    return createAsyncAction(set, async () => {
      await documentApi.deleteFolder(id);
      // 服务端级联删除子文件夹、其下文档（含磁盘文件）并清理套件引用，
      // 影响面跨三张表，删除后整体重新拉取，避免客户端模拟级联与服务端漂移。
      const [folders, documents, documentSets] = await Promise.all([
        documentApi.listFolders(),
        documentApi.listDocuments(),
        documentApi.listDocumentSets(),
      ]);
      return { folders, documents, documentSets };
    });
  },

  uploadDocument: async (file, folderId) => {
    return createAsyncAction(set, async () => {
      const newDoc = await documentApi.uploadDocument(file, {
        name: file.name,
        folderId,
      });
      return { documents: [...get().documents, newDoc] };
    });
  },

  updateDocument: async (id, doc) => {
    return createAsyncAction(set, async () => {
      const updatedDoc = await documentApi.updateDocument(id, doc);
      return {
        documents: get().documents.map((d) => (d.id === id ? updatedDoc : d)),
      };
    });
  },

  removeDocument: async (id) => {
    return createAsyncAction(set, async () => {
      await documentApi.deleteDocument(id);
      return {
        documents: get().documents.filter((d) => d.id !== id),
        documentSets: get().documentSets.map((s) => ({ ...s, documentIds: s.documentIds.filter((did) => did !== id) })),
      };
    });
  },

  addDocumentSet: async (input) => {
    return createAsyncAction(set, async () => {
      const newSet = await documentApi.createDocumentSet(input);
      return { documentSets: [...get().documentSets, newSet] };
    });
  },

  updateDocumentSet: async (id, docSet) => {
    return createAsyncAction(set, async () => {
      const updatedSet = await documentApi.updateDocumentSet(id, docSet);
      return {
        documentSets: get().documentSets.map((s) => (s.id === id ? updatedSet : s)),
      };
    });
  },

  removeDocumentSet: async (id) => {
    return createAsyncAction(set, async () => {
      await documentApi.deleteDocumentSet(id);
      return {
        documentSets: get().documentSets.filter((s) => s.id !== id),
      };
    });
  },
}));
