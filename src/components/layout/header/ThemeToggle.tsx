import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useAppSettings } from '../../../store/appSettings';

export default function ThemeToggle() {
  const theme = useAppSettings(state => state.theme);
  const setTheme = useAppSettings(state => state.setTheme);

  return (
    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">主题设置</p>
      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg p-1">
        <button
          onClick={() => setTheme('light')}
          className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          title="浅色模式"
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          title="深色模式"
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTheme('system')}
          className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          title="跟随系统"
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
