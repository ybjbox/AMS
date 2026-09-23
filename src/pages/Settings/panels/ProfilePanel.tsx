import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { authService, toUserInfo } from '@/services/auth';
import { useUserStore } from '@/store/useUserStore';
import { useConfirm } from '@/hooks/useConfirm';
import { DEFAULT_USER_AVATAR } from '@/config/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const profileSchema = z.object({
  displayName: z.string().trim().min(1, '请输入显示名称').max(30, '显示名称最多 30 个字符'),
  email: z
    .string()
    .trim()
    .max(120, '邮箱过长')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), '邮箱格式不正确'),
  /** 头像 base64 data URL；空串 = 使用默认头像 */
  avatar: z.string().max(50_000, '头像数据过大'),
});

type ProfileForm = z.infer<typeof profileSchema>;

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
  const token = useUserStore((s) => s.token);
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  // 登录页检测到 mustChangePassword 时会带 state 跳转过来（强制改密引导）
  const mustChangePassword = Boolean(
    (location.state as { mustChangePassword?: boolean } | null)?.mustChangePassword
  );

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: '', email: '', avatar: '' },
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatar = profileForm.watch('avatar');

  // 挂载时从 /auth/me 取最新资料回填（localStorage 里的旧缓存可能缺 displayName/email/avatar）
  useEffect(() => {
    let cancelled = false;
    authService
      .me()
      .then((res) => {
        if (cancelled) return;
        profileForm.reset({
          displayName: res.user.displayName ?? '',
          email: res.user.email ?? '',
          avatar: res.user.avatar ?? '',
        });
      })
      .catch(() => {
        if (cancelled) return;
        profileForm.reset({
          displayName: userInfo?.displayName ?? '',
          email: userInfo?.email ?? '',
          avatar: userInfo?.avatar ?? '',
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 本地裁剪压缩：任意图片 → 居中方形 128px data URL（≤50k 字符，与后端校验一致） */
  const handleAvatarFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片过大，请选择 5MB 以内的图片');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const SIZE = 128;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        toast.error('当前浏览器不支持头像处理');
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE); // JPEG/WebP 兜底：透明图垫白底
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      let dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (dataUrl.length > 50_000) {
        toast.error('图片内容过于复杂，压缩后仍超限，请更换图片');
        return;
      }
      profileForm.setValue('avatar', dataUrl, { shouldDirty: true });
      toast.success('头像已就绪，点击「保存资料」生效');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('图片读取失败，请更换图片');
    };
    img.src = url;
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onProfileSubmit = async (values: ProfileForm) => {
    setSavingProfile(true);
    try {
      const res = await authService.updateProfile(values.displayName, values.email, values.avatar ?? '');
      // 同步本地账户区显示；token 不变（该接口不吊销会话）
      if (token) setUser(toUserInfo(res.user), token);
      toast.success('资料已更新');
    } catch (err) {
      toast.error((err as { error?: string })?.error || '资料更新失败，请稍后重试');
    } finally {
      setSavingProfile(false);
    }
  };

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
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-400">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">个人设置</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">管理您的个人资料与账号安全</p>
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
          <UserCog className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-white">基本信息</h3>
        </div>
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4" noValidate>
          <div className="flex items-center gap-4">
            <img
              src={avatar || DEFAULT_USER_AVATAR}
              alt="当前头像"
              className="w-16 h-16 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-zinc-700 bg-white dark:bg-zinc-900"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Camera className="w-3.5 h-3.5" />
                  上传头像
                </Button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => profileForm.setValue('avatar', '', { shouldDirty: true })}
                    className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    恢复默认
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                支持 PNG / JPG / WebP，自动居中裁剪为 128×128；未上传时使用默认头像
              </p>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleAvatarFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <div>
            <label htmlFor="displayName" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              显示名称
            </label>
            <Input
              id="displayName"
              autoComplete="nickname"
              {...profileForm.register('displayName')}
            />
            {profileForm.formState.errors.displayName && (
              <p className="text-xs text-red-500 mt-1">{profileForm.formState.errors.displayName.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="profileEmail" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              邮箱（用于接收通知，可留空）
            </label>
            <Input
              id="profileEmail"
              type="email"
              autoComplete="email"
              {...profileForm.register('email')}
            />
            {profileForm.formState.errors.email && (
              <p className="text-xs text-red-500 mt-1">{profileForm.formState.errors.email.message}</p>
            )}
          </div>
          <div className="pt-1 flex items-center justify-between">
            {profileForm.formState.isDirty ? (
              <span className="text-xs text-muted-foreground">
                登录账号：{userInfo?.username ?? '-'}（用户名由管理员维护，不可自助修改）
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {savingProfile ? '正在保存…' : '修改上方信息后即可保存（用户名由管理员维护，不可自助修改）'}
              </span>
            )}
            <Button
              type="submit"
              disabled={savingProfile || !profileForm.formState.isDirty}
              title={profileForm.formState.isDirty ? undefined : '暂无修改，内容变更后可保存'}
            >
              {savingProfile ? '保存中…' : '保存资料'}
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm p-6 mt-6 max-w-xl">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-white">修改登录密码</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="currentPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              当前密码
            </label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.currentPassword.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              新密码（至少 10 位，含字母和数字）
            </label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm text-zinc-600 dark:text-zinc-300 mb-1.5">
              确认新密码
            </label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div className="pt-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              当前账号：{userInfo?.username ?? '-'}
            </span>
            <Button type="submit" disabled={submitting}>
              {submitting ? '提交中…' : '修改密码'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
