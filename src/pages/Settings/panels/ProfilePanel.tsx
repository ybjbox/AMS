import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { authService, toUserInfo } from '@/services/auth';
import { useUserStore } from '@/store/useUserStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/useConfirm';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z
      .string()
      .min(10, '新密码至少 10 位')
      .regex(/[A-Za-z]/, '新密码必须包含字母')
      .regex(/[0-9]/, '新密码必须包含数字'),
    confirmPassword: z.string().min(1, '请再次输入新密码'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的新密码不一致',
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ProfilePanel() {
  const location = useLocation();
  const setUser = useUserStore((s) => s.setUser);
  const userInfo = useUserStore((s) => s.userInfo);
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  // 登录页检测到 mustChangePassword 时会带 state 跳转过来（强制改密引导）
  const mustChangePassword = Boolean(
    (location.state as { mustChangePassword?: boolean } | null)?.mustChangePassword
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ChangePasswordForm) => {
    if (!mustChangePassword) {
      const ok = await confirm({
        title: '确认修改密码？',
        description: '修改成功后当前及所有已登录会话将被吊销，需要使用新密码重新登录。',
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const res = await authService.changePassword(values.currentPassword, values.newPassword);
      // 后端已吊销旧会话并签发新 token，同步更新本地凭据
      setUser(toUserInfo(res.user), res.token);
      toast.success('密码修改成功');
      reset();
    } catch (err) {
      toast.error((err as { error?: string })?.error || '密码修改失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">个人设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">管理您的账号安全</p>
      </div>

      {mustChangePassword && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">首次登录，请先修改初始密码</p>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-1">
              修改密码前，员工管理等业务功能暂时不可用（后端将返回 403）。
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm p-6 max-w-xl">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-white">修改登录密码</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="currentPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              当前密码
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {errors.currentPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.currentPassword.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              新密码（至少 10 位，含字母和数字）
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {errors.newPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              确认新密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div className="pt-1 flex items-center justify-between">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              当前账号：{userInfo?.username ?? '-'}
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {submitting ? '提交中…' : '修改密码'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm mt-6 max-w-xl">
        <EmptyState
          icon={UserCog}
          title="个人资料编辑"
          description="头像上传与资料维护功能正在开发中，敬请期待"
          className="py-12"
        />
      </div>
    </div>
  );
}
