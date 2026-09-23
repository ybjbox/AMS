import React, { useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';

const ThemeToggle = React.memo(function ThemeToggle() {
  const theme = useAppSettings((state) => state.theme);
  const setTheme = useAppSettings((state) => state.setTheme);

  // 切换主题的下一拍抑制全局过渡（index.css [data-theme-switching]），
  // 避免 body/侧栏/卡片几十个属性“波浪式”逐个变色；过渡完成后恢复
  const applyTheme = useCallback(
    (next: 'light' | 'dark' | 'system') => {
      const root = document.documentElement;
      root.setAttribute('data-theme-switching', '');
      setTheme(next);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => root.removeAttribute('data-theme-switching'));
      });
    },
    [setTheme]
  );

  const handleSetLight = useCallback(() => applyTheme('light'), [applyTheme]);
  const handleSetDark = useCallback(() => applyTheme('dark'), [applyTheme]);
  const handleSetSystem = useCallback(() => applyTheme('system'), [applyTheme]);

  return (
    <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">主题设置</p>
      <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-1">
        <button
          onClick={handleSetLight}
          className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-zinc-700 shadow-sm text-brand-600 dark:text-brand-400' : 'text-muted-foreground hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="浅色模式"
          aria-label="浅色模式"
          aria-pressed={theme === 'light'}
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          onClick={handleSetDark}
          className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-zinc-700 shadow-sm text-brand-600 dark:text-brand-400' : 'text-muted-foreground hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="深色模式"
          aria-label="深色模式"
          aria-pressed={theme === 'dark'}
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          onClick={handleSetSystem}
          className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-zinc-700 shadow-sm text-brand-600 dark:text-brand-400' : 'text-muted-foreground hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="跟随系统"
          aria-label="跟随系统"
          aria-pressed={theme === 'system'}
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export default ThemeToggle;
