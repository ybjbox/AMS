import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus, RefreshCw, Trash2, Pin } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { announcementApi, type Announcement } from '@/services/announcementApi';

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 公告管理（ADMIN）：发布 / 停启 / 删除 */
export default function AnnouncementsPanel() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'normal' as 'normal' | 'important',
    expiresAt: '',
    notifyAll: false,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await announcementApi.listAll());
    } catch (e) {
      toast.error(errText(e, '公告加载失败'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.title.trim()) return;
      setSubmitting(true);
      try {
        await announcementApi.create({
          title: form.title.trim(),
          content: form.content.trim(),
          priority: form.priority,
          expiresAt: form.expiresAt || undefined,
          notifyAll: form.notifyAll,
        });
        toast.success('公告已发布');
        setForm({ title: '', content: '', priority: 'normal', expiresAt: '', notifyAll: false });
        await load();
      } catch (err) {
        toast.error(errText(err, '发布失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [form, load]
  );

  const handleToggle = useCallback(
    async (item: Announcement) => {
      try {
        await announcementApi.update(item.id, { active: item.active ? 0 : 1 });
        toast.success(item.active ? '已停用' : '已启用');
        await load();
      } catch (err) {
        toast.error(errText(err, '操作失败'));
      }
    },
    [load]
  );

  const handleDelete = useCallback(
    async (item: Announcement) => {
      const ok = await confirm({
        title: '删除该公告？',
        description: `「${item.title}」删除后无法恢复。`,
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await announcementApi.remove(item.id);
        toast.success('已删除');
        await load();
      } catch (err) {
        toast.error(errText(err, '删除失败'));
      }
    },
    [confirm, load]
  );

  return (
    <div className="h-full p-6 flex flex-col min-h-0 gap-5 overflow-y-auto">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center">
            <Megaphone className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
            公告管理
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            发布的公告将展示在全员控制台「系统公告」区（重要公告置顶）
          </p>
        </div>
        <button onClick={() => void load()} disabled={isLoading} className="btn-secondary" aria-label="刷新公告列表">
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">刷新</span>
        </button>
      </div>

      {/* 发布表单 */}
      <form onSubmit={handleCreate} className="card-base p-5 space-y-4 shrink-0">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-zinc-400" /> 发布新公告
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">标题 <span className="text-red-500" aria-hidden="true">*</span></span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="公告标题"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">有效期（可选）</span>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">正文</span>
          <textarea
            rows={3}
            maxLength={5000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="公告内容（可选）"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-white resize-y"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.priority === 'important'}
              onChange={(e) => setForm({ ...form, priority: e.target.checked ? 'important' : 'normal' })}
              className="size-4 shrink-0 rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600"
            />
            重要公告（置顶显示）
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notifyAll}
              onChange={(e) => setForm({ ...form, notifyAll: e.target.checked })}
              className="size-4 shrink-0 rounded border-zinc-200/80 dark:border-zinc-600 text-blue-600 focus:ring-blue-600"
            />
            同时通知全员
          </label>
          <div className="flex-1" />
          <button
            type="submit"
            disabled={submitting || !form.title.trim()}
            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? '发布中…' : '发布公告'}
          </button>
        </div>
      </form>

      {/* 公告列表 */}
      <div className="card-base flex-1 min-h-[200px] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-700 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">全部公告（{items.length}）</h3>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-sm text-zinc-400 dark:text-zinc-500">加载中…</div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 py-12">
              <Megaphone className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" aria-hidden="true" />
              暂无公告，发布第一条吧
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.priority === 'important' && (
                        <Pin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-label="重要" />
                      )}
                      <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{item.title}</span>
                      {!item.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">已停用</span>
                      )}
                    </div>
                    {item.content && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{item.content}</p>
                    )}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">
                      {item.publisher} 发布于 {formatTime(item.createdAt)}
                      {item.expiresAt ? ` · 有效至 ${item.expiresAt}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void handleToggle(item)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    >
                      {item.active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => void handleDelete(item)}
                      className="p-2 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label={`删除公告：${item.title}`}
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
