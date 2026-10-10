import PageContainer from "@/components/PageContainer";
import React from 'react';
import Filter from './components/Filter';
import Stats from './components/Stats';
import Table from './components/Table';
import MonthlyReport from './components/MonthlyReport';
import ShiftRules from './components/ShiftRules';
import { useAttendance } from './hooks/useAttendance';
import { attendanceApi, type DeptShiftRule } from '@/services/attendanceApi';
import { useEffect, useMemo, useState } from 'react';

/** 「出勤人次」= 有打卡的「员工 × 日期」组合数（与判定口径一致，跨零点班次仍算一天）。 */
function countPunchDays(records: { employeeId: string; date: string }[]): number {
  const days = new Set<string>();
  for (const r of records) days.add(`${r.employeeId}|${r.date}`);
  return days.size;
}

export default function Attendance() {
  const attendanceData = useAttendance();
  const [shiftRuleCount, setShiftRuleCount] = useState(0);

  // 部门时段条数：Stats 需要的口径条数。改动发生在 ShiftRules 组件内部，
  // 这里靠「切回本页时重取」保持同步（避免为此再引一层全局 store）。
  useEffect(() => {
    let alive = true;
    attendanceApi
      .fetchShiftRules()
      .then((rules: DeptShiftRule[]) => {
        if (alive) setShiftRuleCount(rules.length);
      })
      .catch(() => {
        if (alive) setShiftRuleCount(0);
      });
    return () => {
      alive = false;
    };
  }, [attendanceData.activeTab]);

  const punchDays = useMemo(() => countPunchDays(attendanceData.records), [attendanceData.records]);

  return (
    <PageContainer width="none">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">考勤管理</h1>
            <p className="page-subtitle">导入打卡记录，按部门工作时段自动对班并分析考勤异常</p>
          </div>
          {/* Tab 切换 */}
          <div className="tab-group" role="tablist" aria-label="考勤管理">
            {(
              [
                { tab: 'records', label: '打卡记录' },
                { tab: 'shift-rules', label: '部门时段' },
                { tab: 'anomalies', label: '异常分析' },
                { tab: 'monthly', label: '月度报表' },
              ] as const
            ).map(({ tab, label }) => (
              <button
                key={tab}
                role="tab"
                aria-selected={attendanceData.activeTab === tab}
                onClick={() => attendanceData.setActiveTab(tab)}
                className={attendanceData.activeTab === tab ? 'tab-item-active' : 'tab-item'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {attendanceData.activeTab !== 'monthly' && attendanceData.activeTab !== 'shift-rules' && (
          <div className="shrink-0 space-y-4 mb-4">
            <Stats
              records={attendanceData.records}
              anomalies={attendanceData.anomalies}
              shiftRuleCount={shiftRuleCount}
              punchDays={punchDays}
            />
            <Filter {...attendanceData} />
          </div>
        )}
        <div className="flex-1 card-base overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="考勤数据表">
            {attendanceData.activeTab === 'monthly' ? (
              <MonthlyReport />
            ) : attendanceData.activeTab === 'shift-rules' ? (
              <ShiftRules />
            ) : (
              <Table {...attendanceData} />
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
