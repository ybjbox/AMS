import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Todos from '@/pages/Todos';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { todoApi } from '@/services/todoApi';
import { useTodoStore } from '@/store/useTodoStore';
import { MemoryRouter } from 'react-router-dom';

/**
 * 审查 M1 的待办这一路：失败只在 toast 里待了四秒，屏幕上留下的是
 * 「暂无待办事项，点击右上角添加您的第一个任务」——于是又录了一遍。
 */
vi.mock('@/services/todoApi', () => ({
  todoApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

vi.mock('@/store/useEmployeeStore', () => ({
  useEmployeeStore: (selector: (s: { users: unknown[]; fetchUsers: () => Promise<null> }) => unknown) =>
    selector({ users: [], fetchUsers: () => Promise.resolve(null) }),
}));

const list = vi.mocked(todoApi.list);

beforeEach(() => {
  useTodoStore.setState({ todos: [], loadError: null, isLoading: false });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <Todos />
      </ConfirmProvider>
    </MemoryRouter>
  );
}

describe('待办：加载失败不说成"暂无待办事项"', () => {
  it('拉取被 500 打断 → 失败态带重试，不递上"立即创建"', async () => {
    list.mockRejectedValue({ error: '服务器内部错误' });
    renderPage();
    await waitFor(() => expect(screen.getByText('待办清单加载失败')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('服务器内部错误')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText('暂无待办事项')).toBeNull();
    expect(screen.queryByText('点击右上角按钮添加您的第一个任务')).toBeNull();
  });

  it('确实没有待办时仍说"暂无待办事项"', async () => {
    list.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('暂无待办事项')).toBeInTheDocument());
    expect(screen.queryByText('待办清单加载失败')).toBeNull();
  });
});
