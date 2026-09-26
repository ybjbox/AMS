import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Link2, Loader2, LogOut, Unlink, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole, User } from '@/types';
import { formatDateTime } from '@/utils/dateUtils';
import {
  accountApi,
  accountError,
  randomInitialPassword,
  ACCOUNT_ROLE_LABELS,
  type Account,
  type AccountSystemRole,
} from '@/services/accountApi';
import { canManageAccount, grantableRoles } from '@/utils/accountCeiling';

const ROLE_LABELS = ACCOUNT_ROLE_LABELS;

/** 账号端点全部 requireRole("ADMIN")；这里按登录会话里的系统角色判定，不走可被总开关旁路的权限码 */
function useCanManageAccounts(): boolean {
  const role = useUserStore((state) => state.userInfo?.role ?? '');
  const upper = String(role).toUpperCase();
  return upper === SystemRole.ADMIN || upper === SystemRole.SUPER_ADMIN;
}

type Mode = 'none' | 'create' | 'link';

/**
 * 员工档案「系统账号」区块：开通 / 关联 / 停用 / 重置密码 / 强制下线。
 *
 * 为什么放在档案里而不是单开一个账号管理页：需要解决的正是「员工和账号对不上」，
 * 从人出发去开号、绑定才是顺手的顺序；/api/auth/accounts 的六个端点此前在前端零消费者。
 */
export function UserAccountSection({ employee }: { employee: User }) {
  const canManage = useCanManageAccounts();
  const myUsername = useUserStore((state) => state.userInfo?.username ?? '');
  const myRole = useUserStore((state) => String(state.userInfo?.role ?? '').toUpperCase()) as AccountSystemRole;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>('none');
  const [draftUser, setDraftUser] = useState('');
  const [draftRole, setDraftRole] = useState<AccountSystemRole>('EMPLOYEE');
  const [draftPassword, setDraftPassword] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    try {
      const rows = await accountApi.list();
      setAccounts(rows);
      setLoadError('');
    } catch (e) {
      setAccounts([]);
      setLoadError(accountError(e, '账号列表读取失败'));
    }
  }, []);

  useEffect(() => {
    if (canManage) void reload();
  }, [canManage, reload]);

  const bound = useMemo(
    () => accounts?.find((a) => a.employeeId === employee.id) ?? null,
    [accounts, employee.id]
  );
  // 与账号管理页同一条规则：秩不低于自己的账号只能由更高的管理员处置
  const touchable = bound ? canManageAccount(myRole, bound.systemRole, bound.username === myUsername) : false;
  const ceilingTip =
    touchable || !bound ? '' : `目标是${ROLE_LABELS[bound.systemRole]}，只有权限更高的管理员可以操作`;
  /** 可以关联的账号：尚未绑定任何人，且不含当前登录的自己（避免把管理员账号挪走） */
  const freeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => !a.employeeId && a.username !== myUsername),
    [accounts, myUsername]
  );

  const run = async (label: string, action: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    try {
      await action();
      await reload();
      toast.success(label);
      return true;
    } catch (e) {
      toast.error(accountError(e, `${label}失败`));
      return false;
    } finally {
      setPending(false);
    }
  };

  const openCreateForm = () => {
    setMode(mode === 'create' ? 'none' : 'create');
    setDraftUser((prev) => prev || employee.id.toLowerCase());
    setDraftPassword(randomInitialPassword());
    setDraftRole('EMPLOYEE');
  };

  const submitCreate = async () => {
    const username = draftUser.trim();
    if (!username) {
      toast.error('请填写登录用户名');
      return;
    }
    const ok = await run(`已为 ${employee.name} 开通账号 ${username}`, () =>
      accountApi.create({
        username,
        password: draftPassword,
        systemRole: draftRole,
        employeeId: employee.id,
        displayName: employee.name,
      })
    );
    if (ok) setMode('none');
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(draftPassword);
      toast.success('初始密码已复制');
    } catch {
      toast.error('浏览器不允许写入剪贴板，请手动抄录');
    }
  };

  /** 重置后的新密码只显示这一次：服务端只存 scrypt 散列，没有第二条查看途径 */
  const resetPassword = async (username: string) => {
    const next = randomInitialPassword();
    const ok = await run(`已重置 ${username} 的密码`, () => accountApi.resetPassword(username, next));
    if (ok) toast(`新密码：${next}`, { description: '仅显示这一次，请复制后转交本人' });
  };

  if (!canManage) return null;

  return (
    <div className="mt-6">
      <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">系统账号</h4>
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-3">
        {accounts === null ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            加载中…
          </p>
        ) : loadError ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{loadError}</p>
        ) : bound ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-zinc-900 dark:text-white font-medium tabular-nums">
                {bound.username}
              </span>
              <span className="flex items-center gap-1.5">
                <Badge variant={bound.enabled ? 'success' : 'neutral'}>
                  {bound.enabled ? '已启用' : '已停用'}
                </Badge>
                <Badge variant="neutral">{ROLE_LABELS[bound.systemRole]}</Badge>
                {bound.mustChangePassword && <Badge variant="warning">待改密</Badge>}
                {bound.locked && <Badge variant="warning">已锁定</Badge>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">最近登录</span>
              <span className="text-sm font-medium text-zinc-900 dark:text-white">
                {bound.lastLoginAt ? formatDateTime(bound.lastLoginAt) : '从未登录'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !touchable}
                title={ceilingTip}
                onClick={() => void resetPassword(bound.username)}
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                重置密码
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || bound.username === myUsername || !touchable}
                title={ceilingTip}
                onClick={() =>
                  void run('已要求重新登录', () => accountApi.revokeSessions(bound.username))
                }
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                强制下线
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || bound.username === myUsername || !touchable}
                title={ceilingTip}
                onClick={() =>
                  void run(bound.enabled ? '账号已停用' : '账号已启用', () =>
                    accountApi.update(bound.username, { enabled: !bound.enabled })
                  )
                }
              >
                {bound.enabled ? '停用账号' : '启用账号'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  void run('已解除与该员工的绑定', () =>
                    accountApi.update(bound.username, { employeeId: null })
                  )
                }
              >
                <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                解除绑定
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              该员工尚未绑定登录账号：无法自助提交转正 / 补卡 / 离职，考勤异常与到期提醒也发不到本人。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={openCreateForm}>
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                开通账号
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || freeAccounts.length === 0}
                onClick={() => setMode(mode === 'link' ? 'none' : 'link')}
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                关联已有账号
              </Button>
            </div>

            {mode === 'create' && (
              <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 w-16" htmlFor="account-username">
                    用户名
                  </label>
                  <Input
                    id="account-username"
                    value={draftUser}
                    onChange={(e) => setDraftUser(e.target.value)}
                    maxLength={40}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 w-16">系统角色</span>
                  <Select value={draftRole} onValueChange={(v) => setDraftRole(String(v) as AccountSystemRole)}>
                    <SelectTrigger aria-label="系统角色" className="flex-1 justify-between">
                      <SelectValue>{(v: unknown) => ROLE_LABELS[String(v) as AccountSystemRole] ?? ''}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {/* 这里历来不开放「创建超管」（超管只在账号管理页由现有超管授予），
                          再叠一层角色天花板：秩 ≥ 自己的选项直接不列，避免提交后 403 */}
                      {grantableRoles(myRole)
                        .filter((r) => r !== 'SUPER_ADMIN')
                        .map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 w-16" htmlFor="account-password">
                    初始密码
                  </label>
                  <Input
                    id="account-password"
                    value={draftPassword}
                    onChange={(e) => setDraftPassword(e.target.value)}
                    className="flex-1 font-mono tabular-nums"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={copyPassword}>
                    复制
                  </Button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  首次登录会被要求改密；至少 10 位且含字母与数字。
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={pending} onClick={submitCreate}>
                    {pending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                    确认开通
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMode('none')}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {mode === 'link' && (
              <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 w-16">选择账号</span>
                  <Select
                    value={linkTarget || freeAccounts[0]?.username || ''}
                    onValueChange={(v) => setLinkTarget(String(v))}
                  >
                    <SelectTrigger aria-label="选择要绑定的账号" className="flex-1 justify-between">
                      <SelectValue>{(v: unknown) => String(v ?? '')}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {freeAccounts.map((a) => (
                        <SelectItem key={a.username} value={a.username}>
                          {a.username}
                          {a.displayName ? `（${a.displayName}）` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    const username = linkTarget || freeAccounts[0]?.username;
                    if (!username) {
                      toast.error('没有可关联的未绑定账号');
                      return;
                    }
                    void run(`已将 ${username} 绑定到 ${employee.name}`, () =>
                      accountApi.update(username, { employeeId: employee.id }).then(() => setMode('none'))
                    );
                  }}
                >
                  确认关联
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
