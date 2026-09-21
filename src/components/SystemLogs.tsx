import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';
import {
  fetchAuditLogs,
  fetchAuditFacets,
  auditExportUrl,
  type AuditLevel,
  type AuditListResponse,
  type AuditFacets,
  type AuditQueryParams,
} from '@/services/auditApi';
import { describeSaveError } from '@/store/saveFailureCore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from './ui/EmptyState';
import { formatDateTime } from '@/utils/dateUtils';

const PAGE_SIZE = 50;

type Filters = Pick<Required<AuditQueryParams>, 'level' | 'category' | 'actor' | 'action' | 'result' | 'from' | 'to'>;

const INITIAL_FILTERS: Filters = {
  level: 'ALL',
  category: 'ALL',
  actor: 'ALL',
  action: 'ALL',
  result: 'ALL',
  from: '',
  to: '',
};

export default function SystemLogs() {
  const [data, setData] = useState<AuditListResponse | null>(null);
  const [facets, setFacets] = useState<AuditFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const patchFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(0);
  }, []);

  useEffect(() => {
    // 搜索词稳定下来后再回到第一页：与防抖赋值放在同一个定时器回调里，
    // 不再单开一个「观察到 query 变了再 setPage」的 effect（多一次渲染）
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    // 拉取前先把面板切到 loading：这是挂载/筛选变化时的初始化，不是「从渲染里派生状态」
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchAuditLogs({ ...filters, q: debouncedQuery, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setExpandedIds(new Set());
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeSaveError(err, '加载审计日志失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, debouncedQuery, page, reloadToken]);

  useEffect(() => {
    fetchAuditFacets()
      .then(setFacets)
      .catch(() => {
        /* 下拉可选项加载失败不阻塞列表 */
      });
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const a = document.createElement('a');
    a.href = auditExportUrl({ ...filters, q: debouncedQuery });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [filters, debouncedQuery]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  const getLevelIcon = (level: AuditLevel) => {
    switch (level) {
      case 'ERROR':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'WARN':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-brand-600" />;
    }
  };

  const getLevelBadge = (level: AuditLevel) => {
    switch (level) {
      case 'ERROR':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'WARN':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-400 border-brand-200 dark:border-brand-800';
    }
  };

  return (
    <div className="animate-in fade-in duration-400 h-full flex flex-col">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">审计日志</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            记录所有写操作与登录事件，只增不删{data ? `，保留期 ${data.retentionDays} 天` : ''}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="btn-secondary flex items-center px-3 py-2"
          title="按当前筛选条件导出 CSV（最多 10000 条）"
        >
          <Download className="w-4 h-4 mr-2" />
          导出 CSV
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="搜索操作、操作人、对象、详情、路径…"
                aria-label="搜索审计日志"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
              <Select value={filters.level} onValueChange={(v) => patchFilters({ level: v ?? "ALL" })}>
                <SelectTrigger className="w-[130px]" aria-label="按等级筛选">
                  <SelectValue placeholder="所有等级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有等级</SelectItem>
                  <SelectItem value="INFO">INFO</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.result} onValueChange={(v) => patchFilters({ result: v ?? "ALL" })}>
                <SelectTrigger className="w-[120px]" aria-label="按结果筛选">
                  <SelectValue placeholder="所有结果" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有结果</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failure">失败</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.category} onValueChange={(v) => patchFilters({ category: v ?? "ALL" })}>
              <SelectTrigger className="w-[150px]" aria-label="按分类筛选">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部分类</SelectItem>
                {(facets?.categories ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.action} onValueChange={(v) => patchFilters({ action: v ?? "ALL" })}>
              <SelectTrigger className="w-[160px]" aria-label="按操作筛选">
                <SelectValue placeholder="全部操作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部操作</SelectItem>
                {(facets?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.actor} onValueChange={(v) => patchFilters({ actor: v ?? "ALL" })}>
              <SelectTrigger className="w-[150px]" aria-label="按操作人筛选">
                <SelectValue placeholder="全部操作人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部操作人</SelectItem>
                {(facets?.actors ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => patchFilters({ from: e.target.value })}
              className="w-[150px]"
              aria-label="起始日期"
            />
            <span className="text-sm text-zinc-400">至</span>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => patchFilters({ to: e.target.value })}
              className="w-[150px]"
              aria-label="结束日期"
            />
            <button
              onClick={() => {
                setFilters(INITIAL_FILTERS);
                setSearchQuery('');
                setPage(0);
              }}
              className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 px-2"
            >
              重置
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-0">
          {error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 px-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
              <button onClick={() => setReloadToken((t) => t + 1)} className="text-sm text-brand-600 dark:text-brand-400">
                重试
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mb-4"></div>
              <p>加载中…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <EmptyState title="暂无日志记录" description="没有找到符合条件的审计记录" icon={Info} />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-10">
                <tr>
                  {['时间', '等级', '分类 / 操作', '操作人', '对象', '结果', '详情'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                {items.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors align-top">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                      {formatDateTime(log.at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getLevelBadge(log.level)}`}
                      >
                        {getLevelIcon(log.level)}
                        <span className="ml-1">{log.level}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-zinc-500 dark:text-zinc-400 text-xs">{log.category}</div>
                      <div className="text-zinc-900 dark:text-zinc-200 font-medium">{log.action}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-zinc-900 dark:text-zinc-200">{log.actor || '-'}</div>
                      <div className="text-zinc-500 dark:text-zinc-400 text-xs">{log.actorRole}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm max-w-[220px]">
                      <div className="text-zinc-500 dark:text-zinc-400 text-xs">{log.targetType || '-'}</div>
                      <div className="text-zinc-900 dark:text-zinc-200 truncate" title={log.targetName || log.targetId}>
                        {log.targetName || log.targetId || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          log.result === 'success'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
                        }`}
                      >
                        {log.result === 'success' ? '成功' : '失败'} {log.status}
                      </span>
                      <div className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">{log.durationMs} ms</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-200 min-w-[200px]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-zinc-500 dark:text-zinc-400 text-xs break-all">{log.detail || `${log.method} ${log.path}`}</div>
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="flex items-center text-xs text-brand-600 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300 whitespace-nowrap transition-colors"
                        >
                          {expandedIds.has(log.id) ? (
                            <>
                              收起
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </>
                          ) : (
                            <>
                              展开
                              <ChevronRight className="w-3 h-3 ml-1" />
                            </>
                          )}
                        </button>
                      </div>
                      {expandedIds.has(log.id) && (
                        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 font-mono bg-zinc-50 dark:bg-zinc-900 p-3 rounded border border-zinc-100 dark:border-zinc-700 overflow-x-auto whitespace-pre-wrap break-all space-y-1">
                          <div>{`${log.method} ${log.path}`}</div>
                          {log.ip && <div>IP：{log.ip}</div>}
                          {log.changes && log.changes.length > 0 && <div>变更字段：{log.changes.join('、')}</div>}
                          {log.before != null && <div>before：{JSON.stringify(log.before)}</div>}
                          {log.after != null && <div>after：{JSON.stringify(log.after)}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            共 {total} 条{from > 0 ? `，显示第 ${from}–${to} 条` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              上一页
            </Button>
            <span className="tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
