import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole } from '@/types';

/** 只用于把系统角色渲染成中文；判定一律以后端下发的真实角色与能力表为准。 */
const ROLE_LABEL: Record<string, string> = {
  [SystemRole.SUPER_ADMIN]: '超级管理员',
  [SystemRole.ADMIN]: '管理员',
  [SystemRole.HR]: '人事主管',
  [SystemRole.EMPLOYEE]: '普通员工',
};

export default function PreferencesPanel() {
  const userInfo = useUserStore((state) => state.userInfo);
  const permissions = userInfo?.permissions ?? [];
  const role = userInfo?.role;
  const scope = permissions.includes('*') ? '全部' : String(permissions.length) + ' 项';

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">系统偏好</h2>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">当前账号权限</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {role ? ROLE_LABEL[String(role)] ?? String(role) : '未登录'} · {userInfo?.username ?? '-'} · 可用功能 {scope}
              （由服务端按鉴权策略表下发，界面不再本地配置权限）。角色在「账号管理」里修改，改完需重新登录生效。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
