import React, { useState, useRef, useEffect } from 'react';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Upload, FileText, AlertTriangle, Clock, Users, Calendar, Download, Search, FileSpreadsheet, Plus, ChevronDown } from 'lucide-react';
import { useAttendanceStore, PunchRecord, EmployeeSchedule, Shift } from '../store/attendance';
import { useUserStore } from '../store/users';
import { attendanceService } from '../services/attendance';
import { useAuth } from '../store/auth';
import { Permission } from '../types';

export default function Attendance() {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'schedules' | 'anomalies' | 'shifts'>('records');
  const { records, schedules, anomalies, setRecords, setSchedules, analyzeAnomalies, shifts, addShift, updateShift, deleteShift, fetchData, isLoading } = useAttendanceStore();
  const { users, fetchUsers } = useUserStore();
  
  useEffect(() => {
    fetchData();
    fetchUsers();
  }, [fetchData, fetchUsers]);

  const [recordsInput, setRecordsInput] = useState('');
  const [schedulesInput, setSchedulesInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [editingShift, setEditingShift] = useState<Partial<Shift> | null>(null);

  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Call the API service (currently mocked)
      const response = await attendanceService.uploadFile(file, 'excel');
      
      if (response.success) {
        // Mock backend processing result
        const mockRecords: PunchRecord[] = [
          { id: '1', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '08:50:00' },
          { id: '2', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '18:05:00' },
          { id: '3', employeeId: 'EMP002', employeeName: '李四', date: '2026-03-16', time: '09:15:00' },
        ];
        setRecords(mockRecords);
        alert(`${response.message}\n成功从后端获取到 ${mockRecords.length} 条打卡记录 (Mock)`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('文件上传失败，请重试');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleParseRecords = () => {
    // Mock backend processing
    setTimeout(() => {
      const mockRecords: PunchRecord[] = [
        { id: '1', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '08:50:00' },
        { id: '2', employeeId: 'EMP001', employeeName: '张三', date: '2026-03-16', time: '18:05:00' },
        { id: '3', employeeId: 'EMP002', employeeName: '李四', date: '2026-03-16', time: '09:15:00' },
      ];
      setRecords(mockRecords);
      alert(`成功从后端获取到 ${mockRecords.length} 条打卡记录 (Mock)`);
      setRecordsInput('');
    }, 500);
  };

  const handleParseSchedules = () => {
    // Mock backend processing
    setTimeout(() => {
      const mockSchedules: EmployeeSchedule[] = [
        { employeeId: 'EMP001', employeeName: '张三', shiftIds: ['1'] },
        { employeeId: 'EMP002', employeeName: '李四', shiftIds: ['1'] },
      ];
      setSchedules(mockSchedules);
      alert(`成功从后端获取到 ${mockSchedules.length} 条排班记录 (Mock)`);
      setSchedulesInput('');
    }, 500);
  };

  const handleAddManualSchedule = () => {
    if (!selectedEmployeeId || selectedShiftIds.length === 0) return;
    
    const employee = users.find(u => u.id === selectedEmployeeId);
    if (!employee) return;

    const newSchedule: EmployeeSchedule = {
      employeeId: employee.id,
      employeeName: employee.name,
      shiftIds: selectedShiftIds
    };

    // Check if schedule already exists for this employee
    const existingIndex = schedules.findIndex(s => s.employeeId === employee.id);
    if (existingIndex >= 0) {
      const updatedSchedules = [...schedules];
      updatedSchedules[existingIndex] = newSchedule;
      setSchedules(updatedSchedules);
    } else {
      setSchedules([...schedules, newSchedule]);
    }
    
    setSelectedEmployeeId('');
    setSelectedShiftIds([]);
  };

  const handleAnalyze = async () => {
    if (records.length === 0 || schedules.length === 0) {
      alert('请先导入打卡记录和排班字典');
      return;
    }
    
    try {
      const response = await attendanceService.triggerAnalysis({
        startDate: '2026-03-01',
        endDate: '2026-03-31'
      });
      
      if (response.success) {
        analyzeAnomalies();
        setActiveTab('anomalies');
        alert(response.message);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('分析失败，请重试');
    }
  };

  const filteredAnomalies = anomalies.filter(a => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (a.employeeName || '').toLowerCase().includes(query) || (a.employeeId || '').toLowerCase().includes(query);
  });

  const filteredSchedules = schedules.filter(s => {
    if (!scheduleSearchQuery.trim()) return true;
    const query = scheduleSearchQuery.toLowerCase();
    return (s.employeeName || '').toLowerCase().includes(query) || (s.employeeId || '').toLowerCase().includes(query);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
            <Clock className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
            考勤管理
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            导入打卡记录与排班字典，自动分析考勤异常
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'records' 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            打卡记录
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'schedules' 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            排班字典
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'shifts' 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            班次管理
          </button>
          <button
            onClick={() => setActiveTab('anomalies')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'anomalies' 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            异常分析
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden min-h-[500px]">
        {activeTab === 'records' && (
          <div className="p-6">
            {hasPermission(Permission.MANAGE_ATTENDANCE) && (
              <div className="mb-6">
                <div className="w-full max-w-2xl">
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">上传 Excel 文件</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    支持 .xls 和 .xlsx 格式。表头需包含：工号、姓名、日期、时间（或打卡时间）。
                  </p>
                  <div 
                    className={`border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center transition-colors ${isUploading ? 'bg-slate-50 dark:bg-slate-800/50 cursor-wait' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'}`}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet className={`w-10 h-10 mx-auto mb-3 ${isUploading ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`} />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {isUploading ? '正在上传并处理...' : '点击选择 Excel 文件'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">支持 .xls, .xlsx</p>
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

            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">已导入记录 ({records.length})</h3>
                {records.length > 0 && hasPermission(Permission.MANAGE_ATTENDANCE) && (
                  <button
                    onClick={() => setRecords([])}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    清空记录
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">工号</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">姓名</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">日期</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">时间</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {isLoading ? (
                      <TableSkeleton columns={4} rows={5} />
                    ) : records.slice(0, 50).map((record) => (
                      <tr key={record.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">{record.employeeId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">{record.employeeName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{record.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{record.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {records.length > 50 && (
                  <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                    仅显示前 50 条记录
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedules' && (
          <div className="p-6">
            {hasPermission(Permission.MANAGE_ATTENDANCE) && (
              <div className="mb-8 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">手动分配班次</h3>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 relative" ref={dropdownRef}>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">选择员工</label>
                    <div 
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer flex justify-between items-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      onClick={() => setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen)}
                      tabIndex={0}
                    >
                      <span className={selectedEmployeeId ? '' : 'text-slate-500'}>
                        {selectedEmployeeId ? users.find(u => u.id === selectedEmployeeId)?.name + ' (' + selectedEmployeeId + ')' : '-- 请选择员工 --'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                    
                    {isEmployeeDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 flex flex-col">
                        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              placeholder="搜索姓名或工号..."
                              value={employeeSearchQuery}
                              onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                          <div 
                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${!selectedEmployeeId ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                            onClick={() => {
                              setSelectedEmployeeId('');
                              setIsEmployeeDropdownOpen(false);
                              setEmployeeSearchQuery('');
                            }}
                          >
                            -- 请选择员工 --
                          </div>
                          {users.filter(u => 
                            u.name.toLowerCase().includes(employeeSearchQuery.toLowerCase()) || 
                            u.id.toLowerCase().includes(employeeSearchQuery.toLowerCase())
                          ).map(u => (
                            <div
                              key={u.id}
                              className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedEmployeeId === u.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                              onClick={() => {
                                setSelectedEmployeeId(u.id);
                                setIsEmployeeDropdownOpen(false);
                                setEmployeeSearchQuery('');
                              }}
                            >
                              {u.name} ({u.id})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">选择班次 (可多选)</label>
                    <div className="flex flex-wrap gap-3">
                      {shifts.map(s => (
                        <label key={s.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedShiftIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedShiftIds([...selectedShiftIds, s.id]);
                              } else {
                                setSelectedShiftIds(selectedShiftIds.filter(id => id !== s.id));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{s.name} ({s.startTime}-{s.endTime})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleAddManualSchedule}
                    disabled={!selectedEmployeeId || selectedShiftIds.length === 0}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform text-sm font-medium whitespace-nowrap flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    添加排班
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">已导入排班 ({schedules.length})</h3>
                <div className="flex items-center space-x-4 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索姓名或工号..."
                      value={scheduleSearchQuery}
                      onChange={(e) => setScheduleSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  {schedules.length > 0 && (
                    <button
                      onClick={() => setSchedules([])}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap"
                    >
                      清空排班
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">工号</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">姓名</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">班次</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {isLoading ? (
                      <TableSkeleton columns={4} rows={5} />
                    ) : filteredSchedules.slice(0, 50).map((schedule, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">{schedule.employeeId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">{schedule.employeeName}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                          {schedule.shiftIds ? schedule.shiftIds.map(id => {
                            const shift = shifts.find(s => s.id === id);
                            return shift ? <span key={id} className="inline-block bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded mr-2 mb-1">{shift.name}</span> : id;
                          }) : (schedule as any).shiftId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {hasPermission(Permission.MANAGE_ATTENDANCE) && (
                            <button
                              onClick={() => {
                                const newSchedules = [...schedules];
                                newSchedules.splice(idx, 1);
                                setSchedules(newSchedules);
                              }}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'anomalies' && (
          <div className="p-6 flex flex-col h-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center">
                {hasPermission(Permission.MANAGE_ATTENDANCE) && (
                  <button
                    onClick={handleAnalyze}
                    className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    一键分析异常
                  </button>
                )}
                {anomalies.length > 0 && (
                  <span className={`${hasPermission(Permission.MANAGE_ATTENDANCE) ? 'ml-4' : ''} text-sm text-slate-500 dark:text-slate-400`}>
                    共发现 <span className="font-bold text-red-500">{anomalies.length}</span> 条异常
                  </span>
                )}
              </div>
              
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索姓名或工号..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {anomalies.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">暂无异常数据</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  请先导入打卡记录和排班字典，然后点击"一键分析异常"
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">日期</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">工号</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">姓名</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">异常类型</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">描述</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {isLoading ? (
                      <TableSkeleton columns={5} rows={5} />
                    ) : filteredAnomalies.map((anomaly) => (
                      <tr key={anomaly.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">{anomaly.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{anomaly.employeeId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-200">{anomaly.employeeName}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            (anomaly.type || '').includes('LATE') ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                            (anomaly.type || '').includes('MISSING') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                          }`}>
                            {anomaly.type === 'LATE_5' && '迟到 > 5分'}
                            {anomaly.type === 'LATE_15' && '迟到 > 15分'}
                            {anomaly.type === 'MISSING_IN' && '上班缺卡'}
                            {anomaly.type === 'MISSING_OUT' && '下班缺卡'}
                            {anomaly.type === 'EARLY_LEAVE' && '早退'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{anomaly.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'shifts' && (
          <div className="p-6">
            {hasPermission(Permission.MANAGE_ATTENDANCE) && (
              <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">
                  {editingShift ? '编辑班次' : '添加新班次'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">班次名称</label>
                    <input
                      type="text"
                      value={editingShift ? editingShift.name : ''}
                      onChange={(e) => setEditingShift(prev => prev ? { ...prev, name: e.target.value } : { id: Math.random().toString(36).substr(2, 9), name: e.target.value, startTime: '09:00', endTime: '18:00' })}
                      placeholder="如: 早班, 晚班"
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">上班时间</label>
                    <input
                      type="time"
                      value={editingShift ? editingShift.startTime : '09:00'}
                      onChange={(e) => setEditingShift(prev => prev ? { ...prev, startTime: e.target.value } : { id: Math.random().toString(36).substr(2, 9), name: '', startTime: e.target.value, endTime: '18:00' })}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">下班时间</label>
                    <input
                      type="time"
                      value={editingShift ? editingShift.endTime : '18:00'}
                      onChange={(e) => setEditingShift(prev => prev ? { ...prev, endTime: e.target.value } : { id: Math.random().toString(36).substr(2, 9), name: '', startTime: '09:00', endTime: e.target.value })}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        if (!editingShift || !editingShift.name) return;
                        const existing = shifts.find(s => s.id === editingShift.id);
                        if (existing) {
                          updateShift(editingShift.id, editingShift);
                        } else {
                          addShift(editingShift);
                        }
                        setEditingShift(null);
                      }}
                      disabled={!editingShift || !editingShift.name}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform text-sm font-medium whitespace-nowrap flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      保存
                    </button>
                    {editingShift && (
                      <button
                        onClick={() => setEditingShift(null)}
                        className="px-4 py-2.5 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform text-sm font-medium whitespace-nowrap"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  提示：如果下班时间早于上班时间，系统会自动识别为跨天夜班。
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">班次名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">上班时间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">下班时间</th>
                    {hasPermission(Permission.MANAGE_ATTENDANCE) && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                  {isLoading ? (
                    <TableSkeleton columns={hasPermission(Permission.MANAGE_ATTENDANCE) ? 4 : 3} rows={5} />
                  ) : shifts.map((shift) => (
                    <tr key={shift.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-200">{shift.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{shift.startTime}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{shift.endTime}</td>
                      {hasPermission(Permission.MANAGE_ATTENDANCE) && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setEditingShift(shift)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('确定要删除这个班次吗？')) {
                                deleteShift(shift.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            删除
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {shifts.length === 0 && (
                    <tr>
                      <td colSpan={hasPermission(Permission.MANAGE_ATTENDANCE) ? 4 : 3} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        暂无班次数据，请添加
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
