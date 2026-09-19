import React, { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, ListOrdered } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';
import { useUserStore } from '@/store/useUserStore';
import { usePermissionsStore } from '@/store/permissions';
import { routeConfig, applyNavOrder } from '@/config/routes';
import { Button } from '@/components/ui/button';

/**
 * 功能模块排序：自定义侧边栏导航顺序，调整后即时生效。
 * 顺序存于 appSettings（localStorage），仅影响当前浏览器；
 * 列表与侧边栏使用同一套可见性规则（权限过滤 + 移除 /settings 入口）。
 */
export default function NavOrderPanel() {
  const hasPermission = useUserStore((state) => state.hasPermission);
  const permissionsMap = usePermissionsStore((state) => state.permissions);
  const navOrder = useAppSettings((state) => state.navOrder);
  const setNavOrder = useAppSettings((state) => state.setNavOrder);

  // 可排序模块 = 侧边栏实际展示的模块（/settings 已收纳进账户弹窗，不参与）
  const defaultPaths = useMemo(() => {
    void permissionsMap; // 权限矩阵变化时重算可见模块
    return routeConfig
      .filter((item) => item.path !== '/settings' && (!item.permission || hasPermission(item.permission)))
      .map((item) => item.path);
  }, [hasPermission, permissionsMap]);

  const [list, setList] = useState<string[]>(() => applyNavOrder(defaultPaths.map((p) => ({ path: p })), navOrder).map((i) => i.path));

  const isDefault = useMemo(
    () => list.length === defaultPaths.length && list.every((p, i) => p === defaultPaths[i]),
    [list, defaultPaths]
  );

  const metaByPath = useMemo(() => new Map(routeConfig.map((r) => [r.path, r])), []);

  const move = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      setList(next);
      setNavOrder(next);
    },
    [list, setNavOrder]
  );

  const reset = useCallback(() => {
    setList(defaultPaths);
    setNavOrder([]);
  }, [defaultPaths, setNavOrder]);

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">功能模块排序</h2>

      <div className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <ListOrdered className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">侧边栏模块顺序</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                使用上下按钮调整模块顺序，调整后即时生效（仅影响当前浏览器的侧边栏）。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isDefault && (
              <span className="text-2xs text-zinc-400 dark:text-zinc-500">当前已是默认顺序</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={isDefault}>
              <RotateCcw />
              恢复默认顺序
            </Button>
          </div>
        </div>

        <ul className="mt-5 space-y-1.5">
          {list.map((path, index) => {
            const meta = metaByPath.get(path);
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <li
                key={path}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-900/30"
              >
                <span className="w-5 text-center text-xs font-medium text-zinc-400 dark:text-zinc-500 tabular-nums">{index + 1}</span>
                <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{meta.label}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`上移 ${meta.label}`}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === list.length - 1}
                    aria-label={`下移 ${meta.label}`}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
