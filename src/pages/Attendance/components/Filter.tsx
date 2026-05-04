import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, ChevronDown, Search, Plus, AlertTriangle } from 'lucide-react';
import { PunchRecord, EmployeeSchedule, Shift } from '@/store/useAttendanceStore';
import { attendanceService } from '@/services/attendance';
import { UseAttendanceReturn } from '../hooks/useAttendance';

export type FilterProps = Pick<
  UseAttendanceReturn,
  | 'activeTab'
  | 'setActiveTab'
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
  | 'analyzeAnomalies'
  | 'addShift'
  | 'updateShift'
  | 'users'
  | 'hasPermission'
>;

export default function Filter({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  editingShift,
  setEditingShift,
  records,
  schedules,
  shifts,
  setRecords,
  setSchedules,
  analyzeAnomalies,
  addShift,
  updateShift,
  users,
  hasPermission,
}: FilterProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      if (!file) return;

      setIsUploading(true);
      try {
        const response = await attendanceService.uploadFile(file, 'excel');
        if (response.success) {
          const mockRecords: PunchRecord[] = [
            { id: '1', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '08:50:00' },
            { id: '2', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '18:05:00' },
            { id: '3', employeeId: 'EMP002', employeeName: '李四', date: '2026-03-16', time: '09:15:00' },
          ];
          setRecords(mockRecords);
          // TODO(backend): 接入真实的 Excel 解析 API，使用 xlsx 库读取文件内容
          toast.warning(`文件已接收，当前返回 ${mockRecords.length} 条演示数据（文件内容未实际解析）`);
        }
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error('文件上传失败，请重试');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [setRecords]
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
    if (records.length === 0 || schedules.length === 0) {
      toast.warning('请先导入打卡记录和排班字典');
      return;
    }

    try {
      const response = await attendanceService.triggerAnalysis();

      if (response.success) {
        analyzeAnomalies();
        setActiveTab('anomalies');
        toast.success(response.message);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      toast.error('分析失败，请重试');
    }
  }, [records.length, schedules.length, analyzeAnomalies, setActiveTab]);

  const onEmployeeSelectClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const employeeId = e.currentTarget.dataset.employeeid;
    if (employeeId !== undefined) {
      setSelectedEmployeeId(employeeId);
      setIsEmployeeDropdownOpen(false);
      setEmployeeSearchQuery('');
    }
  }, []);

  const onShiftCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const shiftId = e.currentTarget.dataset.shiftid;
    if (shiftId) {
      if (e.target.checked) {
        setSelectedShiftIds((prev) => [...prev, shiftId]);
      } else {
        setSelectedShiftIds((prev) => prev.filter((id) => id !== shiftId));
      }
    }
  }, []);

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
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">上传 Excel 文件</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              支持 .xls 和 .xlsx 格式。表头需包含：工号、姓名、日期、时间（或打卡时间）。
            </p>
            <div
              className={`border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center transition-colors ${isUploading ? 'bg-zinc-50 dark:bg-zinc-800/50 cursor-wait' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer'}`}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <FileSpreadsheet
                className={`w-10 h-10 mx-auto mb-3 ${isUploading ? 'text-blue-400 animate-pulse' : 'text-zinc-400'}`}
              />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {isUploading ? '正在上传并处理...' : '点击选择 Excel 文件'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">支持 .xls, .xlsx</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xls,.xlsx"
                className="hidden"
                disabled={isUploading}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'schedules' && hasPermission('attendance:manage') && (
        <div className="mb-6 p-6 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">手动分配班次</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">选择员工</label>
              <div
                className="w-full p-2.5 border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white cursor-pointer flex justify-between items-center focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
                onClick={() => setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen)}
                tabIndex={0}
              >
                <span className={selectedEmployeeId ? '' : 'text-zinc-500'}>
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
                      <input
                        type="text"
                        placeholder="搜索姓名或工号..."
                        value={employeeSearchQuery}
                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border-none rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1 py-1">
                    <div
                      className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${!selectedEmployeeId ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}
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
                          className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${selectedEmployeeId === u.id ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}
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
                  <label key={s.id} className="flex items-center space-x-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      data-shiftid={s.id}
                      checked={selectedShiftIds.includes(s.id)}
                      onChange={onShiftCheckboxChange}
                      className="w-4 h-4 text-blue-600 border-zinc-300 rounded focus:ring-blue-600/30 transition-colors"
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
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
            {editingShift ? '编辑班次' : '添加新班次'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">班次名称</label>
              <input
                type="text"
                value={editingShift ? editingShift.name : ''}
                onChange={onShiftNameChange}
                placeholder="如: 早班, 晚班"
                className="w-full p-2.5 border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">上班时间</label>
              <input
                type="time"
                value={editingShift ? editingShift.startTime : '09:00'}
                onChange={onShiftStartTimeChange}
                className="w-full p-2.5 border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">下班时间</label>
              <input
                type="time"
                value={editingShift ? editingShift.endTime : '18:00'}
                onChange={onShiftEndTimeChange}
                className="w-full p-2.5 border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
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
                <button
                  onClick={onCancelEditShiftClick}
                  className="px-4 py-2.5 bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-600 active:scale-95 transition-all duration-300 text-sm font-medium whitespace-nowrap"
                >
                  取消
                </button>
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
            {hasPermission('attendance:manage') && (
              <button
                onClick={handleAnalyze}
                className="flex items-center px-5 py-2.5 bg-success text-white rounded-lg hover:bg-success/90 transition-all duration-300 text-sm font-medium shadow-sm"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                一键分析异常
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="搜索姓名或工号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full text-sm border-none rounded-xl bg-zinc-100/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
            />
          </div>
        </div>
      )}
    </>
  );
}
