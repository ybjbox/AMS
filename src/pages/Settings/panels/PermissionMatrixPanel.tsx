import React from 'react';
import { Check, KeyRound, Eye, Info, RotateCcw, Lock } from 'lucide-react';
import { routeConfig } from '@/config/routes';
import { SystemRole } from '@/types';
import { usePermissionsStore } from '@/store/permissions';

/** 角色列（顺序即表格列顺序） */
const ROLES: { role: SystemRole; label: string }[] = [
  { role: SystemRole.SUPER_ADMIN, label: '超级管理员' },
  { role: SystemRole.ADMIN, label: '管理员' },
  { role: SystemRole.HR, label: '人事主管' },
  { role: SystemRole.EMPLOYEE, label: '普通员工' },
];

/** 按钮级操作权限（来自各页面组件内的 hasPermission 判断） */
const OPERATIONS: { label: string; code: string }[] = [
  { label: '员工增删改', code: 'users:manage' },
  { label: '考勤增删改', code: 'attendance:manage' },
  { label: '考勤编辑', code: 'attendance:edit' },
  { label: '部门 / 职位管理', code: 'settings:manage' },
];

type CellRenderer = (role: SystemRole, code: string) => React.ReactNode;

function ToggleCell({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
        checked ? 'bg-brand-500 dark:bg-brand-500' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-card shadow ring-0 transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function MatrixTable({
  rows,
  scopeLabel,
  renderCell,
}: {
  rows: { label: string; code: string }[];
  scopeLabel: string;
  renderCell: CellRenderer;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-muted dark:bg-background/60 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">{scopeLabel}</th>
              {ROLES.map((r) => (
                <th key={r.role} className="px-3 py-3 font-medium text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {r.label}
                    {(r.role === SystemRole.SUPER_ADMIN || r.role === SystemRole.ADMIN) && (
                      <Lock className="size-3 text-muted-foreground/60" aria-label="全权锁定" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border hover:bg-muted/50 dark:hover:bg-muted/30">
                <td className="px-4 py-3 text-foreground whitespace-nowrap">{row.label}</td>
                {ROLES.map((r) => (
                  <td key={r.role} className="px-3 py-3">
                    <div className="flex justify-center">{renderCell(r.role, row.code)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PermissionMatrixPanel() {
  const permissionsMap = usePermissionsStore((s) => s.permissions);
  const togglePermission = usePermissionsStore((s) => s.togglePermission);
  const resetToDefault = usePermissionsStore((s) => s.resetToDefault);

  const roleHas = (role: SystemRole, code: string): boolean => {
    const perms = permissionsMap[role] || [];
    return perms.includes('*') || perms.includes(code);
  };

  const isEditable = (role: SystemRole): boolean =>
    !(permissionsMap[role] || []).includes('*');

  const renderCell: CellRenderer = (role, code) => {
    if (!isEditable(role)) {
      return <Check className="size-4 text-brand-600 dark:text-brand-400" strokeWidth={2.5} />;
    }
    return (
      <ToggleCell
        checked={roleHas(role, code)}
        onToggle={() => togglePermission(role, code)}
        label={`${ROLES.find((r) => r.role === role)?.label ?? role} · ${code}`}
      />
    );
  };

  const pageRows = routeConfig
    .filter((r) => r.permission)
    .map((r) => ({ label: r.label, code: r.permission as string }));

  const handleReset = () => {
    if (window.confirm('恢复为系统默认权限分配？当前自定义修改将被覆盖。')) {
      resetToDefault();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            权限矩阵
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            直接勾选各角色的页面可见性与操作权限，修改即时保存并生效。超级管理员 / 管理员拥有
            <code className="mx-1 text-foreground">*</code> 全量权限，不支持单独编辑。
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="btn-secondary flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw className="size-4" />
          恢复默认
        </button>
      </div>

      {/* 页面可见性 */}
      <div className="space-y-3">
        <h2 className="subsection-title flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          页面可见性
        </h2>
        <MatrixTable rows={pageRows} scopeLabel="页面" renderCell={renderCell} />
      </div>

      {/* 操作权限 */}
      <div className="space-y-3">
        <h2 className="subsection-title flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          操作权限（按钮级）
        </h2>
        <MatrixTable rows={OPERATIONS} scopeLabel="操作" renderCell={renderCell} />
      </div>

      {/* 图例与说明 */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 dark:bg-background/40 p-4">
        <Info className="size-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <p>
            <span className="inline-flex h-5 w-9 items-center rounded-full bg-brand-500 mr-1 align-middle" />
            绿色开关表示已授予；灰色表示未授予。
          </p>
          <p>
            人事主管与普通员工的权限可逐项编辑；超级管理员 / 管理员因持有
            <code className="mx-1 text-foreground">*</code> 而锁定为全量允许。
          </p>
          <p>
            权限在前端体验层即时生效（导航、页面、按钮）；若后端启用了独立策略表，需同步在后端调整。
          </p>
        </div>
      </div>
    </div>
  );
}
