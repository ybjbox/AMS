import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useUserStore } from '@/store/useUserStore';
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

/**
 * 门控的输入形状 = 服务端下发的 userInfo.permissions（见 server/capabilities.ts）。
 * 这里刻意只喂这一份数据：本地偏好开关与 localStorage 权限矩阵都已删除，
 * 若哪天有人再把显隐接到别的数据源上，本文件会用"同样输入不同结果"暴露出来。
 */
function seed(role: string, permissions: string[]) {
  useUserStore.setState({ userInfo: { role, username: role.toLowerCase(), permissions } as never, token: 't' });
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

afterEach(() => useUserStore.setState({ userInfo: null, token: null } as never));

describe('文档页写操作按钮门控（documents:manage）', () => {
  it('下发列表里没有 documents:manage：移动/删除隐藏，下载保留', () => {
    seed('EMPLOYEE', ['documents:view']);
    renderFileList();
    expect(screen.queryByText('移动')).toBeNull();
    expect(screen.queryByText('删除')).toBeNull();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });

  it('下发列表含 documents:manage：移动/删除可见', () => {
    seed('HR', ['documents:view', 'documents:manage']);
    renderFileList();
    expect(screen.getByText('移动')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('无权限时文件夹树不出现新建/编辑/删除入口', () => {
    seed('EMPLOYEE', ['documents:view']);
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

  it('角色字符串本身不再决定显隐——只有下发列表算数', () => {
    // 旧实现会拿 userInfo.role 去查本地矩阵；改成同源下发后，谎报角色换不来任何入口
    seed('ADMIN', ['documents:view']);
    renderFileList();
    expect(screen.queryByText('移动')).toBeNull();
    expect(screen.getByText('下载')).toBeInTheDocument();
  });
});
