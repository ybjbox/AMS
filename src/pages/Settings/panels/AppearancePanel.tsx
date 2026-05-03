import React, { useCallback } from 'react';
import { toast } from 'sonner';
import { Palette, Image as ImageIcon, Upload, Monitor, Building2 } from 'lucide-react';
import { useAppSettings } from '@/store/appSettings';

export default function AppearancePanel() {
  const theme = useAppSettings((state) => state.theme);
  const setTheme = useAppSettings((state) => state.setTheme);
  const loginBackground = useAppSettings((state) => state.loginBackground);
  const setLoginBackground = useAppSettings((state) => state.setLoginBackground);
  const systemIcon = useAppSettings((state) => state.systemIcon);
  const setSystemIcon = useAppSettings((state) => state.setSystemIcon);

  const onThemeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const themeId = e.currentTarget.dataset.themeid as 'light' | 'dark' | 'system';
      if (themeId) {
        setTheme(themeId);
      }
    },
    [setTheme]
  );

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'icon') => {
      const file = e.target.files?.[0];
      if (!file) return;
      // TODO(backend): 替换为真实文件上传 API，当前使用本地 FileReader 预览
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        if (type === 'background') {
          setLoginBackground(dataUrl);
        } else {
          setSystemIcon(dataUrl);
        }
        toast.success(`已预览${type === 'background' ? '背景图' : '系统图标'}，保存后生效`);
      };
      reader.readAsDataURL(file);
      // 重置 input，允许重复选择同一文件
      e.target.value = '';
    },
    [setLoginBackground, setSystemIcon]
  );

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">外观设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">自定义系统主题、图标和登录页背景</p>
      </div>

      <div className="bg-white dark:bg-zinc-800 p-6 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl space-y-8">
        {/* Theme Selection */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <Palette className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            主题模式
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { id: 'light', label: '浅色模式', icon: '☀️' },
              { id: 'dark', label: '深色模式', icon: '🌙' },
              { id: 'system', label: '跟随系统', icon: '💻' },
            ].map((t) => (
              <button
                key={t.id}
                data-themeid={t.id}
                onClick={onThemeClick}
                className={`flex flex-col items-center p-4 rounded-xl border transition-all ${
                  theme === t.id
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-600/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-200/80 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                }`}
              >
                <span className="text-2xl mb-2">{t.icon}</span>
                <span
                  className={`text-sm font-medium ${theme === t.id ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* System Icon */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <ImageIcon className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            系统图标
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-zinc-600 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden shrink-0">
              {systemIcon ? (
                <img src={systemIcon} alt="System Icon" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                上传自定义系统图标，将显示在左上角和浏览器标签页中。建议使用正方形的 PNG 或 SVG 图片。
              </p>
              <div className="flex items-center space-x-3">
                <label className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-sm font-medium">
                  <Upload className="w-4 h-4 mr-2" />
                  上传图标
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'icon')}
                  />
                </label>
                {systemIcon && (
                  <button
                    onClick={() => setSystemIcon(null)}
                    className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium"
                  >
                    恢复默认
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Login Background */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <Monitor className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            登录页背景
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-48 h-32 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-zinc-600 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden shrink-0">
              {loginBackground ? (
                <img src={loginBackground} alt="Login Background" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                上传自定义登录页背景图片。建议使用 1920x1080 分辨率的高清图片，以获得最佳显示效果。
              </p>
              <div className="flex items-center space-x-3">
                <label className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-sm font-medium">
                  <Upload className="w-4 h-4 mr-2" />
                  上传背景
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'background')}
                  />
                </label>
                {loginBackground && (
                  <button
                    onClick={() => setLoginBackground(null)}
                    className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium"
                  >
                    恢复默认
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
