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

const ROLES: AccountSystemRole[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'];

type BindingFilter = 'ALL' | 'bound' | 'unbound' | 'dangling';
type StateFilter = 'ALL' | 'disabled' | 'mustChange' | 'locked';

const fieldClass =
  'w-full mt-1';

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
          <button type="button" className="btn-secondary shrink-0" onClick={() => onChange(null)}>
            清除
          </button>
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
            <button
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
              <span className="text-xs text-muted-foreground shrink-0 ml-3">
                {taken ? `已绑 ${holder}` : e.id}
              </span>
            </button>
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
    run(`reset:${a.username}`, () => {
      const pw = randomInitialPassword();
      return accountApi.resetPassword(a.username, pw).then(() => {
        toast.success(`新密码（仅本次显示）：${pw}`, { duration: 12_000 });
      });
    }, null);

  const onDelete = async (a: Account) => {
    const ok = await confirm({
      title: `删除账号 ${a.username}？`,
      description: '该账号的会话会全部吊销，历史审计日志保留。此操作不可恢复。',
      variant: 'danger',
    });
    if (!ok) return;
    await run(`delete:${a.username}`, () => accountApi.remove(a.username), `账号 ${a.username} 已删除`);
  };

  return (
    <div className="animate-in fade-in duration-400 h-full flex flex-col">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">账号管理</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            共 {stats.total} 个账号 · 未绑定 {stats.unbound} · 绑定失效 {stats.dangling} · 停用 {stats.disabled} ·
            待改密 {stats.mustChange} · 锁定 {stats.locked}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="btn-secondary flex items-center px-3 py-2" title="重新拉取账号列表">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary flex items-center px-3 py-2">
            <UserPlus className="w-4 h-4 mr-2" />
            新建账号
          </button>
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
              <SelectTrigger className="w-[130px]" aria-label="按绑定状态筛选">
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
              <SelectTrigger className="w-[130px]" aria-label="按系统角色筛选">
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
              <SelectTrigger className="w-[120px]" aria-label="按账号状态筛选">
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

        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[860px] text-left border-collapse">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                const ceilingTip = manageable ? '' : `（目标是${ACCOUNT_ROLE_LABELS[a.systemRole]}，只有权限更高的管理员可以操作）`;
                return (
                  <tr key={a.username} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-white flex items-center gap-1.5">
                        {a.username}
                        {isSelf && <span className="text-2xs text-brand-600 dark:text-brand-400">当前登录</span>}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {a.displayName || '—'}
                        {a.email ? ` · ${a.email}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.systemRole === 'SUPER_ADMIN' || a.systemRole === 'ADMIN' ? 'primary' : 'neutral'}>
                        {ACCOUNT_ROLE_LABELS[a.systemRole]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.enabled ? (
                          <Badge variant="success">启用</Badge>
                        ) : (
                          <Badge variant="destructive">停用</Badge>
                        )}
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
                        <span className="text-amber-700 dark:text-amber-400" title="员工档案已删除，但账号仍带着这个工号">
                          绑定失效 · {a.employeeId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">未绑定</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">{a.lastLoginAt || '从未登录'}</td>
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
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        账号与员工是一对一：未绑定的账号能登录，但收不到也不影响自己的转正/加班/补卡等审批领域动作。
        「绑定失效」通常是员工被删除后遗留，点改绑重新指定或停用该账号即可。
      </p>

      {creating && (
        <CreateAccountDialog
          accounts={accounts}
          selfUsername={me}
          roles={grantableRoles(myRole)}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {editing && (
        <EditAccountDialog
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
    <button
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
    </button>
  );
}

function CreateAccountDialog({
  accounts,
  selfUsername,
  roles,
  onClose,
  onCreated,
}: {
  accounts: Account[];
  selfUsername: string;
  roles: AccountSystemRole[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(randomInitialPassword);
  const [systemRole, setSystemRole] = useState<AccountSystemRole>('EMPLOYEE');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shownPassword, setShownPassword] = useState('');

  const submit = async () => {
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      toast.error('用户名只能包含字母、数字、点、下划线、连字符，长度 3-32');
      return;
    }
    setSaving(true);
    try {
      await accountApi.create({
        username: username.trim(),
        password,
        systemRole,
        displayName: displayName.trim(),
        email: email.trim(),
        employeeId,
      });
      setShownPassword(password);
      toast.success(`账号 ${username} 已创建`);
      onCreated();
    } catch (e) {
      toast.error(accountError(e, '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title="新建账号"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            关闭
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary disabled:opacity-70">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            创建
          </button>
        </>
      }
    >
      {shownPassword ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">账号已创建。初始密码只显示这一次，请转交本人：</p>
          <p className="select-all font-mono text-sm bg-zinc-100 dark:bg-zinc-700 rounded-lg px-3 py-2">{shownPassword}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">系统角色</label>
              <Select value={systemRole} onValueChange={(v) => setSystemRole((v ?? 'EMPLOYEE') as AccountSystemRole)}>
                <SelectTrigger className="w-full mt-1" aria-label="系统角色">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ACCOUNT_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="acct-display">
                显示名称
              </label>
              <Input id="acct-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="acct-email">
                邮箱（用于接收提醒邮件）
              </label>
              <Input id="acct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">初始密码</label>
              <button
                type="button"
                onClick={() => setPassword(randomInitialPassword())}
                className="text-xs text-brand-600 dark:text-brand-400 flex items-center"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                换一批
              </button>
            </div>
            <p className="mt-1 select-all font-mono text-sm bg-zinc-100 dark:bg-zinc-700 rounded-lg px-3 py-2">{password}</p>
            <p className="mt-1 text-xs text-muted-foreground">首次登录会要求改密。</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">绑定员工</label>
            <EmployeePicker value={employeeId} onChange={setEmployeeId} accounts={accounts} selfUsername={selfUsername} />
          </div>
        </div>
      )}
    </BaseModal>
  );
}

function EditAccountDialog({
  account,
  accounts,
  selfUsername,
  roles,
  onClose,
  onSaved,
}: {
  account: Account;
  accounts: Account[];
  selfUsername: string;
  roles: AccountSystemRole[];
  onClose: () => void;
  onSaved: (next: Account) => void;
}) {
  const [employeeId, setEmployeeId] = useState<string | null>(account.employeeId);
  const [systemRole, setSystemRole] = useState<AccountSystemRole>(account.systemRole);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [email, setEmail] = useState(account.email);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const next = await accountApi.update(account.username, {
        employeeId,
        systemRole,
        displayName: displayName.trim(),
        email: email.trim(),
      });
      toast.success(`账号 ${account.username} 已更新`);
      onSaved(next);
    } catch (e) {
      toast.error(accountError(e, '更新失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={`编辑账号：${account.username}`}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary disabled:opacity-70">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">系统角色</label>
            <Select value={systemRole} onValueChange={(v) => setSystemRole((v ?? account.systemRole) as AccountSystemRole)}>
              <SelectTrigger className="w-full mt-1" aria-label="系统角色">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* 自己的账号总在选项里（改自己资料时不该看到空值），其余只列可授予的角色 */}
                {[...new Set([account.systemRole, ...roles])].map((r) => (
                  <SelectItem key={r} value={r}>
                    {ACCOUNT_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="edit-display">
              显示名称
            </label>
            <Input id="edit-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="edit-email">
              邮箱
            </label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">绑定员工</label>
          <EmployeePicker
            value={employeeId}
            onChange={setEmployeeId}
            accounts={accounts}
            selfUsername={selfUsername}
            editingUsername={account.username}
          />
        </div>
      </div>
    </BaseModal>
  );
}
