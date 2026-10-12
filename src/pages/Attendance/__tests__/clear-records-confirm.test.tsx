import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmProvider } from '@/hooks/useConfirm';
import EmployeeRollupTable from '@/pages/Attendance/components/EmployeeRollupTable';
import type { PunchRecord } from '@/store/useAttendanceStore';

/**
 * 钉住「清空全部打卡记录」的确认框报的是**全库**条数。
 *
 * 服务端执行的是 `DELETE FROM punch_records`（无 WHERE），而表格里的 `records` 是筛选后的
 * 那一份 —— 曾经这里直接拿 `records.length` 写进确认框：筛到本月时报「63 条」，
 * 点下去删掉 1897 条。这个对话框是唯一的防线，它报的数字必须是真的。
 */
const punch = (id: string, date: string): PunchRecord => ({
  id,
  employeeId: 'EMP0001',
  employeeName: '张三',
  date,
  time: '08:00:00',
  source: 'wecom',
});

const filtered = [punch('r1', '2026-09-05'), punch('r2', '2026-09-06')];

function open(totalCount: number, filterActive: boolean) {
  return render(
    <ConfirmProvider>
      <EmployeeRollupTable
        records={filtered}
        totalCount={totalCount}
        anomalies={[]}
        filterActive={filterActive}
        filterSummary="2026-09"
        onResetFilter={() => {}}
        onImportClick={() => {}}
        isLoading={false}
        canManage
        canPurge
        clearRecords={vi.fn(async () => null)}
        removeRecord={vi.fn(async () => null)}
      />
    </ConfirmProvider>
  );
}

describe('清空打卡记录的确认框', () => {
  it('筛选生效时也报全库条数，并写明筛选下是多少', () => {
    open(1897, true);
    fireEvent.click(screen.getByRole('button', { name: '清空全部记录' }));

    expect(screen.getByText('确定要清空全部 1897 条打卡记录吗？')).toBeInTheDocument();
    expect(screen.getByText(/当前筛选下是 2 条/)).toBeInTheDocument();
    // 筛选后的数字绝不能出现在标题里当"总量"
    expect(screen.queryByText(/清空全部 2 条/)).not.toBeInTheDocument();
  });

  it('没筛选时不多嘴重复同一个数字', () => {
    open(2, false);
    fireEvent.click(screen.getByRole('button', { name: '清空全部记录' }));

    expect(screen.getByText('确定要清空全部 2 条打卡记录吗？')).toBeInTheDocument();
    expect(screen.queryByText(/当前筛选下是/)).not.toBeInTheDocument();
  });

  it('全库还有数据时按钮不会因筛选而消失（否则筛错区间会让人以为没得清）', () => {
    open(1897, true);
    expect(screen.getByRole('button', { name: '清空全部记录' })).toBeInTheDocument();
  });
});
