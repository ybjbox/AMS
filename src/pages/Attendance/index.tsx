import PageContainer from "@/components/PageContainer";
import React, { useMemo } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, TriangleAlert, Upload, CalendarClock } from 'lucide-react';
import MonthlyReport from './components/MonthlyReport';
import ShiftRulesDialog from './components/ShiftRulesDialog';
import WorkflowBar from './components/WorkflowBar';
import { deriveWorkflowSteps, STEP_BLOCK_HINTS } from './lib/workflow';
import { RecordsFilterBar, AnomalyFilterBar } from './components/FilterBar';
import EmployeeRollupTable from './components/EmployeeRollupTable';
import AnomaliesTable from './components/AnomaliesTable';
import { ImportDialogHost } from './components/ImportPanel';
import { Button } from '@/components/ui/button';
import { Permission } from '@/components/Permission';
import { useAttendance } from './hooks/useAttendance';
import { describeRange } from './lib/datePresets';
import { useAttendanceStore } from '@/store/useAttendanceStore';

/**
 * 考勤管理：一条四步流水线。
 *
 * ①配部门时段 → ②导打卡记录 → ③分析异常 → ④看月度报表。
 *
 * 重排的依据是**数据依赖**而不是功能分类：时段是分析的前置（不配就整批
 * 「未判定」），打卡是分析的输入，月报是分析的产出。原先四个平铺标签把前置
 * 条件夹在第二位，于是最常见的失败模式 —— "异常是 0 条" —— 看不出是没分析
 * 还是分析过确实没人异常。现在工作流条把状态摆在最上面，且每步都能直达，
 * 它同时承担了原来的标签栏（省掉两条重复的导航）。
 */
export default function Attendance() {
  const a = useAttendance();
  const [importOpen, setImportOpen] = React.useState(false);
  const [shiftRulesOpen, setShiftRulesOpen] = React.useState(false);

  const analyzeCoverage = useAttendanceStore((s) => s.analyzeCoverage);
  const analyzeCoverageAt = useAttendanceStore((s) => s.analyzeCoverageAt);

  const steps = deriveWorkflowSteps({
    shiftRuleCount: a.shiftRuleCount,
    recordCount: a.records.length,
    analyzedAt: analyzeCoverageAt,
    freshness: a.freshness,
    recentAnomalies: a.recentAnomalies,
  });

  const currentStep = steps.find((s) => s.tab === a.activeTab);
  const blockHint = currentStep?.state === 'blocked' ? STEP_BLOCK_HINTS[a.activeTab] : undefined;
  const canManage = a.hasPermission('attendance:manage');

  const handleAnalyze = React.useCallback(async () => {
    if (a.records.length === 0) {
      toast.warning('还没有打卡记录，先去「打卡记录」导入或等待企业微信同步');
      a.setActiveTab('records');
      return;
    }
    if (a.shiftRuleCount === 0) {
      toast.warning('还没有配置部门时段，无法对班判定');
      setShiftRulesOpen(true);
      return;
    }
    // store 动作把失败原因作为返回值（不抛异常），必须看返回值再报成功 ——
    // 否则后端 403/500 时界面照样弹「异常分析完成」。
    const failure = await a.analyzeAnomalies();
    if (failure) toast.error(failure);
    else toast.success('异常分析完成');
  }, [a]);

  const recordFilterActive = a.recordFilterActive;
  const anomalyFilterActive = a.anomalyQuery.trim() !== '' || a.anomalyGroup !== 'all';
  const showFilter = a.activeTab !== 'monthly';

  /** 筛选摘要：说清当前在看哪一段，弹窗顶部与筛选栏共用同一份口径 */
  const filterSummary = useMemo(() => {
    const bits: string[] = [];
    if (a.recordFilter.query.trim()) bits.push(a.recordFilter.query.trim());
    bits.push(
      describeRange(a.recordFilter.dateFrom, a.recordFilter.dateTo) +
        (a.padDays ? '（含边界日）' : '')
    );
    if (a.recordFilter.source === 'wecom') bits.push('企业微信');
    if (a.recordFilter.source === 'manual') bits.push('补卡/导入');
    return bits.join(' · ');
  }, [a.recordFilter, a.padDays]);

  /** 员工表与筛选后打卡自洽：异常也按同一区间收窄，否则"异常 N"会跨到区间外 */
  const anomaliesInRange = useMemo(() => {
    const { dateFrom, dateTo } = a.recordFilter;
    if (!dateFrom && !dateTo) return a.anomalies;
    return a.anomalies.filter((x) => (!dateFrom || x.date >= dateFrom) && (!dateTo || x.date <= dateTo));
    // 依赖整个 recordFilter：解构出来的两个字段在 eslint 眼里仍算"用了 recordFilter"
  }, [a.anomalies, a.recordFilter]);

  return (
    <PageContainer width="none">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-4">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">考勤管理</h1>
            <p className="page-subtitle">先配部门时段，再导入打卡，最后做异常判定与月报</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 时段是配置、不是日常视图，所以不放标签栏；但要有个看得见的入口，
                否则只剩工作流条第①步一个入口，鼠标不点就发现不了 */}
            <Button variant="ghost" size="sm" onClick={() => setShiftRulesOpen(true)}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              部门时段
            </Button>
            {a.activeTab === 'records' && canManage && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                导入打卡记录
              </Button>
            )}
            {a.activeTab === 'anomalies' && (
              <Permission code="attendance:manage">
                <Button onClick={() => void handleAnalyze()}>
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  一键分析异常
                </Button>
              </Permission>
            )}
          </div>
        </div>

        <div className="shrink-0 space-y-3">
          <WorkflowBar
            steps={steps}
            activeTab={a.activeTab}
            onSelect={a.setActiveTab}
            onOpenDialog={() => setShiftRulesOpen(true)}
          />

          {blockHint && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <p className="text-2xs text-amber-800 dark:text-amber-300">{blockHint}</p>
            </div>
          )}

          {showFilter &&
            (a.activeTab === 'records' ? (
              <RecordsFilterBar
                filter={a.recordFilter}
                onChange={a.setRecordFilter}
                onReset={a.resetRecordFilter}
                active={recordFilterActive}
                matched={a.filteredRecords.length}
                total={a.records.length}
                activePreset={a.activeDatePreset}
                onPreset={a.applyDatePreset}
                padDays={a.padDays}
                onPadDaysChange={a.setPadDays}
              />
            ) : (
              <AnomalyFilterBar
                query={a.anomalyQuery}
                onQueryChange={a.setAnomalyQuery}
                group={a.anomalyGroup}
                onGroupChange={a.setAnomalyGroup}
                counts={a.anomalyCounts}
              />
            ))}
        </div>

        <div className="flex-1 card-base overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-auto" tabIndex={0} role="region" aria-label="考勤数据表">
            {a.activeTab === 'monthly' ? (
              <MonthlyReport />
            ) : a.activeTab === 'records' ? (
              <EmployeeRollupTable
                records={a.filteredRecords}
                totalCount={a.records.length}
                anomalies={anomaliesInRange}
                filterActive={recordFilterActive}
                filterSummary={filterSummary}
                onResetFilter={a.resetRecordFilter}
                onImportClick={() => setImportOpen(true)}
                isLoading={a.isLoading}
                canManage={canManage}
                canPurge={a.hasPermission('attendance:purge')}
                clearRecords={a.clearRecords}
                removeRecord={a.removeRecord}
              />
            ) : (
              <AnomaliesTable
                anomalies={a.filteredAnomalies}
                totalCount={a.anomalies.length}
                filterActive={anomalyFilterActive}
                onResetFilter={() => {
                  a.setAnomalyQuery('');
                  a.setAnomalyGroup('all');
                }}
                onAnalyze={() => void handleAnalyze()}
                canAnalyze={canManage}
                hasAnalysis={!!analyzeCoverage}
                isLoading={a.isLoading}
              />
            )}
          </div>
        </div>
      </div>

      <ShiftRulesDialog isOpen={shiftRulesOpen} onClose={() => setShiftRulesOpen(false)} />

      <ImportDialogHost
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void a.fetchData()}
        onGoAnalyze={() => {
          setImportOpen(false);
          a.setActiveTab('anomalies');
        }}
      />
    </PageContainer>
  );
}