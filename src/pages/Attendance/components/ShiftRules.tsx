import { CalendarClock, Info, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/hooks/useConfirm';
import { useDepartmentStore } from '@/store/useDepartmentStore';
import { useUserStore as useAuthStore } from '@/store/useUserStore';
import { attendanceApi, type DeptShiftRule, type EffectiveRulesView } from '@/services/attendanceApi';

const WORKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

function workdayText(workdays: number[]): string {
  const sorted = [...new Set(workdays)].filter((w) => w >= 1 && w <= 7).sort((a, b) => a - b);
  if (sorted.length === 7) return '每天';
  if (sorted.join() === '1,2,3,4,5') return '周一至周五';
  if (sorted.join() === '1,2,3,4,5,6') return '周一至周六';
  if (sorted.join() === '6,7') return '周六、周日';
  return sorted.map((w) => `周${WORKDAYS.find((d) => d.value === w)?.label}`).join('、') || '未设置';
}

/** 把部门树摊平成带缩进的下拉选项（配置面板要能选到任意层级） */
function flattenDepartments(
  nodes: { id: string; name: string; children?: { id: string; name: string; children?: unknown }[] }[],
  depth = 0,
  out: { id: string; label: string }[] = []
): { id: string; label: string }[] {
  for (const node of nodes) {
    out.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name}` });
    if (node.children?.length) flattenDepartments(node.children as never, depth + 1, out);
  }
  return out;
}

type DraftRule = { id?: string; departmentId: string; name: string; startTime: string; endTime: string; workdays: number[] };

/**
 * 部门工作时段：按打卡时间自动对班的配置面（N1 判定层）。
 *
 * 一张表管所有部门的时段；未配置的部门沿组织树向上取第一个配了时段的祖先部门，
 * 所以通常只需要在二级部门（或集团）上配一次。判定说明里会写清用的是哪个部门的时段。
 */
export default function ShiftRules() {
  const [rules, setRules] = useState<DeptShiftRule[] | null>(null);
  const [draft, setDraft] = useState<DraftRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [probeDepartment, setProbeDepartment] = useState('');
  const [effective, setEffective] = useState<EffectiveRulesView | null>(null);
  const confirm = useConfirm();

  const departmentTree = useDepartmentStore((state) => state.departments);
  const fetchDepartments = useDepartmentStore((state) => state.fetchDepartments);
  const departmentsReady = useDepartmentStore((state) => state.initialized);
  // 与服务端同一档（/attendance 写操作默认 HR+）；开关关闭时 hasPermission 恒真，真门槛仍在服务端
  const canManage = useAuthStore((state) => state.hasPermission)('attendance:manage');

  const optionList = useMemo(() => flattenDepartments(departmentTree as never), [departmentTree]);

  const load = useCallback(async () => {
    try {
      setRules(await attendanceApi.fetchShiftRules());
    } catch (e) {
      toast.error(`读取部门时段失败：${e instanceof Error ? e.message : String(e)}`);
      setRules([]);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!departmentsReady) void fetchDepartments();
  }, [load, departmentsReady, fetchDepartments]);

  useEffect(() => {
    if (!probeDepartment) {
      setEffective(null);
      return;
    }
    let cancelled = false;
    attendanceApi
      .fetchEffectiveRules(probeDepartment)
      .then((view) => {
        if (!cancelled) setEffective(view);
      })
      .catch(() => {
        if (!cancelled) setEffective(null);
      });
    return () => {
      cancelled = true;
    };
  }, [probeDepartment]);

  const onSave = async () => {
    if (!draft) return;
    if (!draft.departmentId) {
      toast.error('请选择部门');
      return;
    }
    if (!draft.name.trim()) {
      toast.error('请填写时段名称，例如「正常班」');
      return;
    }
    if (draft.startTime >= draft.endTime) {
      toast.error('下班时间必须晚于上班时间（暂不支持跨夜班）');
      return;
    }
    if (draft.workdays.length === 0) {
      toast.error('至少选择一个工作日');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await attendanceApi.updateShiftRule(draft.id, {
          departmentId: draft.departmentId,
          name: draft.name,
          startTime: draft.startTime,
          endTime: draft.endTime,
          workdays: draft.workdays,
        });
      } else {
        await attendanceApi.createShiftRule({
          departmentId: draft.departmentId,
          name: draft.name,
          startTime: draft.startTime,
          endTime: draft.endTime,
          workdays: draft.workdays,
        });
      }
      await load();
      setDraft(null);
      toast.success('部门时段已保存，下次异常分析即按新时段对班');
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (rule: DeptShiftRule) => {
    const ok = await confirm({
      title: `删除「${rule.departmentName || '部门'} · ${rule.name}」？`,
      description: '该部门若无其它时段，员工会退回上一级部门的时段或逐日排班口径。',
      confirmText: '删除',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await attendanceApi.deleteShiftRule(rule.id);
      await load();
      toast.success('时段已删除');
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">部门工作时段</h2>
          <p className="text-xs text-muted-foreground mt-1">
            不用逐日排班：按当天首卡时间在该部门的时段里自动对班，对不上就不判定（异常分析页会列出原因）。
            未配置的部门自动沿用组织树上级部门的时段。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={probeDepartment}
            onValueChange={(v) => setProbeDepartment(String(v))}
          >
            <SelectTrigger aria-label="试算部门生效时段" className="w-48">
              <SelectValue placeholder="试算某部门实际生效的时段" />
            </SelectTrigger>
            <SelectContent>
              {optionList.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() =>
              setDraft({ departmentId: optionList[0]?.id ?? '', name: '', startTime: '09:00', endTime: '18:00', workdays: [1, 2, 3, 4, 5] })
            }
            disabled={!canManage || optionList.length === 0}
            title={optionList.length === 0 ? '部门树还没加载好' : undefined}
          >
            <Plus className="h-4 w-4 mr-2" />
            新增时段
          </Button>
        </div>
      </div>

      {effective && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground mb-4 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 p-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span>
            {effective.rules.length === 0
              ? '该部门及其上级都没有配置时段，员工会退回逐日排班口径（没有排班则不参与异常判定）。'
              : `生效时段 ${effective.rules.length} 条${effective.inherited ? `，继承自「${effective.sourceDepartmentName}」（向上 ${effective.depth} 级）` : `，来自本部门`}：${effective.rules
                  .map((r) => `${r.name} ${r.startTime}-${r.endTime}`)
                  .join('；')}`}
          </span>
        </p>
      )}

      {!rules ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          加载中…
        </p>
      ) : rules.length === 0 ? (
        <EmptyState
          title="还没有配置部门工作时段"
          icon={CalendarClock}
          description="配好时段后，异常分析就不再依赖逐日排班：员工几点上班按打卡时间对班决定。"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full divide-y divide-zinc-100 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60">
              <tr>
                {['部门', '时段名称', '上班', '下班', '工作日', '操作'].map((label) => (
                  <th
                    key={label}
                    className={`px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider ${label === '操作' ? 'text-right' : 'text-left'}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-700/30 transition-colors">
                  <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100">
                    {rule.departmentName || <span className="text-muted-foreground">（部门已删除）</span>}
                  </td>
                  <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100">{rule.name}</td>
                  <td className="px-4 py-2 text-sm tabular-nums text-zinc-900 dark:text-zinc-100">{rule.startTime}</td>
                  <td className="px-4 py-2 text-sm tabular-nums text-zinc-900 dark:text-zinc-100">{rule.endTime}</td>
                  <td className="px-4 py-2 text-sm">
                    <Badge variant="neutral">{workdayText(rule.workdays)}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {canManage ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDraft({ ...rule })}
                          aria-label={`编辑 ${rule.departmentName} ${rule.name}`}
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void onDelete(rule)}
                          aria-label={`删除 ${rule.departmentName} ${rule.name}`}
                          title="删除"
                          className="hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">只读</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BaseModal
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '编辑部门时段' : '新增部门时段'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button onClick={() => void onSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              保存
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">部门</span>
              <Select value={draft.departmentId} onValueChange={(v) => setDraft({ ...draft, departmentId: String(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {optionList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                时段名称<span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
              </span>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如 正常班 / 早班"
                maxLength={20}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">上班时间</span>
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  className="dark:[color-scheme:dark]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">下班时间</span>
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                  className="dark:[color-scheme:dark]"
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">工作日（这些天有卡才判定，其余视为休息日）</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {WORKDAYS.map((w) => {
                  const checked = draft.workdays.includes(w.value);
                  return (
                    <label key={w.value} className="flex items-center gap-1.5 text-sm pr-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          setDraft({
                            ...draft,
                            workdays: next
                              ? [...draft.workdays, w.value].sort((a, b) => a - b)
                              : draft.workdays.filter((v) => v !== w.value),
                          })
                        }
                        className="border-zinc-300 dark:border-zinc-600"
                        aria-label={`周${w.label}`}
                      />
                      周{w.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              同一部门可以配多条时段（例如 8:00-17:00 与 9:00-18:00 并存），判定时取与首卡最接近的那条。
            </p>
          </div>
        )}
      </BaseModal>
    </div>
  );
}
