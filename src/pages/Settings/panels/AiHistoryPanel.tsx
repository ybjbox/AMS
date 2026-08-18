import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Eye, X, MessagesSquare, User as UserIcon, Clock } from 'lucide-react';
import { STORAGE_KEYS } from '@/config/constants';

/**
 * AI 对话历史（仅超级管理员可见）。
 * 用于审计 / 合规：列出全员会话，可查看任意对话详情、删除任意对话。
 * 所有读写都走 /api/ai/admin/* 超管专用端点（后端强制 SUPER_ADMIN）。
 */

interface AdminConvMeta {
  id: string;
  username: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface AdminConvDetail extends AdminConvMeta {
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: string;
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

function fmt(ts: string): string {
  if (!ts) return '';
  // 数据库存的是 localtime 文本，直接展示；长度不足则原样返回
  return ts.replace('T', ' ').slice(0, 19);
}

export default function AiHistoryPanel() {
  const [list, setList] = useState<AdminConvMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [detail, setDetail] = useState<AdminConvDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/ai/admin/conversations', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((j: AdminConvMeta[]) => setList(Array.isArray(j) ? j : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await fetch(`/api/ai/admin/conversations/${id}`, { headers: authHeaders() });
      if (r.ok) setDetail((await r.json()) as AdminConvDetail);
    } catch {
      /* 忽略 */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('确认删除这条对话？此操作不可撤销，会从该用户账户中移除。')) return;
      setDeletingId(id);
      try {
        await fetch(`/api/ai/admin/conversations/${id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (detail?.id === id) setDetail(null);
        load();
      } catch {
        /* 忽略 */
      } finally {
        setDeletingId(null);
      }
    },
    [detail, load]
  );

  const clearAll = useCallback(async () => {
    if (!window.confirm('确认清空全部 AI 对话记录？此操作不可撤销，将删除所有用户的全部对话。')) return;
    if (!window.confirm('再次确认：所有用户的 AI 对话都将被永久删除，无法恢复。')) return;
    setClearingAll(true);
    try {
      const r = await fetch('/api/ai/admin/conversations', {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (r.ok) {
        setDetail(null);
        load();
      }
    } catch {
      /* 忽略 */
    } finally {
      setClearingAll(false);
    }
  }, [load]);

  const filtered = list.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      c.username.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 space-y-5">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <MessagesSquare className="size-5 text-primary" />
          AI 对话历史（审计）
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          查看全员 AI 助手对话记录，便于合规审计与问题追溯。仅超级管理员可见。
        </p>
      </div>

      {/* 搜索 + 统计 */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按用户名或对话标题筛选…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border/80 dark:border-border rounded-lg bg-muted dark:bg-background text-foreground focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all duration-200"
          />
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          共 {list.length} 条对话 {query && `· 匹配 ${filtered.length} 条`}
        </div>
        <button
          type="button"
          onClick={clearAll}
          disabled={clearingAll || list.length === 0}
          className="text-destructive border border-destructive/40 hover:bg-destructive/10 px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="清空全部对话"
        >
          <Trash2 className="size-4" />
          {clearingAll ? '清空中…' : '清空全部'}
        </button>
        <button
          type="button"
          onClick={load}
          className="btn-secondary text-sm px-3 py-2"
        >
          刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            暂无对话记录
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openDetail(c.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <UserIcon className="size-3.5" />
                      {c.username}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {c.title || '（无标题）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MessagesSquare className="size-3.5" />
                      {c.messageCount} 条消息
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {fmt(c.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openDetail(c.id)}
                  className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1"
                  title="查看详情"
                >
                  <Eye className="size-3.5" />
                  查看
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={deletingId === c.id}
                  className="text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-xs transition-colors"
                  title="删除对话"
                >
                  <Trash2 className="size-3.5" />
                  {deletingId === c.id ? '删除中' : '删除'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 详情抽屉 */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg h-full bg-card shadow-xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">
                  {detail.title || '（无标题）'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  用户 {detail.username} · 更新于 {fmt(detail.updatedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="ml-3 p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                title="关闭"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {detailLoading ? (
                <div className="text-sm text-muted-foreground">加载详情…</div>
              ) : detail.messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">该对话暂无消息</div>
              ) : (
                detail.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 text-sm ${
                      m.role === 'user'
                        ? 'bg-primary/10 text-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {m.role === 'user' ? '用户' : 'AI 助手'}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => remove(detail.id)}
                disabled={deletingId === detail.id}
                className="btn-secondary text-sm px-3 py-2 inline-flex items-center gap-1.5 text-destructive"
              >
                <Trash2 className="size-4" />
                {deletingId === detail.id ? '删除中…' : '删除此对话'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
