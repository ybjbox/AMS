import { Permission } from "@/components/Permission";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, ChevronDown, Search, Plus, AlertTriangle, Download } from 'lucide-react';
import { EmployeeSchedule, Shift } from '@/store/useAttendanceStore';
import { punchImportTemplateUrl } from '@/services/attendanceApi';
import PunchImportDialog from './PunchImportDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type FilterProps = Pick<
  UseAttendanceReturn,
  | 'activeTab'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'scheduleSearchQuery'
  | 'setScheduleSearchQuery'
  | 'editingShift'
  | 'setEditingShift'
  | 'records'
  | 'schedules'
  | 'shifts'
  | 'setRecords'
  | 'setSchedules'
  | 'fetchData'
  | 'analyzeAnomalies'
  | 'addShift'
  | 'updateShift'
  | 'users'
  | 'hasPermission'
>;

export default function Filter({
  activeTab,
  searchQuery,
  setSearchQuery,
  editingShift,
  setEditingShift,
  records,
  schedules,
  shifts,
  setSchedules,
  analyzeAnomalies,
  addShift,
  updateShift,
  fetchData,
  users,
  hasPermission,
}: FilterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (!file) return;
      // 解析与校验都在服务端（/api/attendance/records/import），这里只把文件交给导入向导
      setImportFile(file);
      setImportOpen(true);
    },
    []
  );

  const handleAddManualSchedule = useCallback(() => {
    if (!selectedEmployeeId || selectedShiftIds.length === 0) return;

    const employee = users.find((u) => u.id === selectedEmployeeId);
    if (!employee) return;

    const newSchedule: EmployeeSchedule = {
      employeeId: employee.id,
      employeeName: employee.name,
      shiftIds: selectedShiftIds,
    };

    const existingIndex = schedules.findIndex((s) => s.employeeId === employee.id);
    if (existingIndex >= 0) {
      const updatedSchedules = [...schedules];
      updatedSchedules[existingIndex] = newSchedule;
      setSchedules(updatedSchedules);
    } else {
      setSchedules([...schedules, newSchedule]);
    }

    setSelectedEmployeeId('');
    setSelectedShiftIds([]);
  }, [selectedEmployeeId, selectedShiftIds, users, schedules, setSchedules]);

  const handleAnalyze = useCallback(async () => {
    // 只需要打卡记录：对班可以来自部门工作时段（不需要排班字典），没有卡才真的无从判定
    if (records.length === 0) {
      toast.warning('还没有打卡记录，先去「打卡记录」导入或等待企业微信同步');
      return;
    }

    try {
      // store 动作内部调用 POST /attendance/analyze（真实分析并持久化）
      await analyzeAnomalies();
      toast.success('异常分析完成');
    } catch (error) {
      console.error('Analysis failed:', error);
      toast.error('分析失败，请重试');
    }
  }, [records.length, analyzeAnomalies]);

  const onEmployeeSelectClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const employeeId = e.currentTarget.dataset.employeeid;
    if (employeeId !== undefined) {
      setSelectedEmployeeId(employeeId);
      setIsEmployeeDropdownOpen(false);
      setEmployeeSearchQuery('');
    }
  }, []);

  const onShiftCheckboxChange = useCallback(
    (shiftId: string) => (checked: boolean) => {
      if (!shiftId) return;
      setSelectedShiftIds((prev) => (checked ? [...prev, shiftId] : prev.filter((id) => id !== shiftId)));
    },
    []
  );

  const onShiftNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setEditingShift((prev) =>
        prev
          ? { ...prev, name: value }
          : { id: Math.random().toString(36).substr(2, 9), name: value, startTime: '09:00', endTime: '18:00' }
      );
    },
    [setEditingShift]
  );

  const onShiftStartTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setEditingShift((prev) =>
        prev
          ? { ...prev, startTime: value }
          : { id: Math.random().toString(36).substr(2, 9), name: '', startTime: value, endTime: '18:00' }
      );
    },
    [setEditingShift]
  );

  const onShiftEndTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setEditingShift((prev) =>
        prev
          ? { ...prev, endTime: value }
          : { id: Math.random().toString(36).substr(2, 9), name: '', startTime: '09:00', endTime: value }
      );
    },
    [setEditingShift]
  );

  const onSaveShiftClick = useCallback(() => {
    if (!editingShift || !editingShift.name) return;
    const existing = shifts.find((s) => s.id === editingShift.id);
    if (existing) {
      updateShift(editingShift.id!, editingShift);
    } else {
      addShift(editingShift as Shift);
    }
    setEditingShift(null);
  }, [editingShift, shifts, updateShift, addShift, setEditingShift]);

  const onCancelEditShiftClick = useCallback(() => {
    setEditingShift(null);
  }, [setEditingShift]);

  return (
    <>
      {activeTab === 'records' && hasPermission('attendance:manage') && (
        <div className="mb-6 bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-sm">
          <div className="w-full max-w-2xl">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">导入打卡记录</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              服务端解析 .xlsx，表头需含「日期」「时间」，工号或姓名至少一项；先预览校验结果再确认导入。
              同一员工同一分钟的重复行会自动跳过。
            </p>
            <div className="mb-4">
              <a
                href={punchImportTemplateUrl()}
                className="inline-flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-300 hover:underline"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                下载导入模板
              </a>
            </div>
            <div
              className={`border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer`}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet
                className={`w-10 h-10 mx-auto mb-3 text-zinc-400`}
              />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                点击选择 Excel 文件
              </p>
              <p className="text-xs text-muted-foreground mt-1">支持 .xlsx，单次最多 5000 行</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx"
                aria-label="上传 Excel 打卡记录"
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'schedules' && hasPermission('attendance:manage') && (
        <div className="mb-6 p-6 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">手动分配班次</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">选择员工</label>
              <div
                className="w-full p-2.5 border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white cursor-pointer flex justify-between items-center focus:outline-none focus:ring-4 focus:ring-brand-600/20 transition duration-200"
                onClick={() => setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen)}
                tabIndex={0}
              >
                <span className={selectedEmployeeId ? '' : 'text-muted-foreground'}>
                  {selectedEmployeeId
                    ? users.find((u) => u.id === selectedEmployeeId)?.name + ' (' + selectedEmployeeId + ')'
                    : '-- 请选择员工 --'}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </div>

              {isEmployeeDropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-xl shadow-lg max-h-60 flex flex-col overflow-hidden">
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                      <Input
                        type="text"
                        placeholder="搜索姓名或工号…"
                        value={employeeSearchQuery}
                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                        className="pl-9"
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1 py-1">
                    <div
                      className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${!selectedEmployeeId ? 'bg-brand-50/50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                      data-employeeid=""
                      onClick={onEmployeeSelectClick}
                    >
                      -- 请选择员工 --
                    </div>
                    {users
                      .filter(
                        (u) =>
                          u.name.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
                          u.id.toLowerCase().includes(employeeSearchQuery.toLowerCase())
                      )
                      .map((u) => (
                        <div
                          key={u.id}
                          className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${selectedEmployeeId === u.id ? 'bg-brand-50/50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                          data-employeeid={u.id}
                          onClick={onEmployeeSelectClick}
                        >
                          {u.name} ({u.id})
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                选择班次 (可多选)
              </label>
              <div className="flex flex-wrap gap-3">
                {shifts.map((s) => (
                  <label
                    key={s.id}
                    htmlFor={`shift-${s.id}`}
                    className="flex items-center space-x-2 cursor-pointer group"
                  >
                    <Checkbox
                      id={`shift-${s.id}`}
                      checked={selectedShiftIds.includes(s.id)}
                      onCheckedChange={onShiftCheckboxChange(s.id)}
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                      {s.name} ({s.startTime}-{s.endTime})
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleAddManualSchedule}
              disabled={!selectedEmployeeId || selectedShiftIds.length === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加排班
            </button>
          </div>
        </div>
      )}

      {activeTab === 'shifts' && hasPermission('attendance:manage') && (
        <div className="mb-6 bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            {editingShift ? '编辑班次' : '添加新班次'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">班次名称</label>
              <Input
                type="text"
                value={editingShift ? editingShift.name : ''}
                onChange={onShiftNameChange}
                placeholder="如: 早班, 晚班"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">上班时间</label>
              <Input
                type="time"
                value={editingShift ? editingShift.startTime : '09:00'}
                onChange={onShiftStartTimeChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">下班时间</label>
              <Input
                type="time"
                value={editingShift ? editingShift.endTime : '18:00'}
                onChange={onShiftEndTimeChange}
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onSaveShiftClick}
                disabled={!editingShift || !editingShift.name}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                保存
              </button>
              {editingShift && (
                <Button type="button" variant="secondary" size="lg" onClick={onCancelEditShiftClick}>
                  取消
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            提示：如果下班时间早于上班时间，系统会自动识别为跨天夜班。
          </p>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="mb-6 bg-white dark:bg-zinc-800 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center">
            <Permission code="attendance:manage">
              <Button type="button" size="lg" className="px-5" onClick={handleAnalyze}>
                <AlertTriangle />
                一键分析异常
              </Button>
            </Permission>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="搜索姓名或工号…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10"
            />
          </div>
        </div>
      )}

      <PunchImportDialog
        isOpen={importOpen}
        initialFile={importFile}
        onClose={() => {
          setImportOpen(false);
          setImportFile(null);
        }}
        onImported={() => void fetchData()}
      />
    </>
  );
}
