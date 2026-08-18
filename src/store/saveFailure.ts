import { toast } from 'sonner';
import { useNotificationStore } from './useNotificationStore';
import { describeSaveError, isNetworkOrAuthError } from './saveFailureCore';

export { describeSaveError, isNetworkOrAuthError } from './saveFailureCore';

export interface SaveFailureOptions {
  /** 给用户看的操作标题，例如「部门架构保存失败」「删除主题失败」 */
  title: string;
  /** 写操作的 rejection 值（来自 api.ts 拦截器） */
  error: unknown;
  /** 可选的重试回调；提供后 toast 带「重试」按钮 */
  retry?: () => void;
}

/**
 * 保存/写操作失败的统一兜底：
 * 1. 弹一个带后端原因 + 「重试」按钮的红色 toast；
 * 2. 同时写入通知中心（即使 toast 被关掉也能在通知里看到）。
 *
 * 网络错误 / 401 由 api.ts 全局拦截器已经弹过通用提示并可能触发跳转，
 * 这里主动跳过 toast，避免重复打扰；但仍会写通知中心以便追溯。
 */
export function notifySaveFailure(opts: SaveFailureOptions): void {
  const message = describeSaveError(opts.error);

  // 写通知中心（幂等、不依赖 UI）
  useNotificationStore.getState().addNotification({
    type: 'error',
    title: opts.title,
    message,
  });

  if (isNetworkOrAuthError(opts.error)) return;

  toast.error(`${opts.title}：${message}`, {
    description: '操作未生效，请检查后重试。',
    duration: 8000,
    action: opts.retry
      ? {
          label: '重试',
          onClick: () => {
            toast.dismiss();
            opts.retry?.();
          },
        }
      : undefined,
  });
}
