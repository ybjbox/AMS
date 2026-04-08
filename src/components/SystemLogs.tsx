import React, { useState, useCallback, useMemo } from 'react';
import { useLogStore, LogLevel } from '../store/logs';
import { AlertCircle, AlertTriangle, Info, Trash2, Search, Filter, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from './ui/EmptyState';

export default function SystemLogs() {
  const logs = useLogStore(state => state.logs);
  const clearLogs = useLogStore(state => state.clearLogs);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
      const matchesSearch = 
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.source && log.source.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesLevel && matchesSearch;
    });
  }, [logs, filterLevel, searchQuery]);

  const getLevelIcon = useCallback((level: LogLevel) => {
    switch (level) {
      case 'ERROR': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'WARN': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'INFO': return <Info className="w-4 h-4 text-blue-600" />;
    }
  }, []);

  const getLevelBadge = useCallback((level: LogLevel) => {
    switch (level) {
      case 'ERROR': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'WARN': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      case 'INFO': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
  }, []);

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-slate-900 dark:text-white">系统日志</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">查看和分析系统运行日志</p>
        </div>
        <button
          onClick={clearLogs}
          className="flex items-center px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          清空日志
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索日志内容、来源或详情..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200/80 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select
              value={filterLevel}
              onValueChange={(value) => setFilterLevel(value as LogLevel | 'ALL')}
            >
              <SelectTrigger className="w-[180px] text-sm border border-zinc-200/80 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200">
                <SelectValue placeholder="所有等级">
                  {(val) => val === 'ALL' ? '所有等级' : val === 'INFO' ? 'INFO (信息)' : val === 'WARN' ? 'WARN (警告)' : val === 'ERROR' ? 'ERROR (错误)' : '所有等级'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有等级</SelectItem>
                <SelectItem value="INFO">INFO (信息)</SelectItem>
                <SelectItem value="WARN">WARN (警告)</SelectItem>
                <SelectItem value="ERROR">ERROR (错误)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-0">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <EmptyState
                title="暂无日志记录"
                description="没有找到符合条件的日志记录"
                icon={Info}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-48">
                    时间
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">
                    等级
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">
                    来源
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    内容
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getLevelBadge(log.level)}`}>
                        {getLevelIcon(log.level)}
                        <span className="ml-1">{log.level}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                      {log.source || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="font-medium">{log.message}</div>
                        {log.details && (
                          <button
                            onClick={() => toggleExpand(log.id)}
                            className="flex items-center text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap transition-colors"
                          >
                            {expandedLogs.has(log.id) ? (
                              <>
                                收起详情
                                <ChevronDown className="w-3 h-3 ml-1" />
                              </>
                            ) : (
                              <>
                                展开详情
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {log.details && expandedLogs.has(log.id) && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-100 dark:border-slate-700 overflow-x-auto whitespace-pre-wrap">
                          {log.details}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
