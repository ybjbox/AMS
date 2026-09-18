import PageContainer from "@/components/PageContainer";
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Building2,
  User,
  Sliders,
  BellRing,
  Palette,
  Code2,
  TerminalSquare,
  Monitor,
  DatabaseBackup,
  Bot,
  History,
  ShieldCheck,
  Activity,
  Megaphone,
  Send,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DepartmentsPanel from './panels/DepartmentsPanel';
import ProfilePanel from './panels/ProfilePanel';
import AppearancePanel from './panels/AppearancePanel';
import PreferencesPanel from './panels/PreferencesPanel';
import RemindersPanel from './panels/RemindersPanel';
import NotifyPanel from './panels/NotifyPanel';
import ThemesPanel from './panels/ThemesPanel';
import ScriptsPanel from './panels/ScriptsPanel';
import LogsPanel from './panels/LogsPanel';
import BackupPanel from './panels/BackupPanel';
import AiConfigPanel from './panels/AiConfigPanel';
import AiHistoryPanel from './panels/AiHistoryPanel';
import PermissionMatrixPanel from './panels/PermissionMatrixPanel';
import DiagnosticsPanel from './panels/DiagnosticsPanel';
import AnnouncementsPanel from './panels/AnnouncementsPanel';

const tabs = [
  { id: 'departments', label: '部门与职位架构', icon: Building2 },
  { id: 'profile', label: '个人设置', icon: User },
  { id: 'appearance', label: '外观设置', icon: Monitor },
  { id: 'preferences', label: '系统偏好', icon: Sliders },
  { id: 'reminders', label: '提醒设置', icon: BellRing },
  { id: 'notify', label: '通知出站通道', icon: Send },
  { id: 'themes', label: '导出主题管理', icon: Palette },
  { id: 'scripts', label: '导出脚本模板', icon: Code2 },
  { id: 'backup', label: '数据库备份', icon: DatabaseBackup },
  { id: 'ai', label: 'AI 管理配置', icon: Bot },
  { id: 'ai-history', label: 'AI 会话记录', icon: History },
  { id: 'permissions', label: '权限矩阵', icon: ShieldCheck },
  { id: 'announcements', label: '公告管理', icon: Megaphone },
  { id: 'diagnostics', label: '运行诊断', icon: Activity },
  { id: 'logs', label: '系统日志', icon: TerminalSquare },
];

export default function Settings() {
  const location = useLocation();
  // Tab 初值优先级：URL ?tab= 参数（支持外部深链，如控制台"查看全部"）＞
  // 登录页强制改密携带的 { tab: 'profile' } ＞ 默认「部门与职位」
  const [activeTab, setActiveTab] = useState(() => {
    const fromQuery = new URLSearchParams(location.search).get('tab');
    const wanted = fromQuery || (location.state as { tab?: string } | null)?.tab;
    return tabs.some((t) => t.id === wanted) ? (wanted as string) : 'departments';
  });

  const currentTabLabel = tabs.find((t) => t.id === activeTab)?.label ?? '系统设置';
  useDocumentTitle(currentTabLabel);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'departments': return <DepartmentsPanel />;
      case 'profile': return <ProfilePanel />;
      case 'appearance': return <AppearancePanel />;
      case 'preferences': return <PreferencesPanel />;
      case 'reminders': return <RemindersPanel />;
      case 'notify': return <NotifyPanel />;
      case 'themes': return <ThemesPanel />;
      case 'scripts': return <ScriptsPanel />;
      case 'backup': return <BackupPanel />;
      case 'ai': return <AiConfigPanel />;
      case 'ai-history': return <AiHistoryPanel />;
      case 'permissions': return <PermissionMatrixPanel />;
      case 'announcements': return <AnnouncementsPanel />;
      case 'diagnostics': return <DiagnosticsPanel />;
      case 'logs': return <LogsPanel />;
      default: return null;
    }
  };

  return (
    <PageContainer width="none">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-500">
        <div className="shrink-0">
          <h1 className="page-title">系统设置</h1>
          <p className="page-subtitle">管理系统偏好、组织架构及个人信息</p>
        </div>

        <div className="flex-1 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* 移动端横向滚动 Tab（仅小屏显示） */}
          <div className="md:hidden border-b border-zinc-200 dark:border-zinc-700 p-2">
            <div className="tab-group" role="tablist" aria-label="设置导航">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
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
              })}
            </div>
          </div>

          {/* 桌面端侧边导航（仅大屏显示） */}
          <div className="hidden md:block w-64 bg-zinc-50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-700 p-4 shrink-0 overflow-y-auto">
            <nav className="space-y-1" role="tablist" aria-label="设置导航" aria-orientation="vertical">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
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
              })}
            </nav>
          </div>
          <div className="flex-1 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-0 flex flex-col overflow-hidden">
            {/* 面板切换动画：CSS 动画替代 AnimatePresence（避免面板组件因 exit 动画双挂载、
                重复发起面板内数据请求）。prefers-reduced-motion 由全局媒体查询降级。 */}
            <div
              key={activeTab}
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in slide-in-from-right-2 duration-200 ease-out"
            >
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
