import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAppSettings, useLoadingStore } from '../store/appSettings';
import { useUserStore } from '../store/useUserStore';
import { authService, toUserInfo } from '../services/auth';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const globalLoading = useLoadingStore((state) => state.globalLoading);
  const setLoading = useLoadingStore((state) => state.setLoading);
  const loading = globalLoading;
  const setUser = useUserStore((state) => state.setUser);
  const navigate = useNavigate();
  const loginBackground = useAppSettings((state) => state.loginBackground);
  const systemIcon = useAppSettings((state) => state.systemIcon);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = useCallback(
    async (data: LoginFormValues) => {
      setLoading(true);
      try {
        const res = await authService.login(data.username, data.password);
        setUser(toUserInfo(res.user), res.token);
        if (res.user.mustChangePassword) {
          // 强制改密：引导到个人设置的安全页（改密前业务接口会被后端 403 拦截）
          navigate('/settings', { state: { tab: 'profile', mustChangePassword: true } });
        } else {
          navigate('/');
        }
      } catch (err) {
        const message = (err as { error?: string })?.error || '登录失败，请检查用户名和密码';
        const { toast } = await import('sonner');
        toast.error(message);
      } finally {
        // 成功与失败都要关闭全局 loading；此前成功路径漏关，
        // 导致登录后遮罩永挂（遮罩挡住整个应用）
        setLoading(false);
      }
    },
    [setLoading, setUser, navigate]
  );

  return (
    <main
      className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden"
      style={
        loginBackground
          ? {
              backgroundImage: `url(${loginBackground})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : {}
      }
    >
      {/* 背景装饰 */}
      {!loginBackground && (
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand-100/50 dark:bg-brand-900/20 blur-3xl" />
          <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] rounded-full bg-slate-100/50 dark:bg-slate-900/20 blur-3xl" />
        </div>
      )}

      {loginBackground && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm -z-10" />}

      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex justify-center">
          <div className="w-14 h-14 brand-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-brand-600/20 overflow-hidden">
            {systemIcon ? (
              <img src={systemIcon} alt="Logo" width={96} height={96} className="w-full h-full object-contain bg-white dark:bg-zinc-800" />
            ) : (
              <Building2 className="h-8 w-8 text-white" />
            )}
          </div>
        </div>
        <h1
          className={`mt-6 text-center text-2xl font-bold tracking-tight ${loginBackground ? 'text-white' : 'text-zinc-900 dark:text-white'}`}
        >
          登录行政管理系统
        </h1>
        <p
          className={`mt-2 text-center text-sm ${loginBackground ? 'text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}
        >
          企业级后台管理解决方案
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
        <div className="bg-white dark:bg-zinc-800 py-8 px-4 shadow-xl shadow-zinc-200/40 dark:shadow-none border border-zinc-100 dark:border-zinc-700 sm:rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                用户名
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  {...register('username')}
                  id="username"
                  type="text"
                  autoComplete="username"
                  spellCheck={false}
                  className={`input-base pl-10 py-2.5 sm:text-sm ${errors.username ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                  placeholder="请输入用户名"
                />
              </div>
              {errors.username && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.username.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                密码
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  {...register('password')}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`input-base pl-10 pr-10 py-2.5 sm:text-sm ${errors.password ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-brand-600 focus:ring-brand-600 border-zinc-200/80 dark:border-zinc-600 rounded cursor-pointer"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 flex items-center min-h-11 -my-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  记住我
                </label>
              </div>

              <div className="text-sm">
                <button
                  type="button"
                  onClick={() => {
                    // 功能待接入后端，暂时提示
                    import('sonner').then(({ toast }) => {
                      toast.info('忘记密码功能暂未开放，请联系管理员重置');
                    });
                  }}
                  className="font-medium text-sm text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                >
                  忘记密码？
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className="btn-primary w-full py-2.5 sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed group focus:ring-2 focus:ring-offset-2 focus:ring-brand-600"
              >
                {loading || isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    登录系统
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                    开发模式 · 初始凭据见服务端启动日志
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
