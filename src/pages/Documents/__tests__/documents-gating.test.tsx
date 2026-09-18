import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { usePermissionsStore } from '@/store/permissions';
import { Document } from '@/store/useDocumentStore';
import { FileList } from '../components/FileList';
import { FolderTree } from '../components/FolderTree';

const doc: Document = {
  id: 'doc-1',
  name: '劳动合同模板.pdf',
  type: 'pdf',
  size: 1024,
  url: '/api/files/doc-1',
  uploadedAt: '2026-09-18',
  folderId: null,
} as Document;

function seed(role: string, perms: Record<string, string[]>, strict = true) {
  useAppSettings.setState({ enableStrictPermission: strict });
  useUserStore.setState({ userInfo: { role } as never });
  usePermissionsStore.setState({ permissions: perms as never });
}

const noop = vi.fn();

function renderFileList() {
  return render(
    <FileList
      documents={[doc]}
      isLoading={false}
      searchQuery=""
      setSearchQuery={noop}
      breadcrumbs={[{ id: null, name: '全部文件' }]}
      onBreadcrumbClick={noop}
      onMoveDocClick={noop}
      handleDeleteDocClick={noop}
    />
  );
}

describe('文档页写操作按钮门控（documents:manage）', () => {
  it('EMPLOYEE 无 documents:manage：移动/删除隐藏，下载保留', () => {
    seed('employee', { EMPLOYEE: ['documents:view'] });
    renderFileList();
    expect(screen.queryByText('移动')).toBeNull();
    expect(screen.queryByText('删除')).toBeNull();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('HR 有 documents:manage：移动/删除可见', () => {
    seed('hr', { HR: ['documents:view', 'documents:manage'] });
    renderFileList();
    expect(screen.getByText('移动')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('无权限时文件夹树不出现新建/编辑/删除入口', () => {
    seed('employee', { EMPLOYEE: ['documents:view'] });
    render(
      <FolderTree
        folders={[]}
        currentFolderId={null}
        expandedFolders={new Set()}
        toggleFolder={noop}
        onSetCurrentFolderClick={noop}
        onAddSubFolderClick={noop}
        onEditFolderClick={noop}
        onDeleteFolderClick={noop}
        handleCreateRootFolderClick={noop}
      />
    );
    expect(screen.queryByTitle('新建根目录文件夹')).toBeNull();
  });

  it('严格权限关闭时保持全量可见（kill-switch 行为不变）', () => {
    seed('employee', { EMPLOYEE: [] }, false);
    renderFileList();
    expect(screen.getByText('移动')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });
});
