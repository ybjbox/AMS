import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Approvals from '@/pages/Approvals';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { useUserStore } from '@/store/useUserStore';
import { approvalApi, type Approval } from '@/services/approvalApi';

/**
 * 审查 M1 的审批这一路：三个页签共用一次 refresh，任一条失败时另外几条仍是空数组，
 * 屏幕上留下的是「暂无申请记录，在左侧提交你的第一条申请」。申请没提交成功还是服务没答话，
 * 用户看这两个文案分不出来。
 */
vi.mock('@/services/approvalApi', () => ({
  approvalApi: {
    listMine: vi.fn(),
    listPending: vi.fn(),
    listAll: vi.fn(),
    compBalance: vi.fn(),
    create: vi.fn(),
    withdraw: vi.fn(),
    decide: vi.fn(),
  },
}));

const listMine = vi.mocked(approvalApi.listMine);
const compBalance = vi.mocked(approvalApi.compBalance);

const item: Approval = {
  id: 'ap-1',
  applicant: '张三',
  type: 'leave',
  leaveType: '事假',
  startDate: '2026-09-10',
  endDate: null,
  reason: '家中有事',
  status: 'pending',
  approver: null,
  comment: '',
  createdAt: '2026-09-08T01:00:00.000Z',
  decidedAt: null,
  punchDate: '',
  punchTime: '',
  punchKind: '上班卡',
  requiredRole: 'HR',
  hours: 0,
};

beforeEach(() => {
  useUserStore.setState({
    userInfo: { role: 'EMPLOYEE', username: 'zhangsan', permissions: ['approvals:view'] } as never,
    token: 't',
  });
  compBalance.mockResolvedValue({ total: 0, used: 0 } as never);
  listMine.mockResolvedValue([]);
});

function renderPage() {
  return render(
    <ConfirmProvider>
      <Approvals />
    </ConfirmProvider>
  );
}

describe('审批：加载失败不说成"暂无申请记录"', () => {
  it('拉取被 500 打断 → 失败态带重试，空态文案与"去提交第一条"都不留', async () => {
    listMine.mockRejectedValue({ error: '服务器内部错误' });
    renderPage();
    await waitFor(() => expect(screen.getByText('我的申请加载失败')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('服务器内部错误')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText('暂无申请记录')).toBeNull();
    expect(screen.queryByText('在左侧提交你的第一条申请')).toBeNull();
  });

  it('列表里有申请时不退成失败态（余额那条挂了也不该盖掉真数据）', async () => {
    listMine.mockResolvedValue([item]);
    compBalance.mockRejectedValue({ error: '额度加载失败' });
    renderPage();
    await waitFor(() => expect(screen.getByText(/家中有事/)).toBeInTheDocument());
    expect(screen.queryByText('我的申请加载失败')).toBeNull();
  });

  it('确实没有申请时仍说"暂无申请记录"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('暂无申请记录')).toBeInTheDocument());
    expect(screen.queryByText('我的申请加载失败')).toBeNull();
  });
});
