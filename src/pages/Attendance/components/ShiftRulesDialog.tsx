import { CalendarClock, Info, Loader2, Pencil, Plus, Trash2, CornerDownRight, Building2 } from 'lucide-react';
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
import { useAttendanceStore } from '@/store/useAttendanceStore';
import { useUserStore as useAuthStore } from '@/store/useUserStore';
import { attendanceApi, type DeptShiftRule } from '@/services/attendanceApi';
import { buildDeptRuleTree, treeStats } from '../lib/deptRuleTree';
import type { DeptRuleNode } from '../lib/deptRuleTree';
import type { DepartmentNode } from '@/types/department';

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

/** 跨日班次：下班时间不晚于上班时间（16:00–00:00 的 24 点班、17:30–01:00 的夜班） */
function crossesMidnight(rule: Pick<DeptShiftRule, 'startTime' | 'endTime'>): boolean {
  return rule.endTime <= rule.startTime;
}

function flattenDepartments(
  nodes: DepartmentNode[],
  depth = 0,
  out: { id: string; label: string }[] = []
): { id: string; label: string }[] {
  for (const node of nodes) {
    out.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name}` });
    if (node.children?.length) flattenDepartments(node.children, depth + 1, out);
  }
  return out;
}

type DraftRule = {
  id?: string;
  departmentId: string;
  name: string;
  startTime: string;
  endTime: string;
  workdays: number[];
  assumeMissingIn: boolean;
  overtimeGraceMinutes: number;
};

const DEFAULT_GRACE = 120;
const MATCH_TOLERANCE_MINUTES = 180;

function emptyDraft(departmentId: string): DraftRule {
  return {
    departmentId,
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    workdays: [1, 2, 3, 4, 5],
    assumeMissingIn: false,
    overtimeGraceMinutes: DEFAULT_GRACE,
  };
}

export interface ShiftRulesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 部门工作时段：按组织架构呈现的配置面。
 *
 * 从主标签里搬进弹窗，是因为它不是日常要盯的东西 —— 时段配好后基本不动，
 * 而主标签每天都要看。搬进来之后主标签只剩「打卡记录 / 异常分析 / 月度报表」三个。
 *
 * 呈现按部门树而不是平铺表：时段是部门属性，判定规则又是"没配就沿用上级"，
 * 平铺成一张表之后，最关键的信息（谁在继承谁）就看不见了。
 */
export default function ShiftRulesDialog({ isOpen, onClose }: ShiftRulesDialogProps) {
  const [rules, setRules] = useState<DeptShiftRule[] | null>(null);
  const [draft, setDraft] = useState<DraftRule | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const departmentTree = useDepartmentStore((state) => state.departments);
  const fetchDepartments = useDepartmentStore((state) => state.fetchDepartments);
  const departmentsReady = useDepartmentStore((state) => state.initialized);
  const canManage = useAuthStore((state) => state.hasPermission)('attendance:manage');
  // 顶部流程条与统计卡都读 store 里的时段条数，改完要回读才同步
  const syncShiftRulesToStore = useAttendanceStore((state) => state.fetchShiftRules);

  const optionList = useMemo(() => flattenDepartments(departmentTree), [departmentTree]);
  const tree = useMemo(() => buildDeptRuleTree(departmentTree, rules ?? []), [departmentTree, rules]);
  const stats = useMemo(() => treeStats(tree), [tree]);

  const load = useCallback(async () => {
    try {
      setRules(await attendanceApi.fetchShiftRules());
    } catch (e) {
      toast.error(`读取部门时段失败：${e instanceof Error ? e.message : String(e)}`);
      setRules([]);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
    if (!departmentsReady) void fetchDepartments();
  }, [isOpen, load, departmentsReady, fetchDepartments]);

  const onSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('请填写时段名称，例如「正常班」');
      return;
    }
    if (draft.startTime === draft.endTime) {
      toast.error('上班时间与下班时间相同，请填一天的两个时点');
      return;
    }
    if (draft.workdays.length === 0) {
      toast.error('至少选择一个工作日');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        departmentId: draft.departmentId,
        name: draft.name,
        startTime: draft.startTime,
        endTime: draft.endTime,
        workdays: draft.workdays,
        assumeMissingIn: draft.assumeMissingIn,
        overtimeGraceMinutes: draft.overtimeGraceMinutes,
      };
      if (draft.id) await attendanceApi.updateShiftRule(draft.id, payload);
      else await attendanceApi.createShiftRule(payload);
      await load();
      void syncShiftRulesToStore();
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
      description: '该部门若无其它时段，员工会沿用上一级部门的时段；再没有就不参与异常判定。',
      confirmText: '删除',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await attendanceApi.deleteShiftRule(rule.id);
      await load();
      void syncShiftRulesToStore();
      toast.success('时段已删除');
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="4xl" title="部门工作时段" bodyClassName="p-0">
        <div className="px-5 pt-4">
          <p className="flex items-start gap-2 text-2xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>
              系统按当天第一次打卡的时间，自动对上该部门的工作时段；对不上就不判定（原因会在「异常分析」页列出）。
              没配时段的部门，沿组织树向上找第一个配了时段的祖先部门。支持三班倒与跨午夜交接。
            </span>
          </p>
          {rules && rules.length > 0 && (
            <p className="mt-2 text-2xs text-muted-foreground tabular-nums">
              共 {stats.rules} 条，配在 {stats.departments} 个部门
              {stats.uncovered > 0 && (
                <span className="text-amber-700 dark:text-amber-400">；另有 {stats.uncovered} 个部门整条链上都没有时段，不参与异常判定</span>
              )}
            </p>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {!rules ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              加载中…
            </p>
          ) : rules.length === 0 ? (
            <EmptyState
              title="还没有配置部门工作时段"
              icon={CalendarClock}
              description="配好时段后，系统按打卡时间自动对班并判定异常。点部门右侧的 + 给它加第一条。"
            />
          ) : (
            <>
              <ul className="space-y-0.5">
                {tree.roots.map((n) => (
                  <DeptRow key={n.department.id} node={n} depth={0} canManage={canManage} onAdd={setDraft} onEdit={setDraft} onDelete={onDelete} />
                ))}
              </ul>
              {tree.orphaned.length > 0 && (
                <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-2xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  另有 {tree.orphaned.length} 条时段挂在已删除的部门上（{tree.orphaned.map((r) => r.departmentName || r.departmentId).join('、')}），
                  不会生效。要清理请到部门管理里查历史，或直接在此删除。
                </p>
              )}
            </>
          )}
        </div>
      </BaseModal>

      {/* 时段编辑：作为二级弹窗叠在上面 */}
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
                <SelectTrigger aria-label="部门" className="w-full">
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
                时段名称<span className="ml-0.5 text-red-600 dark:text-red-400" aria-hidden="true">*</span>
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
                    <label key={w.value} className="flex items-center gap-1.5 pr-2 text-sm">
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
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">特殊情况处理（可选，默认关）</span>
              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="sr-assume-missing-in"
                    checked={draft.assumeMissingIn}
                    onCheckedChange={(next) => setDraft({ ...draft, assumeMissingIn: next === true })}
                    className="mt-0.5 border-zinc-300 dark:border-zinc-600"
                  />
                  <span className="text-sm leading-snug">
                    上班卡没打时，记「缺上班卡」
                    <span className="block text-2xs text-muted-foreground">
                      不勾：上班时间过去 {MATCH_TOLERANCE_MINUTES} 分钟（3 小时）才开始打卡，这一天就不算班次了。
                      勾上：算「缺上班卡」。适用于当天确实来上班了、只是忘了打上班卡的部门。
                    </span>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="sr-grace-enabled"
                    checked={draft.overtimeGraceMinutes !== DEFAULT_GRACE}
                    onCheckedChange={(next) =>
                      setDraft({ ...draft, overtimeGraceMinutes: next === false ? DEFAULT_GRACE : 300 })
                    }
                    className="mt-0.5 border-zinc-300 dark:border-zinc-600"
                  />
                  <span className="text-sm leading-snug">
                    下班卡允许晚点打
                    <span className="block text-2xs text-muted-foreground">
                      不勾：下班后 {DEFAULT_GRACE} 分钟内打的卡还算这个班，超时就作废。
                      勾上：按下面填的分钟数放宽 —— 只有确实经常加班到很晚的部门才需要。
                    </span>
                  </span>
                </div>
                {draft.overtimeGraceMinutes !== DEFAULT_GRACE && (
                  <div className="ml-6 flex items-center gap-2">
                    <span className="text-xs whitespace-nowrap text-muted-foreground">下班后仍算本班（分钟）</span>
                    <Input
                      id="sr-grace-minutes"
                      type="number"
                      min={0}
                      max={720}
                      value={draft.overtimeGraceMinutes}
                      onChange={(e) =>
                        setDraft({ ...draft, overtimeGraceMinutes: Math.max(0, Math.min(720, Number(e.target.value) || 0)) })
                      }
                      className="w-24 dark:[color-scheme:dark]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </BaseModal>
    </>
  );
}

/**
 * 部门树的一行（含其子部门）。
 *
 * 三个状态必须一眼分得开，否则继承关系读不出来：
 *  - 配了 → 列出本部门的时段
 *  - 没配但继承到 → 明确写「沿用 X（上一级）」
 *  - 整条链都没配 → 「不参与判定」，用警示色
 */
function DeptRow({
  node,
  depth,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: {
  node: DeptRuleNode;
  depth: number;
  canManage: boolean;
  onAdd: (d: DraftRule) => void;
  onEdit: (d: DraftRule) => void;
  onDelete: (r: DeptShiftRule) => Promise<void>;
}) {
  const own = node.rules.length > 0;
  const uncovered = !own && node.effectiveCount === 0;

  return (
    <li>
      <div
        className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/30"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {/* 缩进层级：末层用竖线收尾，中间层用拐角 */}
        {depth > 0 && (
          <CornerDownRight
            className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600"
            aria-hidden="true"
          />
        )}
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{node.department.name}</span>
            {uncovered ? (
              <Badge variant="warning">不参与判定</Badge>
            ) : (
              !own && (
                <span className="text-2xs text-muted-foreground">
                  沿用「{node.inheritedFrom?.name}」
                  {node.inheritedFrom && node.inheritedFrom.depth > 0 && `（上一级）`}
                </span>
              )
            )}
          </div>

          {own && (
            <ul className="mt-1 space-y-1">
              {node.rules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="primary" className="font-normal">
                    {r.name}
                  </Badge>
                  <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
                    {r.startTime}–{r.endTime}
                    {crossesMidnight(r) && <span className="ml-1 text-2xs text-muted-foreground">次日</span>}
                  </span>
                  <span className="text-2xs text-muted-foreground">{workdayText(r.workdays)}</span>
                  {r.assumeMissingIn && <Badge variant="warning" className="font-normal">缺上班卡</Badge>}
                  {r.overtimeGraceMinutes !== DEFAULT_GRACE && (
                    <Badge variant="neutral" className="font-normal">
                      加班余量 {r.overtimeGraceMinutes} 分钟
                    </Badge>
                  )}
                  {canManage && (
                    <span className="ml-1 inline-flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          onEdit({
                            id: r.id,
                            departmentId: r.departmentId,
                            name: r.name,
                            startTime: r.startTime,
                            endTime: r.endTime,
                            workdays: r.workdays,
                            assumeMissingIn: r.assumeMissingIn,
                            overtimeGraceMinutes: r.overtimeGraceMinutes,
                          })
                        }
                        aria-label={`编辑 ${node.department.name} 的 ${r.name}`}
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void onDelete(r)}
                        aria-label={`删除 ${node.department.name} 的 ${r.name}`}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onAdd(emptyDraft(node.department.id))}
            aria-label={`为 ${node.department.name} 新增时段`}
            title="给这个部门新增时段"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <DeptRow
              key={c.department.id}
              node={c}
              depth={depth + 1}
              canManage={canManage}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}