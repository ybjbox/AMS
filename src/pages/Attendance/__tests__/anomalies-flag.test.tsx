import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnomaliesTable from '@/pages/Attendance/components/AnomaliesTable';
import { attendanceApi, type DayVerdict } from '@/services/attendanceApi';
import { useAttendanceStore } from '@/store/useAttendanceStore';
import type { Anomaly } from '@/store/useAttendanceStore';

vi.mock('@/services/attendanceApi', () => ({
  attendanceApi: { fetchDayVerdicts: vi.fn() },
}));

const fetchMock = vi.mocked(attendanceApi.fetchDayVerdicts);

const anomalies: Anomaly[] = [
  {
    id: 'a1',
    employeeId: '1001',
    employeeName: '张三',
    date: '2026-09-05',
    type: 'LATE_15',
    minutes: 20,
    description: '迟到 20 分钟',
  },
  {
    id: 'a2',
    employeeId: '1002',
    employeeName: '李四',
    date: '2026-09-06',
    type: 'MISSING_OUT',
    description: '缺下班卡',
  },
];

const verdict = (over: Partial<DayVerdict>): DayVerdict => ({
  employeeId: '1001',
  employeeName: '张三',
  department: '',
  date: '2026-09-05',
  weekday: '五',
  times: [],
  instances: [],
  orphan: [],
  borrowed: [],
  isLeave: false,
  noRule: false,
  verdict: '迟到(>15分)',
  why: '常规班次 08:00-18:00：迟到(>15分)',
  flag: '',
  shiftSummary: '',
  spanSummary: '',
  lateText: '',
  earlyText: '',
  missingText: '',
  ...over,
});

function open() {
  return render(
    <AnomaliesTable
      anomalies={anomalies}
      totalCount={anomalies.length}
      filterActive={false}
      onResetFilter={() => {}}
      onAnalyze={() => {}}
      canAnalyze
      hasAnalysis
      isLoading={false}
    />
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  useAttendanceStore.setState({ verdictsByMonth: {} });
});

describe('异常表的「需确认」列', () => {
  it('把描述里没说的标记（单卡 / ★）补上，点开能看到完整依据', async () => {
    fetchMock.mockResolvedValue({
      month: '2026-09',
      days: [verdict({ flag: '单卡', why: '常规班次 08:00-18:00：缺下班卡（单卡）' })],
    });
    open();

    // 原先是 title 悬停提示；触屏与键盘都取不到，改成可聚焦的展开（audit-2）
    const trigger = await screen.findByRole('button', { name: /单卡/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(await screen.findByText('常规班次 08:00-18:00：缺下班卡（单卡）')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('没有要确认的事就留一个破折号，不重念一遍描述', async () => {
    fetchMock.mockResolvedValue({
      month: '2026-09',
      days: [verdict({ flag: '', why: '常规班次 08:00-18:00：迟到(>15分)' })],
    });
    open();

    // 两条异常：1001 那天没有要确认的事、1002 那天判定还没取到，都只显示破折号
    await waitFor(() => expect(screen.getAllByText('—').length).toBe(2));
  });
});
