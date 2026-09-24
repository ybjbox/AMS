import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole } from '@/types';

/** 只用于把系统角色渲染成中文；判定一律以后端下发的真实角色为准。 */
const ROLE_LABEL: Record<string, string> = {
  [SystemRole.SUPER_ADMIN]: '超级管理员',
  [SystemRole.ADMIN]: '管理员',
  [SystemRole.HR]: '人事主管',
  [SystemRole.EMPLOYEE]: '普通员工',
};

export default function PreferencesPanel() {
  const userInfo = useUserStore((state) => state.userInfo);
  const enableStrictPermission = useAppSettings((state) => state.enableStrictPermission);
  const setEnableStrictPermission = useAppSettings((state) => state.setEnableStrictPermission);

  const role = userInfo?.role;

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">系统偏好</h2>

      {/* 严格权限拦截开关 */}
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">按权限隐藏界面</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                只影响本界面的菜单与按钮显隐，关掉不会多出任何权限：能不能读写由服务端的策略表决定，
                越权的请求一律被拒绝。要让某角色看不到某些入口，就开启本开关。
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnableStrictPermission(!enableStrictPermission)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 ${
              enableStrictPermission
                ? 'bg-gradient-to-b from-brand-600 to-brand-700 shadow-inner'
                : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
            role="switch"
            aria-checked={enableStrictPermission}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-800 shadow ring-0 transition duration-250 ease-smooth-out ${
                enableStrictPermission ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">当前账号角色</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {role ? ROLE_LABEL[String(role)] ?? String(role) : '未登录'} · 登录账号 {userInfo?.username ?? '-'}
              。角色在「账号管理」里修改，改完需重新登录生效。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
