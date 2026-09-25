import PageContainer from "@/components/PageContainer";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  ListOrdered,
  BellRing,
  KeyRound,
  Fingerprint,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUserStore } from '@/store/useUserStore';
import { SystemRole } from '@/types';
import ProfilePanel from './panels/ProfilePanel';
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
 * 注意：这里刻意不走 hasPermission()——严格权限开关关闭时它恒为 true，且权限矩阵
 * 存在浏览器 localStorage 可被篡改；设置页的多数面板对应高危后端接口，
 * 前端入口按角色秩（role rank）直接隐藏，后端 authGate / requireRole 才是硬约束。
 * 部门管理不在此列：顶层 /departments 页面已有独立入口与路由权限（departments:view）。
 */
interface SettingsTab {
  id: string;
  label: string;
  icon: React.ElementType;
  minRole: SystemRole;
}

const TAB_GROUPS: { title: string; tabs: SettingsTab[] }[] = [
  {
    title: '个人',
    tabs: [
      { id: 'profile', label: '个人设置', icon: User, minRole: SystemRole.EMPLOYEE },
      { id: 'appearance', label: '外观设置', icon: Monitor, minRole: SystemRole.EMPLOYEE },
      { id: 'nav-order', label: '功能模块排序', icon: ListOrdered, minRole: SystemRole.EMPLOYEE },
    ],
  },
  {
    title: 'AI 助手',
    tabs: [
      { id: 'ai', label: 'AI 管理配置', icon: Bot, minRole: SystemRole.SUPER_ADMIN },
      { id: 'ai-history', label: 'AI 会话记录', icon: History, minRole: SystemRole.SUPER_ADMIN },
    ],
  },
  {
    title: '通知与公告',
    tabs: [
      { id: 'reminders', label: '到期提醒', icon: BellRing, minRole: SystemRole.HR },
      { id: 'notify', label: '通知出站通道', icon: Send, minRole: SystemRole.ADMIN },
      { id: 'announcements', label: '公告管理', icon: Megaphone, minRole: SystemRole.ADMIN },
    ],
  },
  {
    title: '数据与导出',
    tabs: [
      { id: 'themes', label: '导出主题管理', icon: Palette, minRole: SystemRole.ADMIN },
      { id: 'scripts', label: '导出脚本模板', icon: Code2, minRole: SystemRole.ADMIN },
      { id: 'backup', label: '数据库备份', icon: DatabaseBackup, minRole: SystemRole.ADMIN },
    ],
  },
  {
    title: '系统管理',
    tabs: [
      { id: 'preferences', label: '系统偏好', icon: Sliders, minRole: SystemRole.ADMIN },
      { id: 'wecom', label: '企业微信打卡', icon: Fingerprint, minRole: SystemRole.ADMIN },
      { id: 'accounts', label: '账号管理', icon: KeyRound, minRole: SystemRole.ADMIN },
      { id: 'diagnostics', label: '运行诊断', icon: Activity, minRole: SystemRole.ADMIN },
      { id: 'logs', label: '系统日志', icon: TerminalSquare, minRole: SystemRole.ADMIN },
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
  const rank = ROLE_RANK[role] ?? 0;

  const groups = useMemo(
    () =>
      TAB_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => (ROLE_RANK[tab.minRole] ?? 4) <= rank),
      })).filter((group) => group.tabs.length > 0),
    [rank]
  );
  const visibleTabs = useMemo(() => groups.flatMap((group) => group.tabs), [groups]);

  // Tab 优先级：URL ?tab=（外部深链 / 前进后退）＞ 登录强制改密携带的 state.tab ＞ 首个可见 Tab。
  // 不可见或未授权的 tab 参数一律回退，避免深链绕过角色门槛。
  const wanted =
    searchParams.get('tab') || (location.state as { tab?: string } | null)?.tab;
  const activeTab =
    visibleTabs.find((t) => t.id === wanted)?.id ?? visibleTabs[0]?.id ?? '';

  const currentTabLabel = visibleTabs.find((t) => t.id === activeTab)?.label ?? '系统设置';
  useDocumentTitle(currentTabLabel);

  const handleTabChange = (tabId: string) => {
    if (tabId === activeTab) return;
    // setSearchParams 会保留 location.state（强制改密引导依赖它传给 ProfilePanel）
    setSearchParams({ tab: tabId });
  };

  // 桌面端侧栏导航：隐藏滚动条，改为底部渐隐 + 下箭头示意「下方还有分组」（与主侧栏一致），滚到底自动消失
  const navRef = useRef<HTMLDivElement | null>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const updateScrollHint = useCallback(() => {
    const el = navRef.current;
    if (el) setCanScrollDown(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }, []);
  useEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [updateScrollHint, groups]);

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
      default: return null;
    }
  };

  const renderTabButton = (tab: SettingsTab, mobile: boolean) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    if (mobile) {
      return (
        <button
          key={tab.id}
          role="tab"
          aria-selected={isActive}
          onClick={() => handleTabChange(tab.id)}
          className={isActive ? 'tab-item-active' : 'tab-item'}
        >
          <Icon className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          {tab.label}
        </button>
      );
    }
    return (
      <button
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
      </button>
    );
  };

  return (
    <PageContainer width="none">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-400">
        <div className="shrink-0">
          <h1 className="page-title">系统设置</h1>
          <p className="page-subtitle">管理系统偏好、组织架构及个人信息</p>
        </div>

        <div className="flex-1 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* 移动端横向滚动 Tab（仅小屏显示） */}
          <div className="md:hidden border-b border-zinc-200 dark:border-zinc-700 p-2">
            <div className="tab-group" role="tablist" aria-label="设置导航">
              {visibleTabs.map((tab) => renderTabButton(tab, true))}
            </div>
          </div>

          {/* 桌面端分组侧边导航（仅大屏显示）：absolute 滚动容器 + 底部渐隐箭头提示 */}
          <div className="hidden md:block relative w-48 bg-zinc-50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-700 shrink-0 min-h-0">
            <div ref={navRef} onScroll={updateScrollHint} className="absolute inset-0 overflow-y-auto overflow-x-hidden no-scrollbar p-4">
              <nav className="space-y-5" role="tablist" aria-label="设置导航" aria-orientation="vertical">
                {groups.map((group) => (
                  <div key={group.title}>
                    <p className="px-3 mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </p>
                    <div className="space-y-1">{group.tabs.map((tab) => renderTabButton(tab, false))}</div>
                  </div>
                ))}
              </nav>
            </div>
            {canScrollDown && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 flex items-end justify-center pb-1.5 bg-gradient-to-t from-zinc-50 via-zinc-50/70 to-transparent dark:from-zinc-900 dark:via-zinc-900/70"
              >
                <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-zinc-500 animate-bounce [animation-duration:1.6s]" />
              </div>
            )}
          </div>
          <div className="flex-1 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-0 flex flex-col overflow-hidden">
            {/* 面板切换动画：CSS 动画替代 AnimatePresence（避免面板组件因 exit 动画双挂载、
                重复发起面板内数据请求）。prefers-reduced-motion 由全局媒体查询降级。 */}
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
      </div>
    </PageContainer>
  );
}
