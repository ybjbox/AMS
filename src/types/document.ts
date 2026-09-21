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

/** 服务端 GET /documents/:id/print-part 的打印片段（对应 server/documentPrint.ts） */
export type PrintPart =
  | { documentId: string; name: string; kind: 'text'; text: string; truncated: boolean }
  | {
      documentId: string;
      name: string;
      kind: 'table';
      sheets: { name: string; rows: string[][] }[];
      truncated: boolean;
    }
  | {
      documentId: string;
      name: string;
      kind: 'pages';
      pages: string[];
      truncated: boolean;
      note?: string;
    }
  | { documentId: string; name: string; kind: 'unsupported'; note: string };

export interface DocumentSet {
  id: string;
  name: string;
  description: string;
  documentIds: string[];
  printSettings?: Record<string, PrintSettings>;
}
