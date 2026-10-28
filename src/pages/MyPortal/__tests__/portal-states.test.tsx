import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyPortal from '@/pages/MyPortal';
import { myApi, type MySummary } from '@/services/myApi';
import { announcementApi } from '@/services/announcementApi';
import { useUserStore } from '@/store/useUserStore';
import { MemoryRouter } from 'react-router-dom';
import { writeSummaryCache } from '@/pages/MyPortal/summaryCache';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/services/myApi', () => ({ myApi: { summary: vi.fn(), disputes: vi.fn() } }));
vi.mock('@/services/approvalApi', () => ({ approvalApi: { create: vi.fn() } }));
vi.mock('@/services/announcementApi', () => ({ announcementApi: { list: vi.fn() } }));

const summaryApi = vi.mocked(myApi.summary);
const disputesApi = vi.mocked(myApi.disputes);
const noticesApi = vi.mocked(announcementApi.list);

const month = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const summary = (): MySummary => ({
  month,
  employeeId: 'EMP0027',
  coverage: { latestDate: '2026-10-24', month, coveredDays: 24, elapsedDays: 25, uncoveredDays: 1 },
  verdicts: [
    { date: '2026-10-03', verdict: '迟到', why: '你 08:21 打的上班卡。', flag: '', isLeave: false, noRule: false, hasIssue: true },
  ],
  anomalies: [
    {
      id: 'a1',
      date: '2026-10-03',
      type: 'LATE_15',
      description: '迟到 21 分钟',
      minutes: 21,
      suggestedTime: '08:21',
    },
  ],
  counts: { late: 1, missing: 0 },
});

beforeEach(() => {
  localStorage.clear();
  summaryApi.mockReset();
  disputesApi.mockReset();
  noticesApi.mockReset();
  summaryApi.mockResolvedValue(summary());
  disputesApi.mockResolvedValue([]);
  noticesApi.mockResolvedValue([]);
  useUserStore.setState({
    userInfo: {
      id: 'u1',
      username: 'hebing',
      displayName: '何斌',
      email: '',
      role: 'EMPLOYEE',
      permissions: ['approvals:view', 'settings:view', 'todos:view'],
    },
    token: 't',
  });
});

/** jsdom 不加载 Tailwind，桌面/移动两套导航都会命中；固定点第一套 */
async function goTab(name: RegExp) {
  const navs = await screen.findAllByRole('navigation', { name: '员工门户导航' });
  fireEvent.click(within(navs[0]).getByRole('button', { name }));
}

describe('员工门户状态细节（qa-2 / qa-4 / qa-5 / qa-7 / qa-18）', () => {
  it('首屏加载用骨架，不是一行“加载中”文字', async () => {
    summaryApi.mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter><MyPortal /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeTruthy());
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('迟到预填原卡时间，且输入框走品牌焦点环', async () => {
    render(<MemoryRouter><MyPortal /></MemoryRouter>);
    await goTab(/^异常/);
    fireEvent.click(await screen.findByRole('button', { name: '对此提异议' }));

    const time = screen.getByLabelText('打卡时间');
    expect(time).toHaveValue('08:21');
    expect(time.className).toContain('focus-visible:border-brand-600');
  });

  it('同一天已有待审补卡：不再给「对此提异议」', async () => {
    disputesApi.mockResolvedValue([
      {
        id: 'd1',
        applicant: 'hebing',
        type: 'makeup',
        leaveType: '补卡',
        startDate: '2026-10-03',
        endDate: null,
        reason: '那天打卡了',
        status: 'pending',
        approver: null,
        comment: '',
        createdAt: '2026-10-04 09:00:00',
        decidedAt: null,
        punchDate: '2026-10-03',
        punchTime: '08:21',
        punchKind: '上班卡',
        requiredRole: 'HR',
        hours: 0,
        recomputeOk: null,
        recomputeError: '',
        recomputedAt: null,
      },
    ]);
    render(<MemoryRouter><MyPortal /></MemoryRouter>);
    await goTab(/^异常/);

    expect(await screen.findByText('已提交，等 HR 处理。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '对此提异议' })).not.toBeInTheDocument();
  });

  it('断网时显示上次成功结果并标注离线', async () => {
    writeSummaryCache('hebing', month, summary());
    summaryApi.mockRejectedValue({ isAxiosError: true });
    render(<MemoryRouter><MyPortal /></MemoryRouter>);

    expect(await screen.findByText(/当前离线，显示的是上次加载的结果/)).toBeInTheDocument();
    await goTab(/^异常/);
    expect(screen.getByText('迟到 21 分钟')).toBeInTheDocument();
  });

  it('补卡通过后显示结论已更新', async () => {
    disputesApi.mockResolvedValue([
      {
        id: 'd2',
        applicant: 'hebing',
        type: 'makeup',
        leaveType: '补卡',
        startDate: '2026-10-03',
        endDate: null,
        reason: '那天打卡了',
        status: 'approved',
        approver: 'admin',
        comment: '',
        createdAt: '2026-10-04 09:00:00',
        decidedAt: '2026-10-04 10:00:00',
        punchDate: '2026-10-03',
        punchTime: '08:21',
        punchKind: '上班卡',
        requiredRole: 'HR',
        hours: 0,
        recomputeOk: 1,
        recomputeError: '',
        recomputedAt: '2026-10-04 10:00:01',
      },
    ]);
    render(<MemoryRouter><MyPortal /></MemoryRouter>);
    await goTab(/^我的/);
    expect(await screen.findByText('补卡已通过，结论已更新。')).toBeInTheDocument();
  });

  it('重算失败时如实说结论还没更新', async () => {
    disputesApi.mockResolvedValue([
      {
        id: 'd3',
        applicant: 'hebing',
        type: 'makeup',
        leaveType: '补卡',
        startDate: '2026-10-03',
        endDate: null,
        reason: '那天打卡了',
        status: 'approved',
        approver: 'admin',
        comment: '',
        createdAt: '2026-10-04 09:00:00',
        decidedAt: '2026-10-04 10:00:00',
        punchDate: '2026-10-03',
        punchTime: '08:21',
        punchKind: '上班卡',
        requiredRole: 'HR',
        hours: 0,
        recomputeOk: 0,
        recomputeError: '分析超时',
        recomputedAt: '2026-10-04 10:00:01',
      },
    ]);
    render(<MemoryRouter><MyPortal /></MemoryRouter>);
    await goTab(/^我的/);
    expect(await screen.findByText('补卡已通过，但结论还没更新；HR 会再核对一次。')).toBeInTheDocument();
  });
});
