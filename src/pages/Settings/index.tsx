import { Pressable } from '@/components/ui/Pressable';
import PageContainer from "@/components/PageContainer";
import React, { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  User,
  Sliders,
  Palette,
  Code2,
  TerminalSquare,
  Monitor,
  DatabaseBackup,
  Bot,
  History,

  Activity,
  Megaphone,
  Send,
  ChevronLeft,
  ArrowUpRight,
  ListOrdered,
  BellRing,
  KeyRound,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole } from '@/types';
import ProfilePanel from './panels/ProfilePanel';
import RolePermissionsPanel from './panels/RolePermissionsPanel';
import AppearancePanel from './panels/AppearancePanel';
import PreferencesPanel from './panels/PreferencesPanel';
import NotifyPanel from './panels/NotifyPanel';
import ThemesPanel from './panels/ThemesPanel';
import ScriptsPanel from './panels/ScriptsPanel';
import LogsPanel from './panels/LogsPanel';
import BackupPanel from './panels/BackupPanel';
import AiConfigPanel from './panels/AiConfigPanel';
import AiHistoryPanel from './panels/AiHistoryPanel';
import DiagnosticsPanel from './panels/DiagnosticsPanel';
import AnnouncementsPanel from './panels/AnnouncementsPanel';
import RemindersPanel from './panels/RemindersPanel';
import AccountsPanel from './panels/AccountsPanel';
import NavOrderPanel from './panels/NavOrderPanel';
import WeComPanel from './panels/WeComPanel';

/**
 * 设置页信息架构：按域分组 + 按角色门槛过滤。
 *
 * 注意：多数高危面板按角色秩（role rank）直接隐藏，后端 authGate / requireRole 才是硬约束。
 * 已登记能力码的面板（导出模板/主题、备份）额外按能力过滤，保证矩阵改动后入口与接口同源。
 * 部门管理不在此列：顶层 /departments 页面已有独立入口与路由权限（departments:view）。
 */
interface SettingsTab {
  id: string;
  label: string;
  icon: React.ElementType;
  minRole: SystemRole;
  /** 已登记能力码的面板：矩阵改动后入口随之隐藏 */
  permission?: string;
}

interface SettingsGroup {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  tabs: SettingsTab[];
}

const TAB_GROUPS: SettingsGroup[] = [
  {
    id: 'personal',
    title: '个人',
    description: '个人资料、外观与功能模块顺序',
    icon: User,
    tabs: [
      { id: 'profile', label: '个人设置', icon: User, minRole: SystemRole.EMPLOYEE },
      { id: 'appearance', label: '外观设置', icon: Monitor, minRole: SystemRole.EMPLOYEE },
      { id: 'nav-order', label: '功能模块排序', icon: ListOrdered, minRole: SystemRole.EMPLOYEE },
    ],
  },
  {
    id: 'ai',
    title: 'AI 助手',
    description: '模型配置与会话记录（超级管理员）',
    icon: Bot,
    tabs: [
      { id: 'ai', label: 'AI 管理配置', icon: Bot, minRole: SystemRole.SUPER_ADMIN },
      { id: 'ai-history', label: 'AI 会话记录', icon: History, minRole: SystemRole.SUPER_ADMIN },
    ],
  },
  {
    id: 'notify',
    title: '通知与公告',
    description: '到期提醒、出站通道与全员公告',
    icon: BellRing,
    tabs: [
      { id: 'reminders', label: '到期提醒', icon: BellRing, minRole: SystemRole.HR },
      { id: 'notify', label: '通知出站通道', icon: Send, minRole: SystemRole.ADMIN },
      { id: 'announcements', label: '公告管理', icon: Megaphone, minRole: SystemRole.ADMIN },
    ],
  },
  {
    id: 'data',
    title: '数据与导出',
    description: '导出主题、脚本模板与数据库备份',
    icon: DatabaseBackup,
    tabs: [
      { id: 'themes', label: '导出主题管理', icon: Palette, minRole: SystemRole.ADMIN, permission: 'export-templates:manage' },
      { id: 'scripts', label: '导出脚本模板', icon: Code2, minRole: SystemRole.ADMIN, permission: 'export-templates:manage' },
      { id: 'backup', label: '数据库备份', icon: DatabaseBackup, minRole: SystemRole.ADMIN, permission: 'backup:export' },
    ],
  },
  {
    id: 'system',
    title: '系统管理',
    description: '系统偏好、企微、账号、权限与诊断',
    icon: Sliders,
    tabs: [
      { id: 'preferences', label: '系统偏好', icon: Sliders, minRole: SystemRole.ADMIN },
      { id: 'wecom', label: '企业微信打卡', icon: Fingerprint, minRole: SystemRole.ADMIN },
      { id: 'accounts', label: '账号管理', icon: KeyRound, minRole: SystemRole.ADMIN },
      { id: 'diagnostics', label: '运行诊断', icon: Activity, minRole: SystemRole.ADMIN },
      { id: 'logs', label: '系统日志', icon: TerminalSquare, minRole: SystemRole.ADMIN },
      { id: 'role-permissions', label: '权限矩阵', icon: ShieldCheck, minRole: SystemRole.SUPER_ADMIN },
    ],
  },
];

const ROLE_RANK: Record<string, number> = {
  [SystemRole.EMPLOYEE]: 1,
  [SystemRole.HR]: 2,
  [SystemRole.ADMIN]: 3,
  [SystemRole.SUPER_ADMIN]: 4,
};

export default function Settings() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = (useUserStore((state) => state.userInfo?.role) ?? '').toUpperCase();
  const hasPermission = useUserStore((state) => state.hasPermission);
  const rank = ROLE_RANK[role] ?? 0;

  const groups = useMemo(
    () =>
      TAB_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter(
          (tab) =>
            (ROLE_RANK[tab.minRole] ?? 4) <= rank &&
            (!tab.permission || hasPermission(tab.permission))
        ),
      })).filter((group) => group.tabs.length > 0),
    [rank, hasPermission]
  );
  const visibleTabs = useMemo(() => groups.flatMap((group) => group.tabs), [groups]);

  // Tab 优先级：URL ?tab=（外部深链 / 前进后退）＞ 登录强制改密携带的 state.tab ＞ 首个可见 Tab。
  // 不可见或未授权的 tab 参数一律回退，避免深链绕过角色门槛。
  const wantedRaw =
    searchParams.get('tab') || (location.state as { tab?: string } | null)?.tab;
  const wanted = visibleTabs.find((t) => t.id === wantedRaw)?.id ?? '';
  // 多分组时先落在「设置首页」；单分组（如员工只有个人）直接进组，避免只有一张卡
  const activeTab = wanted || (groups.length === 1 ? groups[0]?.tabs[0]?.id ?? '' : '');
  const isHub = !activeTab && groups.length > 1;
  const activeGroup = groups.find((g) => g.tabs.some((t) => t.id === activeTab)) ?? null;

  const currentTabLabel = visibleTabs.find((t) => t.id === activeTab)?.label ?? '系统设置';
  useDocumentTitle(currentTabLabel);

  const backToHub = () => setSearchParams({});

  const handleTabChange = (tabId: string) => {
    if (tabId === activeTab) return;
    // setSearchParams 会保留 location.state（强制改密引导依赖它传给 ProfilePanel）
    setSearchParams({ tab: tabId });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile': return <ProfilePanel />;
      case 'appearance': return <AppearancePanel />;
      case 'nav-order': return <NavOrderPanel />;
      case 'preferences': return <PreferencesPanel />;
      case 'wecom': return <WeComPanel />;
      case 'notify': return <NotifyPanel />;
      case 'reminders': return <RemindersPanel />;
      case 'themes': return <ThemesPanel />;
      case 'scripts': return <ScriptsPanel />;
      case 'backup': return <BackupPanel />;
      case 'ai': return <AiConfigPanel />;
      case 'ai-history': return <AiHistoryPanel />;
      case 'accounts': return <AccountsPanel />;
      case 'announcements': return <AnnouncementsPanel />;
      case 'diagnostics': return <DiagnosticsPanel />;
      case 'logs': return <LogsPanel />;
      case 'role-permissions': return <RolePermissionsPanel />;
      default: return null;
    }
  };

  const renderTabButton = (tab: SettingsTab, mobile: boolean) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    if (mobile) {
      return (
        <Pressable
          key={tab.id}
          role="tab"
          aria-selected={isActive}
          onClick={() => handleTabChange(tab.id)}
          className={isActive ? 'tab-item-active' : 'tab-item'}
        >
          <Icon className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          {tab.label}
        </Pressable>
      );
    }
    return (
      <Pressable
        key={tab.id}
        role="tab"
        aria-selected={isActive}
        aria-controls={`panel-${tab.id}`}
        id={`tab-${tab.id}`}
        onClick={() => handleTabChange(tab.id)}
        className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
          isActive
            ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-400'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
        }`}
      >
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-brand-700 dark:text-brand-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
        {tab.label}
      </Pressable>
    );
  };

  return (
    <PageContainer width="none">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-400">
        <div className="shrink-0">
          <h1 className="page-title">{activeGroup && !isHub ? activeGroup.title : '系统设置'}</h1>
          <p className="page-subtitle">
            {isHub ? '按任务选择一组设置' : activeGroup?.description ?? '管理系统偏好、组织架构及个人信息'}
          </p>
        </div>

        {isHub ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group, index) => {
              const Icon = group.icon;
              return (
                <Pressable
                  key={group.id}
                  type="button"
                  onClick={() => handleTabChange(group.tabs[0].id)}
                  className="settings-card card-base card-lift group flex min-h-32 flex-col justify-between p-5 text-left"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="settings-card-index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <ArrowUpRight
                      className="size-4 text-zinc-300 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-zinc-600 dark:group-hover:text-brand-400"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-6 block">
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                      <span className="text-base font-semibold text-zinc-900 dark:text-white">{group.title}</span>
                    </span>
                    <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
                      {group.description}
                    </span>
                  </span>
                </Pressable>
              );
            })}
          </div>
        ) : activeGroup ? (
          <div className="flex-1 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-0">
            <div className="md:hidden border-b border-zinc-200 dark:border-zinc-700 p-2">
              <Pressable
                type="button"
                onClick={backToHub}
                className="mb-2 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-muted-foreground hover:text-zinc-900 dark:hover:text-white"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                全部设置
              </Pressable>
              <div className="tab-group mt-1" role="tablist" aria-label="设置导航">
                {activeGroup.tabs.map((tab) => renderTabButton(tab, true))}
              </div>
            </div>

            <div className="hidden md:block relative w-56 bg-zinc-50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-700 shrink-0 min-h-0">
              <div className="absolute inset-0 overflow-y-auto overflow-x-hidden no-scrollbar p-4">
                <Pressable
                  type="button"
                  onClick={backToHub}
                  className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-zinc-900 dark:hover:text-white"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  全部设置
                </Pressable>
                <nav className="mt-4 space-y-1" role="tablist" aria-label="设置导航" aria-orientation="vertical">
                  {activeGroup.tabs.map((tab) => renderTabButton(tab, false))}
                </nav>
              </div>
            </div>

            <div className="flex-1 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-0 flex flex-col overflow-hidden">
              <div
                key={activeTab}
                role="tabpanel"
                id={`panel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in slide-in-from-right-2 duration-250 ease-smooth-out"
              >
                {renderContent()}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">没有可用的设置项。</p>
        )}
      </div>
    </PageContainer>
  );
}
