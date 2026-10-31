import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Fragment } from 'react';
import { Lock, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FailedState } from '@/components/ui/FailedState';
import { Table, TableFrame, TableHead, TableHeader } from '@/components/ui/Table';
import { useConfirm } from '@/hooks/useConfirm';
import { SystemRole } from '@/types';
import { rolePermissionsApi, type RoleCapability, type RolePermissionsMatrix } from '@/services/rolePermissionsApi';

/**
 * 角色能力矩阵（仅 SUPER_ADMIN）。
 *
 * 交互模型是「最低可用角色」：每行只允许调整最低的一档，勾选向上自动跟随。
 * 这等价于单调矩阵（低角色有的能力，高角色一定有），避免出现
 * 「HR 能进、ADMIN 反而不能」这种无法解释的状态。
 *
 * 保存后接口权限立即生效；侧栏 / 按钮要等相关账号重新登录才刷新。
 */

const ROLES: SystemRole[] = [SystemRole.EMPLOYEE, SystemRole.HR, SystemRole.ADMIN, SystemRole.SUPER_ADMIN];
const ROLE_RANK: Record<string, number> = {
  [SystemRole.EMPLOYEE]: 1,
  [SystemRole.HR]: 2,
  [SystemRole.ADMIN]: 3,
  [SystemRole.SUPER_ADMIN]: 4,
};
const ROLE_LABEL: Record<string, string> = {
  [SystemRole.EMPLOYEE]: '员工',
  [SystemRole.HR]: 'HR',
  [SystemRole.ADMIN]: '管理员',
  [SystemRole.SUPER_ADMIN]: '超管',
};
const GROUPS = ['员工自助', 'HR 数据', '管理', '安全'] as const;

function thresholdsOf(matrix: RolePermissionsMatrix): Record<string, SystemRole> {
  return Object.fromEntries(matrix.capabilities.map((c) => [c.code, c.threshold]));
}

export default function RolePermissionsPanel() {
  const confirm = useConfirm();
  const [matrix, setMatrix] = useState<RolePermissionsMatrix | null>(null);
  const [draft, setDraft] = useState<Record<string, SystemRole>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await rolePermissionsApi.get();
      setMatrix(next);
      setDraft(thresholdsOf(next));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as { error?: string })?.error || '权限矩阵没取到，请稍后重试');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byCode = useMemo(() => Object.fromEntries((matrix?.capabilities ?? []).map((c) => [c.code, c])), [matrix]);

  const dirty = useMemo(() => {
    if (!matrix) return false;
    const base = thresholdsOf(matrix);
    return Object.keys(draft).some((code) => draft[code] !== base[code]);
  }, [draft, matrix]);

  const update = (code: string, role: SystemRole) => {
    setDraft((prev) => ({ ...prev, [code]: role }));
    setSaveError(null);
  };

  /** 只允许动最低那一档：点当前档 = 往上收一档；点更低的一档 = 放低。 */
  const toggle = (cap: RoleCapability, role: SystemRole) => {
    const current = draft[cap.code] ?? cap.threshold;
    const currentRank = ROLE_RANK[current];
    const roleRank = ROLE_RANK[role];
    if (roleRank > currentRank) return; // 高于最低档的格子只读
    if (roleRank === currentRank) {
      const idx = ROLES.indexOf(role);
      const next = ROLES[Math.min(idx + 1, ROLES.length - 1)];
      if (next !== role) update(cap.code, next);
      return;
    }
    update(cap.code, role);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await rolePermissionsApi.save(draft);
      setMatrix(res.matrix);
      setDraft(thresholdsOf(res.matrix));
      toast.success('权限矩阵已保存；接口立即生效，相关账号重新登录后侧栏会更新');
    } catch (e) {
      setSaveError((e as { error?: string })?.error || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: '恢复默认权限矩阵？',
      description: '所有能力会回到出厂阈值；接口权限立即生效，相关账号需要重新登录后侧栏才会刷新。',
      variant: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await rolePermissionsApi.reset();
      setMatrix(res.matrix);
      setDraft(thresholdsOf(res.matrix));
      toast.success('已恢复默认');
    } catch (e) {
      setSaveError((e as { error?: string })?.error || '恢复失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <FailedState subject="权限矩阵" reason={loadError} onRetry={() => void load()} />;
  }
  if (!matrix) {
    return <p className="py-12 text-center text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-900 dark:text-white">
            <ShieldCheck className="size-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            角色能力矩阵
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            勾选表示该角色可用。每行只有「最低可用」那一档可点：向上收一档，或点更低的一档放开。
            保存后接口权限立即生效；侧栏与按钮要等相关账号重新登录才刷新。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void reset()} disabled={saving}>
            <RotateCcw className="size-4" /> 恢复默认
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            <Save className="size-4" /> {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/15 dark:text-red-300"
        >
          {saveError}
        </div>
      )}

      <TableFrame className="min-h-0 flex-1 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60">
        <Table minWidth="min-w-165" nowrapHeaders className="text-sm" aria-label="角色能力矩阵">
          <TableHeader>
            <tr>
              <TableHead scope="col" className="w-1/3">
                能力
              </TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} scope="col" align="center" className="w-1/6">
                  {ROLE_LABEL[role]}
                </TableHead>
              ))}
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
            {GROUPS.map((group) => {
              const caps = matrix.capabilities.filter((c) => c.group === group);
              if (!caps.length) return null;
              return (
                <Fragment key={group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={ROLES.length + 1}
                      className="bg-zinc-50/60 px-4 py-1.5 text-left text-3xs font-medium uppercase tracking-wider text-muted-foreground dark:bg-zinc-900/40"
                    >
                      {group}
                    </th>
                  </tr>
                  {caps.map((cap) => {
                    const threshold = draft[cap.code] ?? cap.threshold;
                    return (
                      <tr key={cap.code} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-900 dark:text-white">{cap.label}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Lock className="size-3" aria-hidden="true" />
                              最低 {ROLE_LABEL[cap.floor]}
                            </span>
                            {cap.dependsOn?.length ? (
                              <span>依赖：{cap.dependsOn.map((dep) => byCode[dep]?.label ?? dep).join('、')}</span>
                            ) : null}
                            <span className="tabular-nums">当前最低：{ROLE_LABEL[threshold]}</span>
                          </div>
                        </td>
                        {ROLES.map((role) => {
                          const checked = ROLE_RANK[role] >= ROLE_RANK[threshold];
                          const belowFloor = ROLE_RANK[role] < ROLE_RANK[cap.floor];
                          const isThreshold = role === threshold;
                          const disabled = belowFloor || role === SystemRole.SUPER_ADMIN || (checked && !isThreshold);
                          return (
                            <td key={role} className="px-4 py-3 text-center">
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={() => toggle(cap, role)}
                                aria-label={`${cap.label}：${ROLE_LABEL[role]}`}
                                className="mx-auto"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableFrame>

      <div className="shrink-0 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-700/60 dark:bg-zinc-900/40">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100">安全硬编码（不进入矩阵）</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{matrix.hardcoded.join(' · ')}</p>
        <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
          超管始终拥有全部能力，矩阵不能把管理入口锁死；账号管理、审计、诊断与凭据类配置保持代码里的角色下限。
        </p>
      </div>
    </div>
  );
}
