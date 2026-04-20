export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  uploadedAt: string;
  folderId: string | null;
}

export interface PrintSettings {
  duplex: boolean;
  color: boolean;
  copies: number;
}

export interface DocumentSet {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
  printSettings?: Record<string, PrintSettings>;
}
