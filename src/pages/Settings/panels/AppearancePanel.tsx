import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Loader2, Monitor, Moon, Palette, Sun, Upload } from 'lucide-react';
import { DEFAULT_SYSTEM_ICON } from '@/config/constants';
import { useAppSettings } from '@/store/appSettings';
import { Button } from '@/components/ui/button';
import {
  BRANDING_LABELS,
  BRANDING_LIMITS,
  brandingApi,
  brandingError,
  type BrandingSlot,
} from '@/services/brandingApi';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * data URL → File（只用于把旧版本机图片搬上服务器）。
 * 直接解码而不是 fetch(dataUrl)：后者依赖运行时有 fetch/Response，
 * 且本站有 CSP —— connect-src 不放 data: 时这条迁移会静默失败。
 */
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : dataUrl;
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/png';
  const bytes = head.includes(';base64')
    ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    : Uint8Array.from(new TextEncoder().encode(decodeURIComponent(body)));
  return new File([bytes], name, { type: mime });
}

export default function AppearancePanel() {
  const theme = useAppSettings((state) => state.theme);
  const setTheme = useAppSettings((state) => state.setTheme);
  const loginBackground = useAppSettings((state) => state.loginBackground);
  const systemIcon = useAppSettings((state) => state.systemIcon);
  const setLoginBackground = useAppSettings((state) => state.setLoginBackground);
  const setSystemIcon = useAppSettings((state) => state.setSystemIcon);
  const [busy, setBusy] = useState<BrandingSlot | null>(null);

  const setSlotLocal = useCallback(
    (slot: BrandingSlot, url: string | null) => {
      if (slot === 'background') setLoginBackground(url);
      else setSystemIcon(url);
    },
    [setLoginBackground, setSystemIcon]
  );

  /**
   * 旧版本把整张图编成 base64 存在本机 localStorage（有撑爆配额、连带丢主题的风险）。
   * 打开面板时把这类残留搬上服务器，之后本机只保存一个地址。
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = useAppSettings.getState();
      const legacy: Array<[BrandingSlot, string]> = [];
      if (state.loginBackground?.startsWith('data:')) legacy.push(['background', state.loginBackground]);
      if (state.systemIcon?.startsWith('data:')) legacy.push(['icon', state.systemIcon]);
      if (!legacy.length) return;

      const status = await brandingApi.status().catch(() => null);
      if (!status || cancelled) return;
      for (const [slot, dataUrl] of legacy) {
        if (status[slot]) {
          setSlotLocal(slot, status[slot]!.url); // 服务器已有更新的图，本机旧值直接作废
          continue;
        }
        try {
          const file = await dataUrlToFile(dataUrl, `legacy-${slot}`);
          const r = await brandingApi.upload(slot, file);
          if (!cancelled) setSlotLocal(slot, r.url);
        } catch {
          /* 迁移失败就继续用本机值，下次打开面板再试 */
        }
      }
      if (!cancelled) toast.info('已把此前仅存于本机的图片迁移到服务器');
    })();
    return () => {
      cancelled = true;
    };
  }, [setSlotLocal]);

  const onThemeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const themeId = e.currentTarget.dataset.themeid as 'light' | 'dark' | 'system';
      if (themeId) {
        setTheme(themeId);
      }
    },
    [setTheme]
  );

  const handleUpload = useCallback(
    async (slot: BrandingSlot, file: File | undefined) => {
      if (!file) return;
      if (file.size > BRANDING_LIMITS[slot]) {
        toast.error(`${BRANDING_LABELS[slot]}超过 ${Math.round(BRANDING_LIMITS[slot] / 1024 / 1024)}MB 上限`);
        return;
      }
      setBusy(slot);
      try {
        const r = await brandingApi.upload(slot, file);
        setSlotLocal(slot, r.url);
        toast.success(`${BRANDING_LABELS[slot]}已更新，所有浏览器与设备立即生效`);
      } catch (e) {
        toast.error(brandingError(e, `${BRANDING_LABELS[slot]}上传失败`));
      } finally {
        setBusy(null);
      }
    },
    [setSlotLocal]
  );

  const handleReset = useCallback(
    async (slot: BrandingSlot) => {
      setBusy(slot);
      try {
        await brandingApi.remove(slot);
        setSlotLocal(slot, null);
        toast.success(`${BRANDING_LABELS[slot]}已恢复默认`);
      } catch (e) {
        toast.error(brandingError(e, `${BRANDING_LABELS[slot]}恢复失败`));
      } finally {
        setBusy(null);
      }
    },
    [setSlotLocal]
  );

  const uploadButton = (slot: BrandingSlot, label: string) => (
    <label className="flex items-center px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-sm font-medium">
      {busy === slot ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
      {label}
      <input
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={busy !== null}
        onChange={(e) => {
          void handleUpload(slot, e.target.files?.[0]);
          // 重置 input，允许重复选择同一文件
          e.target.value = '';
        }}
      />
    </label>
  );

  const resetButton = (slot: BrandingSlot, current: string | null) =>
    current ? (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy === slot}
        onClick={() => void handleReset(slot)}
      >
        恢复默认
      </Button>
    ) : null;

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">外观设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">自定义系统主题、图标和登录页背景</p>
      </div>

      <div className="bg-white dark:bg-zinc-800 p-6 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl space-y-8">
        {/* Theme Selection */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <Palette className="w-5 h-5 mr-2 text-brand-600 dark:text-brand-400" />
            主题模式
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { id: 'light', label: '浅色模式', Icon: Sun },
              { id: 'dark', label: '深色模式', Icon: Moon },
              { id: 'system', label: '跟随系统', Icon: Monitor },
            ].map((t) => (
              <button
                key={t.id}
                data-themeid={t.id}
                onClick={onThemeClick}
                className={`flex flex-col items-center p-4 rounded-xl border transition ${
                  theme === t.id
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20 ring-2 ring-brand-600/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-200/80 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                }`}
              >
                <t.Icon className="w-6 h-6 mb-2" aria-hidden="true" />
                <span
                  className={`text-sm font-medium ${theme === t.id ? 'text-brand-700 dark:text-brand-400' : 'text-zinc-700 dark:text-zinc-300'}`}
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
            <ImageIcon className="w-5 h-5 mr-2 text-brand-600 dark:text-brand-400" />
            系统图标
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-zinc-600 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden shrink-0">
              <img
                src={systemIcon || DEFAULT_SYSTEM_ICON}
                alt="系统图标预览"
                width={96}
                height={96}
                className={`w-full h-full object-contain ${systemIcon ? '' : 'rounded-lg'}`}
              />
            </div>
            <div className="flex-1">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                自定义系统图标将显示在左上角与浏览器标签页。支持 PNG / JPEG / WebP / GIF，1MB 以内，建议使用正方形图片；不上传时使用内置默认图标。
              </p>
              <div className="flex items-center space-x-3">
                {uploadButton('icon', '上传图标')}
                {resetButton('icon', systemIcon)}
              </div>
            </div>
          </div>
        </div>

        {/* Login Background */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4 flex items-center">
            <Monitor className="w-5 h-5 mr-2 text-brand-600 dark:text-brand-400" />
            登录页背景
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-48 h-32 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-zinc-600 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden shrink-0">
              {loginBackground ? (
                <img src={loginBackground} alt="登录页背景预览" width={192} height={128} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                登录页整屏背景图。支持 PNG / JPEG / WebP / GIF，5MB 以内，建议使用 1920x1080 横图；不上传时使用默认渐变底。
              </p>
              <div className="flex items-center space-x-3">
                {uploadButton('background', '上传背景')}
                {resetButton('background', loginBackground)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
