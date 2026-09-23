import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw, Server, AlertTriangle, Clock } from 'lucide-react';
import { notifySaveFailure } from '@/store/saveFailure';
import { fetchDiagnostics, type DiagnosticsResponse } from '@/services/systemApi';

/** 秒 → 人类可读运行时长 */
function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h < 24) return `${h} 小时 ${m} 分钟`;
  const d = Math.floor(h / 24);
  return `${d} 天 ${h % 24} 小时`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** 关键表中文名（与 server/systemRouter.ts COUNT_TABLES 对应；未收录的表回退显示原始名） */
const TABLE_LABELS: Record<string, string> = {
  employees: '员工档案',
  accounts: '登录账号',
  sessions: '在线会话',
  audit_logs: '操作日志',
  security_events: '安全事件',
  punch_records: '打卡记录',
  todos: '待办事项',
  notifications: '系统通知',
  approvals: '审批单',
  documents: '文档资料',
};

/** 运行诊断：进程健康 + 访问日志汇总 + 最近慢请求/错误（数据源 = 内存环形缓冲） */
export default function DiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchDiagnostics());
    } catch (err) {
      notifySaveFailure({ title: '读取运行诊断失败', error: err });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusColor =
    data?.health.status === 'ok'
      ? 'text-brand-700 dark:text-brand-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="h-full p-6 flex flex-col min-h-0 gap-4 overflow-y-auto">
      {/* 头部：标题 + 刷新 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center">
            <Activity className="w-4 h-4 mr-2 text-brand-600 dark:text-brand-400" />
            运行诊断
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            进程健康与访问日志汇总（内存窗口，最近 {(data?.accessLog.capacity ?? 200)} 条；重启后清空属预期）
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn-secondary"
          aria-label="刷新诊断数据"
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">刷新</span>
        </button>
      </div>

      {/* 健康卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="card-base p-4">
          <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <Server className="w-3.5 h-3.5 mr-1.5" /> 服务状态
          </div>
          <div className={`text-lg font-bold ${statusColor}`} data-testid="diag-status">
            {data ? (data.health.status === 'ok' ? '正常' : '降级') : '—'}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            运行 {data ? formatUptime(data.health.uptimeSec) : '—'}
          </div>
        </div>

        <div className="card-base p-4">
          <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <Database className="w-3.5 h-3.5 mr-1.5" /> 数据库
          </div>
          <div className={`text-lg font-bold ${data?.health.db === 'up' ? 'text-brand-700 dark:text-brand-400' : 'text-red-600'}`} data-testid="diag-db">
            {data ? (data.health.db === 'up' ? '在线' : '离线') : '—'}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            v{data?.health.version ?? '—'}
          </div>
        </div>

        <div className="card-base p-4">
          <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> 内存占用
          </div>
          <div className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums" data-testid="diag-mem">
            {data ? `${data.health.memHeapMB} MB` : '—'}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            RSS {data?.health.memRssMB ?? '—'} MB
          </div>
        </div>

        <div className="card-base p-4">
          <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> 请求异常
          </div>
          <div className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums" data-testid="diag-errors">
            {data ? data.accessLog.errors : '—'}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            慢请求 {data?.accessLog.slow ?? '—'}（阈值 {data?.accessLog.slowThresholdMs ?? '—'}ms）
          </div>
        </div>
      </div>

      {/* 最近异常请求：固定高度 + 内部滚动（此前 flex-1 在页面级滚动容器里会塌缩成一行高） */}
      <div className="card-base flex flex-col shrink-0 h-80">
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            最近异常请求（{data?.recent.length ?? 0}）
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            报错（状态码 ≥400）或超时（&gt;{data?.accessLog.slowThresholdMs ?? 1000}ms）的接口请求，红色=服务端错误，橙色=客户端错误/慢请求
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" tabIndex={0} role="region" aria-label="最近异常请求（可滚动）">
          {data && data.recent.length > 0 ? (
            <table className="w-full text-left text-sm" aria-label="最近异常请求">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">时间</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">方法</th>
                  <th className="px-3 py-2 font-medium w-full">路径</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">状态</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">耗时</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">操作者</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((e, i) => (
                  <tr key={`${e.ts}-${i}`} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">{formatTime(e.ts)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 font-mono text-xs">{e.method}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 font-mono text-xs">
                      <div className="truncate" title={e.path}>{e.path}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <span className={e.status >= 500 ? 'text-red-600 dark:text-red-400 font-medium' : e.status >= 400 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-zinc-500 dark:text-zinc-400'}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                      {e.durationMs}ms{e.slow && <span className="ml-1.5 text-3xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">慢</span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{e.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 py-12">
              <Activity className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" aria-hidden="true" />
              {loading ? '加载中…' : '暂无异常请求记录（一切正常）'}
            </div>
          )}
        </div>
      </div>

      {/* 数据概况 */}
      {data && (
        <div className="card-base p-4 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">数据概况</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
            各模块当前的记录条数；某项为 0 或「—」通常意味着对应功能没有数据或读取失败。
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {Object.entries(data.tableCounts).map(([table, count]) => (
              <div key={table} className="text-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <div className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{count < 0 ? '—' : `${count} 条`}</div>
                <div className="text-2xs text-zinc-500 dark:text-zinc-400 truncate" title={table}>{TABLE_LABELS[table] ?? table}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
