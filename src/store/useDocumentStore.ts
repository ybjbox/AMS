import { create } from 'zustand';
import { api } from '../services/mockApi';
import { Folder, Document, DocumentSet } from '../types';
import { createAsyncAction } from './utils';

export type { Folder, Document, DocumentSet };

interface DocumentState {
  folders: Folder[];
  documents: Document[];
  documentSets: DocumentSet[];
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<void>;

  addFolder: (folder: Folder) => Promise<void>;
  updateFolder: (id: string, folder: Partial<Folder>) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  addDocument: (doc: Document) => Promise<void>;
  updateDocument: (id: string, doc: Partial<Document>) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;

  addDocumentSet: (set: DocumentSet) => Promise<void>;
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
        api.fetchFolders(),
        api.fetchDocuments(),
        api.fetchDocumentSets(),
      ]);
      return { folders, documents, documentSets };
    });
  },

  addFolder: async (folder) => {
    return createAsyncAction(set, async () => {
      const newFolder = await api.createFolder(folder);
      return { folders: [...get().folders, newFolder] };
    });
  },

  updateFolder: async (id, folder) => {
    return createAsyncAction(set, async () => {
      const updatedFolder = await api.updateFolder(id, folder);
      return {
        folders: get().folders.map((f) => (f.id === id ? updatedFolder : f)),
      };
    });
  },

  removeFolder: async (id) => {
    return createAsyncAction(set, async () => {
      await api.deleteFolder(id);
      
      const state = get();
      const getSubFolders = (parentId: string, allFolders: Folder[]): string[] => {
        const children = allFolders.filter((f) => f.parentId === parentId).map((f) => f.id);
        return children.reduce((acc, childId) => [...acc, ...getSubFolders(childId, allFolders)], children);
      };
      const folderIdsToRemove = [id, ...getSubFolders(id, state.folders)];

      const removedDocIds = state.documents
        .filter((d) => d.folderId !== null && folderIdsToRemove.includes(d.folderId))
        .map((d) => d.id);

      return {
        folders: state.folders.filter((f) => !folderIdsToRemove.includes(f.id)),
        documents: state.documents.filter((d) => d.folderId === null || !folderIdsToRemove.includes(d.folderId)),
        documentSets: state.documentSets.map((s) => ({
          ...s,
          documentIds: s.documentIds.filter((did) => !removedDocIds.includes(did)),
        })),
      };
    });
  },

  addDocument: async (doc) => {
    return createAsyncAction(set, async () => {
      const newDoc = await api.createDocument(doc);
      return { documents: [...get().documents, newDoc] };
    });
  },

  updateDocument: async (id, doc) => {
    return createAsyncAction(set, async () => {
      const updatedDoc = await api.updateDocument(id, doc);
      return {
        documents: get().documents.map((d) => (d.id === id ? updatedDoc : d)),
      };
    });
  },

  removeDocument: async (id) => {
    return createAsyncAction(set, async () => {
      await api.deleteDocument(id);
      return {
        documents: get().documents.filter((d) => d.id !== id),
        documentSets: get().documentSets.map((s) => ({ ...s, documentIds: s.documentIds.filter((did) => did !== id) })),
      };
    });
  },

  addDocumentSet: async (docSet) => {
    return createAsyncAction(set, async () => {
      const newSet = await api.createDocumentSet(docSet);
      return { documentSets: [...get().documentSets, newSet] };
    });
  },

  updateDocumentSet: async (id, docSet) => {
    return createAsyncAction(set, async () => {
      const updatedSet = await api.updateDocumentSet(id, docSet);
      return {
        documentSets: get().documentSets.map((s) => (s.id === id ? updatedSet : s)),
      };
    });
  },

  removeDocumentSet: async (id) => {
    return createAsyncAction(set, async () => {
      await api.deleteDocumentSet(id);
      return {
        documentSets: get().documentSets.filter((s) => s.id !== id),
      };
    });
  },
}));
