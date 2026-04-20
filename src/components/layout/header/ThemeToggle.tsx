import React, { useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useAppSettings } from '../../../store/appSettings';

const ThemeToggle = React.memo(function ThemeToggle() {
  const theme = useAppSettings((state) => state.theme);
  const setTheme = useAppSettings((state) => state.setTheme);

  const handleSetLight = useCallback(() => setTheme('light'), [setTheme]);
  const handleSetDark = useCallback(() => setTheme('dark'), [setTheme]);
  const handleSetSystem = useCallback(() => setTheme('system'), [setTheme]);

  return (
    <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-700">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">主题设置</p>
      <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-1">
        <button
          onClick={handleSetLight}
          className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="浅色模式"
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          onClick={handleSetDark}
          className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="深色模式"
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          onClick={handleSetSystem}
          className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          title="跟随系统"
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export default ThemeToggle;
