import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, User, Sliders, BellRing, Palette, Code2, TerminalSquare, Monitor } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DepartmentsPanel from './panels/DepartmentsPanel';
import ProfilePanel from './panels/ProfilePanel';
import AppearancePanel from './panels/AppearancePanel';
import PreferencesPanel from './panels/PreferencesPanel';
import RemindersPanel from './panels/RemindersPanel';
import ThemesPanel from './panels/ThemesPanel';
import ScriptsPanel from './panels/ScriptsPanel';
import LogsPanel from './panels/LogsPanel';

const tabs = [
  { id: 'departments', label: '部门与职位架构', icon: Building2 },
  { id: 'profile', label: '个人设置', icon: User },
  { id: 'appearance', label: '外观设置', icon: Monitor },
  { id: 'preferences', label: '系统偏好', icon: Sliders },
  { id: 'reminders', label: '提醒设置', icon: BellRing },
  { id: 'themes', label: '导出主题管理', icon: Palette },
  { id: 'scripts', label: '导出脚本模板', icon: Code2 },
  { id: 'logs', label: '系统日志', icon: TerminalSquare },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('departments');

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
      case 'themes': return <ThemesPanel />;
      case 'scripts': return <ScriptsPanel />;
      case 'logs': return <LogsPanel />;
      default: return null;
    }
  };

  return (
    <div className="w-full flex flex-col p-4 sm:p-6 lg:p-8 min-h-full">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-500">
        <div className="shrink-0">
          <h1 className="page-title">系统设置</h1>
          <p className="page-subtitle">管理系统偏好、组织架构及个人信息</p>
        </div>

        <div className="flex-1 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-2xl overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* 移动端横向滚动 Tab（仅小屏显示） */}
          <div className="md:hidden border-b border-zinc-200 dark:border-zinc-700 p-2">
            <div className="tab-group">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={isActive ? 'tab-item-active' : 'tab-item'}
                    aria-current={isActive ? 'page' : undefined}
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
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex-1 bg-zinc-50/30 dark:bg-zinc-900/30 min-h-0 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                role="tabpanel"
                id={`panel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
