import React, { useCallback } from 'react';
import { File, FileText, ImageIcon, FileArchive, Search, ChevronRight } from 'lucide-react';
import { Document } from '../../../store/documents';
import { EmptyState } from '@/components/ui/EmptyState';

interface FileListProps {
  documents: Document[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  breadcrumbs: any[];
  onBreadcrumbClick: (id: string | null) => void;
  onMoveDocClick: (id: string, folderId: string | null) => void;
  handleDownloadDocClick: (url: string, name: string) => void;
  handleDeleteDocClick: (id: string) => void;
  formatFileSize: (bytes: number) => string;
}

export function FileList({
  documents,
  isLoading,
  searchQuery,
  setSearchQuery,
  breadcrumbs,
  onBreadcrumbClick,
  onMoveDocClick,
  handleDownloadDocClick,
  handleDeleteDocClick,
  formatFileSize
}: FileListProps) {
  const getFileIcon = useCallback((type: string) => {
    if (!type) return <File className="w-8 h-8 text-slate-500" />;
    if (type.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
    if (type.includes('image')) return <ImageIcon className="w-8 h-8 text-blue-600" />;
    if (type.includes('zip') || type.includes('rar')) return <FileArchive className="w-8 h-8 text-amber-500" />;
    return <File className="w-8 h-8 text-slate-500" />;
  }, []);

  return (
    <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:justify-between sm:items-center bg-slate-50/50 dark:bg-slate-800/50 gap-4">
        <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
          <button onClick={() => onBreadcrumbClick(null)} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">根目录</button>
          {breadcrumbs.map(crumb => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-4 h-4 mx-1" />
              <button onClick={() => onBreadcrumbClick(crumb.id)} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[100px] sm:max-w-[200px]">{crumb.name}</button>
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
        {documents.length === 0 ? (
          <EmptyState
            title={searchQuery ? "未找到匹配的文件" : "当前文件夹为空"}
            description={searchQuery ? "请尝试更换搜索词" : "点击右上角上传文件到此文件夹"}
            icon={searchQuery ? Search : File}
          />
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
                ) : documents.map((doc) => (
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
                        onClick={() => onMoveDocClick(doc.id, doc.folderId || null)}
                        className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mr-4"
                      >
                        移动
                      </button>
                      <button 
                        onClick={() => handleDownloadDocClick(doc.url, doc.name)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                      >
                        下载
                      </button>
                      <button 
                        onClick={() => handleDeleteDocClick(doc.id)}
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
  );
}
