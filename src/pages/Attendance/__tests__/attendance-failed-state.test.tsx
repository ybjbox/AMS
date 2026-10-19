import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EmployeeRollupTable from '@/pages/Attendance/components/EmployeeRollupTable';
import AnomaliesTable from '@/pages/Attendance/components/AnomaliesTable';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { useAttendanceStore } from '@/store/useAttendanceStore';
import type { Anomaly, PunchRecord } from '@/store/useAttendanceStore';

// 有异常行时组件会按月去取「判定依据」，这里给它一个空结果，别让测试打真网络
vi.mock('@/services/attendanceApi', () => ({
  attendanceApi: { fetchDayVerdicts: vi.fn(async () => ({ days: [] })) },
}));

/**
 * 审查 M1 里考勤这一路漏做的两个视图：后端 500 时列表当然是空的，
 * 而空态文案说的是「你还没导入打卡」「还没有进行过异常分析」——
 * 用户据此又去导一遍数据，真正的"服务没答话"只在 toast 里待了四秒。
 *
 * 判据用**全库条数为 0**，不是"这一屏没行"：写操作失败也会置同一个 error，
 * 那时表里明明还有人，不该整张表退成失败态。
 */

const punch = (id: string): PunchRecord => ({
  id,
  employeeId: 'EMP0001',
  employeeName: '张三',
  date: '2026-09-05',
  time: '08:00:00',
  source: 'wecom',
});

const anomaly: Anomaly = {
  id: 'a1',
  employeeId: 'EMP0001',
  employeeName: '张三',
  date: '2026-09-05',
  type: 'LATE_15',
  minutes: 20,
  description: '迟到 20 分钟',
};

function renderRollup(totalCount: number, loadError: string | null, records: PunchRecord[] = []) {
  return render(
    <ConfirmProvider>
      <EmployeeRollupTable
        records={records}
        totalCount={totalCount}
        anomalies={[]}
        filterActive={false}
        filterSummary=""
        onResetFilter={() => {}}
        onImportClick={() => {}}
        isLoading={false}
        loadError={loadError}
        onRetry={vi.fn()}
        canManage
        canPurge={false}
        clearRecords={vi.fn(async () => null)}
        removeRecord={vi.fn(async () => null)}
      />
    </ConfirmProvider>
  );
}

function renderAnomalies(totalCount: number, loadError: string | null, anomalies: Anomaly[] = []) {
  return render(
    <AnomaliesTable
      anomalies={anomalies}
      totalCount={totalCount}
      filterActive={false}
      onResetFilter={() => {}}
      onAnalyze={() => {}}
      canAnalyze
      hasAnalysis={false}
      isLoading={false}
      loadError={loadError}
      onRetry={vi.fn()}
    />
  );
}

describe('打卡记录：加载失败不说成"还没有打卡记录"', () => {
  it('全库为 0 且有失败原因 → 失败态带重试，空态文案一句都不留', () => {
    renderRollup(0, '服务器内部错误');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('打卡记录加载失败')).toBeInTheDocument();
    expect(screen.getByText('服务器内部错误')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText('还没有打卡记录')).toBeNull();
    expect(screen.queryByText(/从企业微信导出打卡表/)).toBeNull();
  });

  it('全库为 0 且没有失败原因 → 仍说"还没有打卡记录"并递上导入按钮', () => {
    renderRollup(0, null);
    expect(screen.getByText('还没有打卡记录')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('表里有人时即便有失败原因也不退成失败态（那是上一次写操作的错）', () => {
    renderRollup(3, '删除失败', [punch('r1')]);
    expect(screen.queryByText('打卡记录加载失败')).toBeNull();
    expect(screen.getByText('张三')).toBeInTheDocument();
  });
});

describe('异常清单：加载失败不说成"还没有进行过异常分析"', () => {
  it('全库为 0 且有失败原因 → 失败态，不再劝用户去点「一键分析异常」', () => {
    renderAnomalies(0, '服务器内部错误');
    expect(screen.getByText('异常清单加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText('还没有进行过异常分析')).toBeNull();
    expect(screen.queryByRole('button', { name: /一键分析异常/ })).toBeNull();
  });

  it('全库为 0 且没有失败原因 → 保持原空态口径', () => {
    renderAnomalies(0, null);
    expect(screen.getByText('还没有进行过异常分析')).toBeInTheDocument();
    expect(screen.queryByText('异常清单加载失败')).toBeNull();
  });

  it('有异常行时不退成失败态', () => {
    // 预置该月判定缓存，loadVerdicts 直接命中缓存 → 测试里不会有异步 setState
    useAttendanceStore.setState({ verdictsByMonth: { '2026-09': [] } });
    renderAnomalies(1, '分析失败', [anomaly]);
    expect(screen.queryByText('异常清单加载失败')).toBeNull();
    expect(screen.getByText('迟到 20 分钟')).toBeInTheDocument();
  });
});
