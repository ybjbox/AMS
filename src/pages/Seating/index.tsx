import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { printReactTree } from '@/utils/printWindow';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { useDepartments } from '@/store/useDepartmentStore';
import { Armchair, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { User } from '@/types';

import { SeatingToolbar } from './components/SeatingToolbar';
import { TableConfig } from './components/TableConfig';
import { TableCard } from './components/TableCard';
import { UnseatedStrip } from './components/UnseatedStrip';
import { ParticipantModal } from './components/ParticipantModal';
import { PrintSettingsModal } from './components/PrintSettingsModal';
import { PrintPreview } from './components/PrintPreview';
import { PlansModal } from './components/PlansModal';

import { useSeatingArrange, type Table, type TableCapacity } from './hooks/useSeatingArrange';
import { useSeatingPlans } from './hooks/useSeatingPlans';
import { usePrintSettings } from './hooks/usePrintSettings';
import { RENAME_MESSAGES, type MoveSpec } from './lib/manual';

export default function Seating() {
  const users = useEmployeeStore((state) => state.users);
  const departments = useDepartments((state) => state.departments);
  const roles = useDepartments((state) => state.roles);

  const printAreaRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);

  const activeUsers = useMemo(() => users.filter((u) => u.status !== '离职'), [users]);

  const { printSettings, setPrintSettings } = usePrintSettings();
  const {
    tableCapacities,
    tables,
    skippedNumbers,
    setSkippedNumbers,
    setTableCapacities,
    setTables,
    addTableCapacity,
    updateTableCapacity,
    removeTableCapacity,
    handleAutoArrange,
    handleClear,
    removeTable,
    undoRemoveTable,
    renameTable,
    applyRename,
    clearUndo,
    capacitiesByNumber,
    unseated,
    moveMember,
  } = useSeatingArrange(activeUsers, selectedUserIds, departments, roles);

  /** 点选一个等待移入某桌的人（拖拽之外的键盘/点击路径） */
  const [pickedUserId, setPickedUserId] = useState<string | null>(null);
  const undoRef = useRef(undoRemoveTable);
  useEffect(() => {
    undoRef.current = undoRemoveTable;
  }, [undoRemoveTable]);

  const handleMove = useCallback(
    (spec: MoveSpec) => {
      const result = moveMember(spec);
      if (result.ok) {
        toast.success(result.message);
        setPickedUserId(null);
        return;
      }
      if (result.reason === 'full') toast.warning('目标桌已满：先改这桌人数上限，或换一桌');
      else if (result.reason === 'no-such-table') toast.error('目标桌已不存在，请重新排座');
      // already-there（松回原位）与 not-found（档案里已删）不打扰用户
    },
    [moveMember]
  );

  const applyPlanState = useCallback(
    (state: { tableCapacities: TableCapacity[]; tables: Table[]; skippedNumbers: string }) => {
      if (state.tableCapacities.length) setTableCapacities(state.tableCapacities);
      setTables(state.tables);
      setSkippedNumbers(state.skippedNumbers);
      setPickedUserId(null);
      clearUndo();
    },
    [setTableCapacities, setTables, setSkippedNumbers, clearUndo]
  );

  const seatingPlans = useSeatingPlans({
    users: activeUsers,
    tableCapacities,
    tables,
    skippedNumbers,
    onApply: applyPlanState,
  });

  // 「默认全选」只在名单本身变化时播种一次。此前判据是 size === 0，于是逐个取消到
  // 最后一个会立刻命中它 → 整张名册被重新全选，包括用户刚刚明确排除的部门。
  // 排座产物是要出纸的，错一次就是一叠废卡。
  const rosterKey = useMemo(() => activeUsers.map((u) => u.id).join('|'), [activeUsers]);
  const seededRosterKey = useRef<string | null>(null);
  useEffect(() => {
    if (!activeUsers.length || seededRosterKey.current === rosterKey) return;
    seededRosterKey.current = rosterKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedUserIds(new Set(activeUsers.map((u) => u.id)));
  }, [activeUsers, rosterKey]);

  useBodyOverflow(isParticipantModalOpen || isPrintModalOpen || isPlansModalOpen);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, User[]> = {};
    activeUsers.forEach((u) => {
      if (!groups[u.department || '']) groups[u.department || ''] = [];
      groups[u.department || ''].push(u);
    });
    return groups;
  }, [activeUsers]);

  const getTableDepartments = useCallback((members: User[]) => {
    const depts = new Set(members.map((m) => m.department).filter(Boolean));
    return Array.from(depts).join('、');
  }, []);

  const renderJustifiedName = useCallback((name: string, fontSize: number) => {
    if (name.length <= 4) {
      return (
        <div className="flex justify-between mx-auto" style={{ width: `${fontSize * 4}px` }}>
          {name.split('').map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </div>
      );
    }
    return <div className="text-center">{name}</div>;
  }, []);

  const toggleUserSelection = useCallback((id: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleDepartmentSelection = useCallback(
    (dept: string, isSelected: boolean) => {
      setSelectedUserIds((prev) => {
        const newSet = new Set(prev);
        groupedUsers[dept]?.forEach((u) => {
          if (isSelected) newSet.add(u.id);
          else newSet.delete(u.id);
        });
        return newSet;
      });
    },
    [groupedUsers]
  );

  const handlePrint = useCallback(() => {
    if (printReactTree(printAreaRef.current) === false) {
      toast.error('还没有生成座次卡，请先「自动排座」');
    }
  }, []);

  // 整体重排/清空/删桌都可能让「已选中待移入的人」失效，顺手取消选中
  const runAutoArrange = useCallback(() => {
    setPickedUserId(null);
    handleAutoArrange();
  }, [handleAutoArrange]);

  const runClear = useCallback(() => {
    setPickedUserId(null);
    handleClear();
  }, [handleClear]);

  const handleRemoveTable = useCallback(
    (tableNumber: number) => {
      setPickedUserId(null);
      if (!removeTable(tableNumber)) return;
      toast(`已删除 ${tableNumber} 号桌，成员回到未入座`, {
        duration: 8000,
        action: {
          label: '撤销',
          onClick: () => {
            // 必须走 ref：toast 的 action 闭包捕获的是删除前那一次渲染的 undoRemoveTable，
            // 那时 lastRemoved 还是 null，撤销会莫名其妙失败
            const restored = undoRef.current();
            if (restored) toast.success(`${restored.number} 号桌已放回原位（${restored.members.length} 人）`);
            else toast.error('桌号已被占用或画布已变，无法放回');
          },
        },
      });
    },
    [removeTable]
  );

  const handleRename = useCallback(
    (from: number, to: number) => {
      const result = renameTable(from, to);
      if (!result.ok) {
        toast.warning(RENAME_MESSAGES[result.reason]);
        return;
      }
      applyRename(result);
      toast.success(`${from} 号桌已改为 ${to} 号桌，人数上限跟着改`);
    },
    [renameTable, applyRename]
  );

  return (
    <div className="w-full min-h-full flex flex-1 flex-col space-y-6 animate-in fade-in duration-400 print:hidden">
        <div className="page-header shrink-0">
          <div>
            <h1 className="page-title">座位安排</h1>
            <p className="page-subtitle">自动按部门与职位优先级生成方案，可拖拽微调；座次顺序即打印序号</p>
          </div>
          <div>
            <button
              onClick={runAutoArrange}
              className="btn-primary"
            >
              <RefreshCw className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">自动排座</span>
            </button>
          </div>
        </div>
        <SeatingToolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          hasTables={tables.length > 0}
          handleClear={runClear}
          setIsParticipantModalOpen={setIsParticipantModalOpen}
          selectedCount={selectedUserIds.size}
          setIsPrintModalOpen={setIsPrintModalOpen}
          setIsPlansModalOpen={setIsPlansModalOpen}
          unsaved={seatingPlans.isDirty || seatingPlans.neverSaved}
        />

        {seatingPlans.restorable && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50/60 dark:bg-brand-900/15 px-4 py-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              上次保存的方案是
              <strong className="mx-1">「{seatingPlans.restorable.name}」</strong>
              （{seatingPlans.restorable.payload?.tables?.length ?? 0} 桌 · {seatingPlans.restorable.updatedAt}），当前画布是空的。
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => seatingPlans.restore(seatingPlans.restorable!)}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                载入该方案
              </button>
              <button
                onClick={() => seatingPlans.refresh()}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                刷新列表
              </button>
            </div>
          </div>
        )}

        <TableConfig
          tableCapacities={tableCapacities}
          addTableCapacity={addTableCapacity}
          updateTableCapacity={updateTableCapacity}
          removeTableCapacity={removeTableCapacity}
          skippedNumbers={skippedNumbers}
          setSkippedNumbers={setSkippedNumbers}
          selectedCount={selectedUserIds.size}
        />

        <UnseatedStrip users={unseated} pickedUserId={pickedUserId} onPick={setPickedUserId} onMove={handleMove} />

        {tables.length > 0 ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
            {tables.map((table) => (
              <TableCard
                key={table.number}
                table={table}
                viewMode={viewMode}
                capacity={capacitiesByNumber[table.number]}
                pickedUserId={pickedUserId}
                onPick={setPickedUserId}
                onMove={handleMove}
                onRemove={handleRemoveTable}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Armchair}
            title="准备好开始排座了吗？"
            description="点击右上角的“自动排座”按钮，系统将根据员工的部门和职位优先级为您生成最佳方案；生成后可拖拽微调。"
            action={
              <button onClick={runAutoArrange} className="btn-primary">
                自动排座
              </button>
            }
          />
        )}

      <ParticipantModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        groupedUsers={groupedUsers}
        selectedUserIds={selectedUserIds}
        toggleUserSelection={toggleUserSelection}
        toggleDepartmentSelection={toggleDepartmentSelection}
      />

      <PlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        plans={seatingPlans.plans}
        listing={seatingPlans.listing}
        saving={seatingPlans.saving}
        onSave={seatingPlans.save}
        onRestore={(p) => {
          seatingPlans.restore(p);
          setIsPlansModalOpen(false);
        }}
        onRemove={(id) => void seatingPlans.remove(id)}
      />

      <PrintSettingsModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        printSettings={printSettings}
        setPrintSettings={setPrintSettings}
        tables={tables}
        handlePrint={handlePrint}
        getTableDepartments={getTableDepartments}
        renderJustifiedName={renderJustifiedName}
      />


      <PrintPreview
        containerRef={printAreaRef}
        tables={tables}
        printSettings={printSettings}
        getTableDepartments={getTableDepartments}
        renderJustifiedName={renderJustifiedName}
      />
    </div>
  );
}
