import React, { useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole } from '@/types';

export default function PreferencesPanel() {
  const userInfo = useUserStore((state) => state.userInfo);
  const enableStrictPermission = useAppSettings((state) => state.enableStrictPermission);
  const setEnableStrictPermission = useAppSettings((state) => state.setEnableStrictPermission);

  const handleRoleChange = useCallback(
    (role: SystemRole) => {
      if (userInfo) {
        useUserStore.getState().setUser(
          {
            ...userInfo,
            role: role,
          },
          useUserStore.getState().token || ''
        );
      }
    },
    [userInfo]
  );

  const onRoleChangeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const role = e.currentTarget.dataset.role as SystemRole;
      if (role) {
        handleRoleChange(role);
      }
    },
    [handleRoleChange]
  );

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">系统偏好</h2>

      {/* 严格权限拦截开关 */}
      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">严格的权限拦截</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                开启后，系统将严格校验用户的页面访问和按钮操作权限。关闭则默认放行所有权限。
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnableStrictPermission(!enableStrictPermission)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
              enableStrictPermission
                ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner'
                : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
            role="switch"
            aria-checked={enableStrictPermission}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-800 shadow ring-0 transition duration-200 ease-in-out ${
                enableStrictPermission ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">权限测试 (演示用)</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              切换当前登录用户的系统角色，测试不同的权限视图
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { role: SystemRole.SUPER_ADMIN, label: '超级管理员', desc: '拥有所有模块的完全访问权限' },
            { role: SystemRole.ADMIN, label: '管理员', desc: '拥有大部分权限，无法修改系统设置' },
            { role: SystemRole.HR, label: '人事主管', desc: '仅拥有员工管理权限' },
            { role: SystemRole.EMPLOYEE, label: '普通员工', desc: '仅拥有查看权限，无法修改数据' },
          ].map((item) => (
            <button
              key={item.role}
              data-role={item.role}
              onClick={onRoleChangeClick}
              className={`flex flex-col p-4 rounded-xl border text-left transition-all ${
                userInfo?.role === item.role
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-600/20'
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-200/80 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <span
                className={`text-sm font-bold ${userInfo?.role === item.role ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-900 dark:text-white'}`}
              >
                {item.label}
              </span>
              <span className="text-xs text-zinc-500 mt-1">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
