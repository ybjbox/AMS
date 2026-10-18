import PageContainer from "@/components/PageContainer";
import React, { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useDashboard } from './hooks/useDashboard';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { CARD_LABELS, type CardId } from './layout';
import { WIDGET_SIZES, type WidgetSize } from '@/config/widgetSizes';
import SortableCard from './components/SortableCard';
import StatCards from './components/StatCards';
import SystemNotices from './components/SystemNotices';
import QuickActions from './components/QuickActions';

// recharts 体积较大（~350KB）：懒加载使图表代码仅在控制台页进入时加载，
// 不拖累登录页与其它页面的首屏
const DashboardChart = lazy(() => import('./components/DashboardChart'));
import WorkforceTrend from './components/WorkforceTrend';
import DepartmentDistribution from './components/DepartmentDistribution';
import AttendanceHeatmap from './components/AttendanceHeatmap';
import DepartmentAttendance from './components/DepartmentAttendance';

export default function Dashboard() {
  const dashboardData = useDashboard();
  const { layout, setSize, move } = useDashboardLayout();
  // 编辑态：拖拽手柄与尺寸切换只在这里出现。常态下每张卡都挂一排控件会把版面弄脏，
  // 而排序/调尺寸都是低频动作。
  const [editing, setEditing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sizeOf = (id: CardId): WidgetSize => layout.find((e) => e.id === id)?.size ?? 'medium';

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = layout.findIndex((e) => e.id === active.id);
    const to = layout.findIndex((e) => e.id === over.id);
    if (from >= 0 && to >= 0) move(from, to);
  };

  const renderCard = (id: CardId) => {
    const { isLoading } = dashboardData;
    switch (id) {
      case 'chart':
        return (
          <Suspense
            fallback={
              <div className="card-base p-6 min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                图表加载中…
              </div>
            }
          >
            <DashboardChart
              data={dashboardData.chartData}
              isLoading={isLoading}
              size={sizeOf('chart')}
              onSizeChange={(s) => setSize('chart', s)}
              editing={editing}
            />
          </Suspense>
        );
      case 'quick':
        return <QuickActions quickActions={dashboardData.quickActions} isLoading={isLoading} />;
      case 'notices':
        return <SystemNotices notices={dashboardData.notices} isLoading={isLoading} />;
      case 'workforce':
        return (
          <WorkforceTrend
            stats={dashboardData.workforce}
            isLoading={isLoading}
            size={sizeOf(id)}
            onSizeChange={(s) => setSize(id, s)}
            editing={editing}
          />
        );
      case 'deptDist':
        return (
          <DepartmentDistribution
            stats={dashboardData.workforce}
            isLoading={isLoading}
            size={sizeOf(id)}
            onSizeChange={(s) => setSize(id, s)}
            editing={editing}
          />
        );
      case 'heatmap':
        return (
          <AttendanceHeatmap
            stats={dashboardData.attendance}
            isLoading={isLoading}
            size={sizeOf(id)}
            onSizeChange={(s) => setSize(id, s)}
            editing={editing}
          />
        );
      case 'deptAttendance':
        return (
          <DepartmentAttendance
            stats={dashboardData.attendance}
            isLoading={isLoading}
            size={sizeOf(id)}
            onSizeChange={(s) => setSize(id, s)}
            editing={editing}
          />
        );
    }
  };

  return (
    <PageContainer className="space-y-8 animate-in fade-in duration-400">
      <div className="page-header">
        <div>
          <h1 className="page-title">控制台</h1>
          <p className="page-subtitle">系统运行总览与快捷入口</p>
        </div>
        <div className="flex items-center gap-3">
          {editing && <span className="text-xs text-muted-foreground">编辑中：拖卡片右上角圆钮排序；数据趋势可切尺寸</span>}
          <div className="text-sm font-medium text-muted-foreground bg-white dark:bg-zinc-800 px-4 py-2 rounded-full shadow-sm border border-zinc-100 dark:border-zinc-700/50">
            本次刷新: {dashboardData.refreshedAt}
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? '完成' : '自定义'}
          </Button>
        </div>
      </div>

      <StatCards stats={dashboardData.stats} isLoading={dashboardData.isLoading} />

      {/*
        一个流式网格，而不是改造前的三个行网格：卡片按用户顺序依次落位、各自按档位占列，
        所以"把某张卡挪到前面"才是有意义的操作，也不会再留下整块空白。
        五张图表卡支持尺寸切换（各自定义"小档藏什么"，见各组件与 widgetSizes.ts）；
        快捷操作与系统公告只参与排序 —— 它们没有"少画一点还成立"的密度维度，
        藏掉两个快捷入口或几条公告只会让人找不到东西。
      */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((e) => e.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8">
            {layout.map((entry) => (
              <SortableCard
                key={entry.id}
                id={entry.id}
                label={CARD_LABELS[entry.id]}
                spanClass={WIDGET_SIZES[entry.size].spanClass}
                editing={editing}
              >
                {renderCard(entry.id)}
              </SortableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </PageContainer>
  );
}
