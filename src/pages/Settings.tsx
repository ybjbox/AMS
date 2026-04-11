import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  User,
  Sliders,
  ShieldCheck,
  BellRing,
  Palette,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Code2,
  FileCode,
  Monitor,
  Image as ImageIcon,
  Upload,
  TerminalSquare,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import Departments from './Departments';
import SystemLogs from '../components/SystemLogs';
import { useUserStore } from '../store/useUserStore';
import { useAppSettings } from '../store/appSettings';
import { SystemRole } from '../types';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('departments');
  const userInfo = useUserStore((state) => state.userInfo);
  const enableStrictPermission = useAppSettings((state) => state.enableStrictPermission);
  const setEnableStrictPermission = useAppSettings((state) => state.setEnableStrictPermission);

  const handleRoleChange = useCallback(
    (role: SystemRole) => {
      if (userInfo) {
        useUserStore.getState().setUser(
          {
            ...userInfo,
            role: role,
          },
          useUserStore.getState().token || ''
        );
      }
    },
    [userInfo]
  );

  const onRoleChangeClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const role = e.currentTarget.dataset.role as SystemRole;
      if (role) {
        handleRoleChange(role);
      }
    },
    [handleRoleChange]
  );

  return (
    <div className="flex-1 flex flex-col space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto w-full min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">系统设置</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理系统偏好、组织架构及个人信息</p>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden flex flex-col md:flex-row min-h-0">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-slate-50 dark:bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 p-4 shrink-0 overflow-y-auto custom-scrollbar">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('departments')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'departments'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2
                className={`w-5 h-5 mr-3 ${activeTab === 'departments' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              部门与职位架构
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'profile'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User
                className={`w-5 h-5 mr-3 ${activeTab === 'profile' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              个人设置
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'appearance'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Monitor
                className={`w-5 h-5 mr-3 ${activeTab === 'appearance' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              外观设置
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'preferences'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders
                className={`w-5 h-5 mr-3 ${activeTab === 'preferences' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              系统偏好
            </button>
            <button
              onClick={() => setActiveTab('reminders')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'reminders'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BellRing
                className={`w-5 h-5 mr-3 ${activeTab === 'reminders' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              提醒设置
            </button>
            <button
              onClick={() => setActiveTab('themes')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'themes'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Palette
                className={`w-5 h-5 mr-3 ${activeTab === 'themes' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              导出主题管理
            </button>
            <button
              onClick={() => setActiveTab('scripts')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'scripts'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Code2
                className={`w-5 h-5 mr-3 ${activeTab === 'scripts' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              导出脚本模板
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'logs'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TerminalSquare
                className={`w-5 h-5 mr-3 ${activeTab === 'logs' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
              />
              系统日志
            </button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30 min-h-0 custom-scrollbar">
          {activeTab === 'departments' && (
            <div className="animate-in fade-in duration-300 h-full flex flex-col">
              <div className="mb-6 shrink-0">
                <h2 className="text-lg font-medium text-slate-900">部门与职位架构</h2>
                <p className="text-sm text-slate-500 mt-1">管理公司的组织架构、部门层级及职位名称</p>
              </div>
              <div className="flex-1 min-h-0">
                <Departments />
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-lg font-medium text-slate-900 mb-4">个人设置</h2>
              <div className="text-slate-500 text-sm">即将开发...</div>
            </div>
          )}

          {activeTab === 'appearance' && <AppearanceSettings />}

          {activeTab === 'preferences' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">系统偏好</h2>

              {/* 严格权限拦截开关 */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg">
                      <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">严格的权限拦截</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        开启后，系统将严格校验用户的页面访问和按钮操作权限。关闭则默认放行所有权限。
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEnableStrictPermission(!enableStrictPermission)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                      enableStrictPermission
                        ? 'bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    role="switch"
                    aria-checked={enableStrictPermission}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        enableStrictPermission ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">权限测试 (演示用)</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      切换当前登录用户的系统角色，测试不同的权限视图
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { role: SystemRole.SUPER_ADMIN, label: '超级管理员', desc: '拥有所有模块的完全访问权限' },
                    { role: SystemRole.ADMIN, label: '管理员', desc: '拥有大部分权限，无法修改系统设置' },
                    { role: SystemRole.HR, label: '人事主管', desc: '仅拥有员工管理权限' },
                    { role: SystemRole.EMPLOYEE, label: '普通员工', desc: '仅拥有查看权限，无法修改数据' },
                  ].map((item) => (
                    <button
                      key={item.role}
                      data-role={item.role}
                      onClick={onRoleChangeClick}
                      className={`flex flex-col p-4 rounded-xl border text-left transition-all ${
                        userInfo?.role === item.role
                          ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                          : 'border-slate-200 hover:border-zinc-200/80 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${userInfo?.role === item.role ? 'text-blue-700' : 'text-slate-900'}`}
                      >
                        {item.label}
                      </span>
                      <span className="text-xs text-slate-500 mt-1">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'themes' && <ExportThemeSettings />}

          {activeTab === 'scripts' && <ExportScriptSettings />}

          {activeTab === 'logs' && <SystemLogs />}
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'icon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock backend processing
    setTimeout(() => {
      const mockUrl =
        type === 'background' ? 'https://picsum.photos/seed/bg/1920/1080' : 'https://picsum.photos/seed/icon/200/200';

      if (type === 'background') {
        setLoginBackground(mockUrl);
      } else {
        setSystemIcon(mockUrl);
      }
      toast.success(`成功上传${type === 'background' ? '背景图' : '系统图标'} (Mock)`);
    }, 500);
  };

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-slate-900 dark:text-white">外观设置</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">自定义系统主题、图标和登录页背景</p>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl space-y-8">
        {/* Theme Selection */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
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
                    : 'border-slate-200 dark:border-slate-700 hover:border-zinc-200/80 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className="text-2xl mb-2">{t.icon}</span>
                <span
                  className={`text-sm font-medium ${theme === t.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* System Icon */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
            <ImageIcon className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            系统图标
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 overflow-hidden shrink-0">
              {systemIcon ? (
                <img src={systemIcon} alt="System Icon" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                上传自定义系统图标，将显示在左上角和浏览器标签页中。建议使用正方形的 PNG 或 SVG 图片。
              </p>
              <div className="flex items-center space-x-3">
                <label className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-zinc-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer text-sm font-medium">
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
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
            <Monitor className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            登录页背景
          </h3>
          <div className="flex items-start space-x-6">
            <div className="w-48 h-32 rounded-xl border-2 border-dashed border-zinc-200/80 dark:border-slate-600 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 overflow-hidden shrink-0">
              {loginBackground ? (
                <img src={loginBackground} alt="Login Background" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                上传自定义登录页背景图片。建议使用 1920x1080 分辨率的高清图片，以获得最佳显示效果。
              </p>
              <div className="flex items-center space-x-3">
                <label className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-zinc-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer text-sm font-medium">
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

function ExportScriptSettings() {
  const [scripts, setScripts] = useState<{ name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingScript, setEditingScript] = useState<{ name: string; code: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setScripts([
        { name: 'default_template', code: '// 默认导出模板' },
        { name: 'custom_template', code: '// 自定义导出模板' },
      ]);
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingScript.name || !editingScript.code) return;
    setSaving(true);
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setEditingScript(null);
      fetchScripts();
      toast.success('保存成功 (Mock)');
    } catch (error) {
      console.error('Failed to save script:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    // Mock backend processing
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      fetchScripts();
      toast.success(`删除成功: ${name} (Mock)`);
    } catch (error) {
      console.error('Failed to delete script:', error);
    }
  };

  const handleAdd = () => {
    setEditingScript({
      name: `template_${Date.now()}`,
      code: `/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {any[]} data - 员工数据
 * @param {any} config - 导出配置
 */
export default async function applyTemplate(worksheet, data, config) {
  const { title, columns } = config;
  
  // 自定义逻辑开始
  worksheet.addRow([title + " (脚本生成)"]);
  worksheet.addRow(columns.map(c => c.header));
  
  data.forEach(item => {
    worksheet.addRow(columns.map(c => item[c.key]));
  });
}`,
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">加载中...</div>;

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-slate-900">导出脚本模板</h2>
          <p className="text-sm text-slate-500 mt-1">
            使用 JavaScript 高度自定义 Excel 导出逻辑，支持 ExcelJS 所有 API
          </p>
        </div>
        {!editingScript && (
          <button
            onClick={handleAdd}
            className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            创建脚本
          </button>
        )}
      </div>

      {editingScript ? (
        <div className="bg-white rounded-xl border border-blue-200 shadow-md overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileCode className="w-5 h-5 text-blue-600" />
              <input
                type="text"
                value={editingScript.name}
                onChange={(e) => setEditingScript({ ...editingScript, name: e.target.value })}
                placeholder="脚本名称 (如: monthly_report)"
                className="bg-transparent border-b border-blue-300 focus:border-blue-600 outline-none px-1 font-semibold text-slate-900"
              />
              <span className="text-slate-400 font-mono text-sm">.js</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-95 transition-transform text-xs font-medium"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? '保存中...' : '保存脚本'}
              </button>
              <button
                onClick={() => setEditingScript(null)}
                className="flex items-center px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 active:scale-95 transition-transform text-xs font-medium"
              >
                取消
              </button>
            </div>
          </div>
          <div className="p-0">
            <textarea
              value={editingScript.code}
              onChange={(e) => setEditingScript({ ...editingScript, code: e.target.value })}
              className="w-full h-[500px] p-4 font-mono text-sm bg-slate-900 text-emerald-400 outline-none resize-none custom-scrollbar"
              spellCheck={false}
            />
          </div>
          <div className="p-3 bg-slate-800 text-[10px] text-slate-400 font-mono">
            提示: 脚本必须使用 export default 导出一个异步函数。
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scripts.map((script) => (
            <div
              key={script.name}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileCode className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingScript(script)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(script.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 truncate">{script.name}.js</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 font-mono">{script.code.substring(0, 100)}...</p>
            </div>
          ))}
          {scripts.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                title="暂无脚本模板"
                description="点击右上角创建"
                icon={Code2}
                action={
                  <button
                    onClick={handleAdd}
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    立即创建
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Theme {
  id: string;
  name: string;
  titleFill: string;
  headerFill: string;
  headerFontColor: string;
  zebraFill: string;
}

function ExportThemeSettings() {
  const [themes, setThemes] = useState<Record<string, Theme>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setThemes({
        theme_1: {
          id: 'theme_1',
          name: '默认主题',
          titleFill: 'FFF1F5F9',
          headerFill: 'FF2563EB',
          headerFontColor: 'FFFFFFFF',
          zebraFill: 'FFF8FAFC',
        },
      });
    } catch (error) {
      console.error('Failed to fetch themes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setEditingId(null);
      toast.success('保存成功 (Mock)');
    } catch (error) {
      console.error('Failed to save themes:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTheme = (id: string, field: keyof Theme, value: string) => {
    setThemes((prev: Record<string, Theme>) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleAddTheme = () => {
    const newId = `theme_${Date.now()}`;
    const newTheme = {
      id: newId,
      name: '新主题',
      titleFill: 'FFF1F5F9',
      headerFill: 'FF2563EB',
      headerFontColor: 'FFFFFFFF',
      zebraFill: 'FFF8FAFC',
    };
    setThemes((prev: Record<string, Theme>) => ({ ...prev, [newId]: newTheme }));
    setEditingId(newId);
  };

  const handleDeleteTheme = (id: string) => {
    if (id === 'default') {
      toast.warning('默认主题无法删除');
      return;
    }
    const newThemes = { ...themes };
    delete newThemes[id];
    setThemes(newThemes);
    handleSave(newThemes);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">加载中...</div>;

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-slate-900">导出主题管理</h2>
          <p className="text-sm text-slate-500 mt-1">自定义 Excel 导出的配色方案，包括标题、表头及隔行变色</p>
        </div>
        <button
          onClick={handleAddTheme}
          className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          新增主题
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {Object.values(themes).map((theme: Theme) => (
          <div
            key={theme.id}
            className={`bg-white rounded-xl border transition-all overflow-hidden ${
              editingId === theme.id ? 'border-blue-400 ring-4 ring-blue-600/5' : 'border-slate-200 shadow-sm'
            }`}
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className="w-8 h-8 rounded-lg shadow-inner"
                  style={{ backgroundColor: `#${theme.headerFill.substring(2)}` }}
                ></div>
                {editingId === theme.id ? (
                  <input
                    type="text"
                    value={theme.name}
                    onChange={(e) => handleUpdateTheme(theme.id, 'name', e.target.value)}
                    className="px-2 py-1 border border-blue-300 rounded text-sm font-semibold outline-none focus:outline-none focus:ring-4 focus:ring-blue-600/20 transition-all duration-200"
                  />
                ) : (
                  <h3 className="font-semibold text-slate-900">{theme.name}</h3>
                )}
                {theme.id === 'default' && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">默认</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {editingId === theme.id ? (
                  <>
                    <button
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="保存"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        fetchThemes();
                      }}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                      title="取消"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditingId(theme.id)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Palette className="w-4 h-4" />
                    </button>
                    {theme.id !== 'default' && (
                      <button
                        onClick={() => handleDeleteTheme(theme.id)}
                        className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Title Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">大标题背景色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.titleFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'titleFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-mono text-slate-600">#{theme.titleFill.substring(2)}</span>
                  </div>
                </div>

                {/* Header Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">表头背景色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.headerFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'headerFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-mono text-slate-600">#{theme.headerFill.substring(2)}</span>
                  </div>
                </div>

                {/* Header Font Color */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">表头文字颜色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.headerFontColor.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'headerFontColor', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-mono text-slate-600">#{theme.headerFontColor.substring(2)}</span>
                  </div>
                </div>

                {/* Zebra Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">隔行变色填充</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.zebraFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'zebraFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-mono text-slate-600">#{theme.zebraFill.substring(2)}</span>
                  </div>
                </div>
              </div>

              {/* Preview Area */}
              <div className="mt-8">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">效果预览</label>
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <div
                    className="h-10 flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: `#${theme.titleFill.substring(2)}` }}
                  >
                    员工信息表预览
                  </div>
                  <div className="h-8 grid grid-cols-3 gap-px bg-slate-200">
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      工号
                    </div>
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      姓名
                    </div>
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      部门
                    </div>
                  </div>
                  <div className="h-6 grid grid-cols-3 gap-px bg-slate-200">
                    <div className="bg-white flex items-center px-2 text-[10px]">001</div>
                    <div className="bg-white flex items-center px-2 text-[10px]">张三</div>
                    <div className="bg-white flex items-center px-2 text-[10px]">技术部</div>
                  </div>
                  <div className="h-6 grid grid-cols-3 gap-px bg-slate-200">
                    <div
                      className="flex items-center px-2 text-[10px]"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      002
                    </div>
                    <div
                      className="flex items-center px-2 text-[10px]"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      李四
                    </div>
                    <div
                      className="flex items-center px-2 text-[10px]"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      人事部
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
