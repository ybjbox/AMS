/**
 * 文档管理 API：folders / documents / document-sets CRUD + 流式上传 + 真实下载链接。
 * 上传契约（对应 server/documentsRouter.ts）：
 *   POST /documents/upload?name=&folderId=&type=  —— 请求体为文件原始字节（octet-stream），
 *   服务端管道直接落盘，内存与文件大小无关；50MB 上限超限返回 413。
 */
import { http, withAuthToken } from './api';
import type { Folder, Document, DocumentSet } from '../types/document';

/** 服务端生成 id，前端只提交内容字段 */
export type FolderInput = Omit<Folder, 'id'>;
export type DocumentSetInput = Omit<DocumentSet, 'id'>;

export interface UploadOptions {
  name: string;
  folderId?: string | null;
  type?: string;
  onProgress?: (percent: number) => void;
}

export const documentApi = {
  listFolders: (): Promise<Folder[]> => http.get<Folder[]>('/folders'),
  createFolder: (input: FolderInput): Promise<Folder> => http.post<Folder>('/folders', input),
  updateFolder: (id: string, input: Partial<FolderInput>): Promise<Folder> =>
    http.put<Folder>(`/folders/${id}`, input),
  /** 服务端级联删除子文件夹 + 文档（含磁盘文件）+ 套件引用清理 */
  deleteFolder: (id: string): Promise<{ success: boolean; removedFolderIds: string[]; removedDocIds: string[] }> =>
    http.delete(`/folders/${id}`),

  listDocuments: (): Promise<Document[]> => http.get<Document[]>('/documents'),
  /** 仅支持改 name/type/folderId（移动）；内容需重新上传 */
  updateDocument: (id: string, input: Partial<Pick<Document, 'name' | 'type' | 'folderId'>>): Promise<Document> =>
    http.put<Document>(`/documents/${id}`, input),
  deleteDocument: (id: string): Promise<{ success: boolean }> => http.delete(`/documents/${id}`),

  listDocumentSets: (): Promise<DocumentSet[]> => http.get<DocumentSet[]>('/document-sets'),
  createDocumentSet: (input: DocumentSetInput): Promise<DocumentSet> =>
    http.post<DocumentSet>('/document-sets', input),
  updateDocumentSet: (id: string, input: Partial<DocumentSetInput>): Promise<DocumentSet> =>
    http.put<DocumentSet>(`/document-sets/${id}`, input),
  deleteDocumentSet: (id: string): Promise<{ success: boolean }> => http.delete(`/document-sets/${id}`),

  /**
   * 流式上传：File 作为原始 body 直传（拦截器已解包，实际得到 Document），
   * 元数据走 query string；timeout=0 覆盖默认 10s——50MB 文件本地也可能超过。
   */
  uploadDocument: (file: File, options: UploadOptions): Promise<Document> => {
    const params = new URLSearchParams({ name: options.name });
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.type) params.set('type', options.type);

    return http.post<Document>(`/documents/upload?${params.toString()}`, file, {
      timeout: 0,
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (event) => {
        if (options.onProgress && event.total) {
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  },

  /** 下载链接：/api/files/:id 仅 attachment + nosniff，需带 access_token */
  fileDownloadUrl: (doc: Pick<Document, 'id' | 'url'>): string =>
    withAuthToken(doc.url || `/api/files/${doc.id}`),
};
