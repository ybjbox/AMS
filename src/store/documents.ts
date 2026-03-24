import { create } from 'zustand';
import { api } from '../services/mockApi';

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

export const useDocumentStore = create<DocumentState>()((set) => ({
  folders: [],
  documents: [],
  documentSets: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [folders, documents, documentSets] = await Promise.all([
        api.fetchFolders(),
        api.fetchDocuments(),
        api.fetchDocumentSets()
      ]);
      set({ folders, documents, documentSets, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addFolder: async (folder) => {
    set({ isLoading: true, error: null });
    try {
      const newFolder = await api.createFolder(folder);
      set((state) => ({ folders: [...state.folders, newFolder], isLoading: false }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateFolder: async (id, folder) => {
    set({ isLoading: true, error: null });
    try {
      const updatedFolder = await api.updateFolder(id, folder);
      set((state) => ({
        folders: state.folders.map(f => f.id === id ? updatedFolder : f),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  removeFolder: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteFolder(id);
      set((state) => {
        const getSubFolders = (parentId: string, allFolders: Folder[]): string[] => {
          const children = allFolders.filter(f => f.parentId === parentId).map(f => f.id);
          return children.reduce((acc, childId) => [...acc, ...getSubFolders(childId, allFolders)], children);
        };
        const folderIdsToRemove = [id, ...getSubFolders(id, state.folders)];
        
        const removedDocIds = state.documents.filter(d => d.folderId !== null && folderIdsToRemove.includes(d.folderId)).map(d => d.id);

        return {
          folders: state.folders.filter(f => !folderIdsToRemove.includes(f.id)),
          documents: state.documents.filter(d => d.folderId === null || !folderIdsToRemove.includes(d.folderId)),
          documentSets: state.documentSets.map(s => ({
            ...s,
            documentIds: s.documentIds.filter(did => !removedDocIds.includes(did))
          })),
          isLoading: false
        };
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addDocument: async (doc) => {
    set({ isLoading: true, error: null });
    try {
      const newDoc = await api.createDocument(doc);
      set((state) => ({ documents: [...state.documents, newDoc], isLoading: false }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateDocument: async (id, doc) => {
    set({ isLoading: true, error: null });
    try {
      const updatedDoc = await api.updateDocument(id, doc);
      set((state) => ({
        documents: state.documents.map(d => d.id === id ? updatedDoc : d),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  removeDocument: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteDocument(id);
      set((state) => ({ 
        documents: state.documents.filter(d => d.id !== id),
        documentSets: state.documentSets.map(s => ({ ...s, documentIds: s.documentIds.filter(did => did !== id) })),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addDocumentSet: async (docSet) => {
    set({ isLoading: true, error: null });
    try {
      const newSet = await api.createDocumentSet(docSet);
      set((state) => ({ documentSets: [...state.documentSets, newSet], isLoading: false }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateDocumentSet: async (id, docSet) => {
    set({ isLoading: true, error: null });
    try {
      const updatedSet = await api.updateDocumentSet(id, docSet);
      set((state) => ({
        documentSets: state.documentSets.map(s => s.id === id ? updatedSet : s),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  removeDocumentSet: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteDocumentSet(id);
      set((state) => ({ 
        documentSets: state.documentSets.filter(s => s.id !== id),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
}));
