import { Pressable } from '@/components/ui/Pressable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableFrame } from '@/components/ui/Table';
import { useConfirm } from '@/hooks/useConfirm';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { useUserStore } from '@/store/useUserStore';
import {
  accountApi,
  accountError,
  ACCOUNT_ROLE_LABELS,
  randomInitialPassword,
  type Account,
  type AccountSystemRole,
} from '@/services/accountApi';
import { canManageAccount, grantableRoles } from '@/utils/accountCeiling';
import { Button } from '@/components/ui/button';

const ROLES: AccountSystemRole[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'];

type BindingFilter = 'ALL' | 'bound' | 'unbound' | 'dangling';
type StateFilter = 'ALL' | 'disabled' | 'mustChange' | 'locked';

const fieldClass = 'w-full mt-1';

/** 员工选择器：账号↔员工是一对一（accounts.employeeId 上有部分唯一索引），已绑他人的不可再选 */
function EmployeePicker({
  value,
  onChange,
  accounts,
  selfUsername,
  editingUsername = '',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  accounts: Account[];
  selfUsername: string;
  /** 正在编辑的账号名：它自己的绑定不算「被他人占用」，否则改绑弹窗里连当前项都点不动 */
  editingUsername?: string;
}) {
  const employees = useEmployeeStore((state) => state.users);
  const [query, setQuery] = useState('');
  const boundBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) if (a.employeeId) map.set(a.employeeId, a.username);
    return map;
  }, [accounts]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
      .slice(0, 60);
  }, [employees, query]);

  const selected = value ? employees.find((e) => e.id === value) : null;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按姓名或工号搜索员工"
            aria-label="搜索要绑定的员工"
            className="pl-9"
          />
        </div>
        {value && (
          <Button type="button" onClick={() => onChange(null)} variant="outline" size="toolbar" className="shrink-0">
            清除
          </Button>
        )}
      </div>
      {selected && (
        <p className="mt-2 text-sm text-brand-700 dark:text-brand-400">
          已选：{selected.name}（{selected.id}）
        </p>
      )}
      {/* 列表常驻：否则选中一次后要先把「已选」清掉才能改选别人 */}
      <div className="mt-2 max-h-44 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-700/60">
        {matched.map((e) => {
          const holder = boundBy.get(e.id);
          const taken = holder && holder !== selfUsername && holder !== editingUsername;
          const isCurrent = e.id === value;
          return (
            <Pressable
              key={e.id}
              type="button"
              disabled={!!taken}
              title={taken ? `已被账号 ${holder} 绑定` : ''}
              onClick={() => onChange(e.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 disabled:opacity-45 disabled:cursor-not-allowed ${
 isCurrent ? 'bg-brand-50 dark:bg-brand-900/25' : ''
 }`}
            >
              <span className="truncate">
                {e.name}
                <span className="ml-2 text-xs text-muted-foreground">{e.department}</span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0 ml-3">{taken ? `已绑 ${holder}` : e.id}</span>
            </Pressable>
          );
        })}
        {matched.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">没有匹配的员工</p>}
      </div>
    </div>
  );
}

export default function AccountManager() {
  const confirm = useConfirm();
  const me = useUserStore((state) => state.userInfo?.username ?? '');
  const myRole = useUserStore((state) => state.userInfo?.role) as AccountSystemRole | undefined;
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AccountSystemRole>('ALL');
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const employees = useEmployeeStore((state) => state.users);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await accountApi.list());
    } catch (e) {
      toast.error(accountError(e, '账号列表加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 绑定列要显示员工姓名，档案列表必须先就位
    void fetchUsers();
  }, [load, fetchUsers]);

  const stats = useMemo(
    () => ({
      total: accounts.length,
      unbound: accounts.filter((a) => !a.employeeId).length,
      dangling: accounts.filter((a) => a.employeeId && !employeeById.has(a.employeeId)).length,
      disabled: accounts.filter((a) => !a.enabled).length,
      mustChange: accounts.filter((a) => a.mustChangePassword).length,
      locked: accounts.filter((a) => a.locked).length,
    }),
    [accounts, employeeById]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (q && ![a.username, a.displayName, a.email, a.employeeId ?? ''].some((v) => v.toLowerCase().includes(q))) {
        return false;
      }
      if (roleFilter !== 'ALL' && a.systemRole !== roleFilter) return false;
      if (bindingFilter === 'unbound' && a.employeeId) return false;
      if (bindingFilter === 'bound' && !a.employeeId) return false;
      if (bindingFilter === 'dangling' && !(a.employeeId && !employeeById.has(a.employeeId))) return false;
      if (stateFilter === 'disabled' && a.enabled) return false;
      if (stateFilter === 'mustChange' && !a.mustChangePassword) return false;
      if (stateFilter === 'locked' && !a.locked) return false;
      return true;
    });
  }, [accounts, query, roleFilter, bindingFilter, stateFilter, employeeById]);

  const patchRow = useCallback((next: Account) => {
    setAccounts((prev) => prev.map((a) => (a.username === next.username ? next : a)));
  }, []);

  /** 统一的动作包装：置忙、失败提示、成功提示 + 刷新 */
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, ok: string | null) => {
      setBusy(key);
      try {
        await fn();
        if (ok) toast.success(ok);
        await load();
        return true;
      } catch (e) {
        toast.error(accountError(e, '操作失败'));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const onToggleEnabled = (a: Account) =>
    run(
      `enable:${a.username}`,
      () => accountApi.update(a.username, { enabled: !a.enabled }).then(patchRow),
      a.enabled ? `账号 ${a.username} 已停用（会话同时吊销）` : `账号 ${a.username} 已启用`
    );

  const onRevoke = (a: Account) =>
    run(`revoke:${a.username}`, () => accountApi.revokeSessions(a.username), `已强制 ${a.username} 下线`);

  const onReset = (a: Account) =>
    run(
      `reset:${a.username}`,
      () => {
        const pw = randomInitialPassword();
        return accountApi.resetPassword(a.username, pw).then(() => {
          toast.success(`新密码（仅本次显示）：${pw}`, { duration: 12_000 });
        });
      },
      null
    );

  const onDelete = async (a: Account) => {
    const ok = await confirm({
      title: `删除账号 ${a.username}？`,
      description: '该账号的会话会全部吊销，历史审计日志保留。此操作不可恢复。',
      variant: 'danger',
    });
    if (!ok) return;
    await run(`delete:${a.username}`, () => accountApi.remove(a.username), `账号 ${a.username} 已删除`);
  };

  // 头部那串数是**全量口径**（未绑定 / 停用 / 锁定要跨全部账号才有意义），而表格是筛过的。
  // 不标出筛选后条数，就会出现"共 12 个账号"配着 3 行表格的自相矛盾（审查 AC1）。
  const filterActive = query.trim() !== '' || roleFilter !== 'ALL' || bindingFilter !== 'ALL' || stateFilter !== 'ALL';

  return (
    <div className="animate-in fade-in duration-slow h-full flex flex-col">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">账号管理</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filterActive ? `筛选后 ${rows.length} / 共 ${stats.total} 个账号` : `共 ${stats.total} 个账号`}
            <span title="未绑定 / 绑定失效 / 停用 / 待改密 / 锁定 始终按全部账号统计，不随筛选变化">
              {' · '}未绑定 {stats.unbound} · 绑定失效 {stats.dangling} · 停用 {stats.disabled} · 待改密{' '}
              {stats.mustChange} · 锁定 {stats.locked}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void load()} title="重新拉取账号列表" variant="outline" size="toolbar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={() => setCreating(true)} size="toolbar">
            <UserPlus className="w-4 h-4" />
            新建账号
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户名、显示名、邮箱或工号…"
              aria-label="搜索账号"
              className="w-full pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={bindingFilter} onValueChange={(v) => setBindingFilter((v ?? 'ALL') as BindingFilter)}>
              <SelectTrigger className="w-32" aria-label="按绑定状态筛选">
                <SelectValue placeholder="绑定状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部绑定</SelectItem>
                <SelectItem value="unbound">未绑定员工</SelectItem>
                <SelectItem value="bound">已绑定员工</SelectItem>
                <SelectItem value="dangling">绑定已失效</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter((v ?? 'ALL') as typeof roleFilter)}>
              <SelectTrigger className="w-32" aria-label="按系统角色筛选">
                <SelectValue placeholder="系统角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部角色</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ACCOUNT_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={(v) => setStateFilter((v ?? 'ALL') as StateFilter)}>
              <SelectTrigger className="w-30" aria-label="按账号状态筛选">
                <SelectValue placeholder="账号状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="disabled">已停用</SelectItem>
                <SelectItem value="mustChange">待改密</SelectItem>
                <SelectItem value="locked">已锁定</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TableFrame className="flex-1">
          <Table minWidth="min-w-215" nowrapHeaders>
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">账号</th>
                <th className="px-4 py-3 font-medium">系统角色</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">绑定员工</th>
                <th className="px-4 py-3 font-medium">最近登录</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/60 text-sm">
              {rows.map((a) => {
                const emp = a.employeeId ? employeeById.get(a.employeeId) : null;
                const isSelf = a.username === me;
                const manageable = canManageAccount(myRole, a.systemRole, isSelf);
                const ceilingTip = manageable
                  ? ''
                  : `（目标是${ACCOUNT_ROLE_LABELS[a.systemRole]}，只有权限更高的管理员可以操作）`;
                return (
                  <tr key={a.username} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-white flex items-center gap-1.5">
                        {a.username}
                        {isSelf && <span className="text-2xs text-brand-600 dark:text-brand-400">当前登录</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.displayName || '—'}
                        {a.email ? ` · ${a.email}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={a.systemRole === 'SUPER_ADMIN' || a.systemRole === 'ADMIN' ? 'primary' : 'neutral'}
                      >
                        {ACCOUNT_ROLE_LABELS[a.systemRole]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="destructive">停用</Badge>}
                        {a.locked && <Badge variant="warning">锁定</Badge>}
                        {a.mustChangePassword && <Badge variant="warning">待改密</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {emp ? (
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {emp.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">{emp.id}</span>
                        </span>
                      ) : a.employeeId ? (
                        <span
                          className="text-amber-700 dark:text-amber-400"
                          title="员工档案已删除，但账号仍带着这个工号"
                        >
                          绑定失效 · {a.employeeId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">未绑定</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.lastLoginAt || '从未登录'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busy === `enable:${a.username}` && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                        <IconAction
                          title={`${a.employeeId ? '改绑员工' : '绑定员工'}${ceilingTip}`}
                          icon={Link2}
                          disabled={!manageable}
                          onClick={() => setEditing(a)}
                        />
                        <IconAction
                          title={`${a.enabled ? '停用' : '启用'}${ceilingTip}`}
                          icon={a.enabled ? Ban : CheckCircle2}
                          disabled={!manageable || isSelf || busy !== null}
                          onClick={() => void onToggleEnabled(a)}
                        />
                        <IconAction
                          title={`重置密码${ceilingTip}`}
                          icon={KeyRound}
                          disabled={!manageable || busy !== null}
                          onClick={() => void onReset(a)}
                        />
                        <IconAction
                          title={`强制下线${ceilingTip}`}
                          icon={LogOut}
                          disabled={!manageable || isSelf || busy !== null}
                          onClick={() => void onRevoke(a)}
                        />
                        <IconAction
                          title={`删除账号${ceilingTip}`}
                          icon={Trash2}
                          danger
                          disabled={!manageable || isSelf || busy !== null}
                          onClick={() => void onDelete(a)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    没有符合条件的账号
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableFrame>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        账号与员工是一对一：未绑定的账号能登录，但收不到也不影响自己的转正/加班/补卡等审批领域动作。
        「绑定失效」通常是员工被删除后遗留，点改绑重新指定或停用该账号即可。
      </p>

      {creating && (
        <AccountDialog
          accounts={accounts}
          selfUsername={me}
          roles={grantableRoles(myRole)}
          onClose={() => {
            setCreating(false);
            void load();
          }}
          onCreated={() => void load()}
        />
      )}

      {editing && (
        <AccountDialog
          account={editing}
          accounts={accounts}
          selfUsername={me}
          roles={grantableRoles(myRole)}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null);
            patchRow(next);
          }}
        />
      )}
    </div>
  );
}

function IconAction({
  title,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
 danger
 ? 'text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
 : 'text-muted-foreground hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-zinc-700/60'
 }`}
    >
      <Icon className="w-4 h-4" />
    </Pressable>
  );
}

function AccountDialog({
  account,
  accounts,
  selfUsername,
  roles,
  onClose,
  onCreated,
  onSaved,
}: {
  account?: Account;
  accounts: Account[];
  selfUsername: string;
  roles: AccountSystemRole[];
  onClose: () => void;
  onCreated?: () => void;
  onSaved?: (next: Account) => void;
}) {
  const isEdit = Boolean(account);
  const [username, setUsername] = useState(account?.username ?? '');
  const [password, setPassword] = useState(randomInitialPassword);
  const [systemRole, setSystemRole] = useState<AccountSystemRole>(account?.systemRole ?? 'EMPLOYEE');
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [employeeId, setEmployeeId] = useState<string | null>(account?.employeeId ?? null);
  const [saving, setSaving] = useState(false);
  const [shownPassword, setShownPassword] = useState('');

  const roleOptions = isEdit && account ? [...new Set([account.systemRole, ...roles])] : roles;

  const submit = async () => {
    if (!isEdit && !/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      toast.error('用户名只能包含字母、数字、点、下划线、连字符，长度 3-32');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && account) {
        const next = await accountApi.update(account.username, {
          employeeId,
          systemRole,
          displayName: displayName.trim(),
          email: email.trim(),
        });
        toast.success(`账号 ${account.username} 已更新`);
        onSaved?.(next);
      } else {
        await accountApi.create({
          username: username.trim(),
          password,
          systemRole,
          displayName: displayName.trim(),
          email: email.trim(),
          employeeId,
        });
        // 先留在弹窗里展示一次性口令；关闭时父组件再刷新列表
        setShownPassword(password);
        onCreated?.();
      }
    } catch (e) {
      toast.error(accountError(e, isEdit ? '更新失败' : '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={isEdit && account ? `编辑账号：${account.username}` : '新建账号'}
      size="lg"
      footer={
        shownPassword ? (
          <Button type="button" onClick={onClose} variant="outline" size="toolbar">
            关闭
          </Button>
        ) : (
          <>
            <Button type="button" onClick={onClose} variant="outline" size="toolbar">
              {isEdit ? '取消' : '关闭'}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving} size="toolbar">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {!saving && !isEdit && <Plus className="w-4 h-4" />}
              {isEdit ? '保存' : '创建'}
            </Button>
          </>
        )
      }
    >
      {shownPassword ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">账号已创建。初始密码只显示这一次，请转交本人：</p>
          <p className="select-all font-mono text-sm bg-zinc-100 dark:bg-zinc-700 rounded-lg px-3 py-2">
            {shownPassword}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isEdit && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="acct-username">
                  用户名 *
                </label>
                <Input
                  id="acct-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="如 zhangsan"
                  className={fieldClass}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">系统角色</label>
              <Select value={systemRole} onValueChange={(v) => setSystemRole((v ?? systemRole) as AccountSystemRole)}>
                <SelectTrigger className="w-full mt-1" aria-label="系统角色">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ACCOUNT_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor={`${isEdit ? 'edit' : 'acct'}-display`}
              >
                显示名称
              </label>
              <Input
                id={`${isEdit ? 'edit' : 'acct'}-display`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor={`${isEdit ? 'edit' : 'acct'}-email`}
              >
                邮箱{isEdit ? '' : '（用于接收提醒邮件）'}
              </label>
              <Input
                id={`${isEdit ? 'edit' : 'acct'}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          {!isEdit && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">初始密码</label>
                <Pressable
                  type="button"
                  onClick={() => setPassword(randomInitialPassword())}
                  className="-my-1 py-1 text-xs text-brand-600 dark:text-brand-400 flex items-center"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  换一批
                </Pressable>
              </div>
              <p className="mt-1 select-all font-mono text-sm bg-zinc-100 dark:bg-zinc-700 rounded-lg px-3 py-2">
                {password}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">首次登录会要求改密。</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">绑定员工</label>
            <EmployeePicker
              value={employeeId}
              onChange={setEmployeeId}
              accounts={accounts}
              selfUsername={selfUsername}
              editingUsername={account?.username}
            />
          </div>
        </div>
      )}
    </BaseModal>
  );
}
