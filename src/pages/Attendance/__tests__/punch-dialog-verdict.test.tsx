import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmProvider } from '@/hooks/useConfirm';
import EmployeePunchDialog from '@/pages/Attendance/components/EmployeePunchDialog';
import { attendanceApi, type DayVerdict } from '@/services/attendanceApi';
import { useAttendanceStore } from '@/store/useAttendanceStore';
import type { PunchRecord } from '@/store/useAttendanceStore';

/**
 * 钉住「判定上屏」这条链：界面显示的就是服务端 `/day-verdicts` 给的那串字，
 * 前端不自己推导判定（文档 §7 的第一号坑就是各处抄一份判定）。
 * 与导出表格是否逐字相同由 `server/tests/attendance-verdicts-parity.test.ts` 管，
 * 这里只管"取回来要看得见、没取回来要说什么"。
 */
vi.mock('@/services/attendanceApi', () => ({
  attendanceApi: { fetchDayVerdicts: vi.fn() },
}));

const fetchMock = vi.mocked(attendanceApi.fetchDayVerdicts);

const records: PunchRecord[] = [
  { id: 'r1', employeeId: '1001', employeeName: '张三', date: '2026-09-05', time: '08:20:00', source: 'wecom' },
  { id: 'r2', employeeId: '1001', employeeName: '张三', date: '2026-09-05', time: '18:00:00', source: 'wecom' },
];

const verdict = (over: Partial<DayVerdict> = {}): DayVerdict => ({
  employeeId: '1001',
  employeeName: '张三',
  department: '市场部/夜班组',
  date: '2026-09-05',
  weekday: '五',
  times: ['08:20', '18:00'],
  instances: [],
  orphan: [],
  borrowed: [],
  isLeave: false,
  noRule: false,
  verdict: '迟到(>15分)',
  why: '常规班次 08:00-18:00：迟到(>15分)',
  flag: '',
  shiftSummary: '常规班次 08:00-18:00',
  spanSummary: '08:20→18:00 (9.7h)',
  lateText: '20',
  earlyText: '',
  missingText: '',
  ...over,
});

function open() {
  return render(
    <ConfirmProvider>
      <EmployeePunchDialog
        isOpen
        onClose={() => {}}
        employee={{ employeeId: '1001', employeeName: '张三' }}
        records={records}
        anomalies={[]}
        outerFilterActive={false}
        outerFilterSummary=""
        canManage={false}
        removeRecord={async () => null}
      />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  // 判定缓存按月份走，测试之间必须清干净，否则第二个用例读着上一个的缓存
  useAttendanceStore.setState({ verdictsByMonth: {} });
});

describe('打卡弹窗里的判定', () => {
  it('判定、依据、对上的班次都显示出来', async () => {
    fetchMock.mockResolvedValue({ month: '2026-09', days: [verdict()] });
    open();

    expect(await screen.findByText('迟到(>15分)')).toBeInTheDocument();
    expect(screen.getByText('常规班次 08:00-18:00：迟到(>15分)')).toBeInTheDocument();
    expect(screen.getByText(/对上班次 常规班次/)).toBeInTheDocument();
    // 只请求弹窗里出现的那个月
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('2026-09');
  });

  it('★ 标记显示出来，让人知道这行是系统自己都觉得要看的', async () => {
    fetchMock.mockResolvedValue({ month: '2026-09', days: [verdict({ flag: '★有未归属卡', orphan: ['03:17'] })] });
    open();

    expect(await screen.findByText('★有未归属卡')).toBeInTheDocument();
    expect(screen.getByText('未归属卡 03:17 没被任何班次收走')).toBeInTheDocument();
  });

  it('正常且没有边界情况时不再把徽章和班次重念一遍', async () => {
    fetchMock.mockResolvedValue({
      month: '2026-09',
      days: [verdict({ verdict: '正常', why: '常规班次 08:00-18:00：正常', flag: '' })],
    });
    open();

    expect(await screen.findByText('正常')).toBeInTheDocument();
    expect(screen.getByText(/对上班次 常规班次/)).toBeInTheDocument();
    expect(screen.queryByText('常规班次 08:00-18:00：正常')).not.toBeInTheDocument();
  });

  it('判定还没回来时说明在算，不假装这天没问题', async () => {
    let release: (v: { month: string; days: DayVerdict[] }) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    open();

    expect(screen.getByText('判定计算中…')).toBeInTheDocument();
    release({ month: '2026-09', days: [verdict()] });
    await waitFor(() => expect(screen.getByText('迟到(>15分)')).toBeInTheDocument());
  });

  it('取判定失败时说明原因，而不是留一行空白让人以为漏判', async () => {
    fetchMock.mockRejectedValue({ error: '没有该月的判定权限' });
    open();

    expect(await screen.findByText('没有该月的判定权限')).toBeInTheDocument();
  });
});
