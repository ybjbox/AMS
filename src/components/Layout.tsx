import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Menu, Bell, User, Building2, PanelLeftClose, PanelLeftOpen, Check, Trash2, ListTodo, Armchair, IdCard, Sun, Moon, Monitor, FileStack, Clock, FileSignature } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useTodoStore } from '../store/todos';
import { useUserStore } from '../store/users';
import { useAppSettings } from '../store/appSettings';
import { Permission } from '../types';

export default function Layout({ children }: { children?: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const { 
    notifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead, 
    clearNotifications,
    settings,
    addTodo,
    addNotification
  } = useTodoStore();
  const { users } = useUserStore();
  const { systemIcon, theme, setTheme } = useAppSettings();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  const location = useLocation();
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [sidebarOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // 自动检查合同到期和试用期转正
  useEffect(() => {
    if (!user) return;

    const today = new Date();
    
    users.forEach(emp => {
      if (emp.status === '离职') return;

      // 检查合同到期
      if (emp.contractExpiry) {
        const expiryDate = new Date(emp.contractExpiry);
        const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0 && diffDays <= settings.contractExpiryDays) {
          const title = '合同到期提醒';
          const message = `员工 ${emp.name} (${emp.id}) 的合同将于 ${emp.contractExpiry} 到期（剩余 ${diffDays} 天）`;
          
          // 只有当没有未完成的相同待办时才添加
          addTodo({
            title,
            description: message,
            dueDate: emp.contractExpiry,
            type: 'contract',
            targetId: emp.id
          });

          // 检查是否已经发送过该通知（简单检查）
          const hasNotification = notifications.some(n => n.title === title && n.message === message);
          if (!hasNotification) {
            addNotification({ title, message, type: 'warning' });
          }
        }
      }

      // 检查试用期转正
      if (emp.status === '试用期' && emp.joinDate) {
        const joinDate = new Date(emp.joinDate);
        // 假设试用期为3个月
        const conversionDate = new Date(joinDate.setMonth(joinDate.getMonth() + 3));
        const diffDays = Math.ceil((conversionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0 && diffDays <= settings.probationConversionDays) {
          const dateStr = conversionDate.toISOString().split('T')[0];
          const title = '试用期转正提醒';
          const message = `员工 ${emp.name} (${emp.id}) 的试用期将于 ${dateStr} 结束（剩余 ${diffDays} 天）`;
          
          addTodo({
            title,
            description: message,
            dueDate: dateStr,
            type: 'probation',
            targetId: emp.id
          });

          const hasNotification = notifications.some(n => n.title === title && n.message === message);
          if (!hasNotification) {
            addNotification({ title, message, type: 'info' });
          }
        }
      }
    });
  }, [users, settings, addTodo, addNotification, notifications, user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigation = [
    { name: '控制台', href: '/', icon: LayoutDashboard, permission: Permission.VIEW_DASHBOARD },
    { name: '员工管理', href: '/users', icon: Users, permission: Permission.VIEW_USERS },
    { name: '宴会排座', href: '/seating', icon: Armchair, permission: Permission.VIEW_DASHBOARD },
    { name: '会议台卡', href: '/name-cards', icon: IdCard, permission: Permission.VIEW_DASHBOARD },
    { name: '常用文件', href: '/documents', icon: FileStack, permission: Permission.VIEW_DASHBOARD },
    { name: '考勤管理', href: '/attendance', icon: Clock, permission: Permission.VIEW_DASHBOARD },
    { name: '合同管理', href: '/contracts', icon: FileSignature, permission: Permission.VIEW_DASHBOARD },
    { name: '待办事项', href: '/todos', icon: ListTodo, permission: Permission.VIEW_DASHBOARD },
    { name: '系统设置', href: '/settings', icon: Settings, permission: Permission.VIEW_SETTINGS },
  ].filter(item => hasPermission(item.permission));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300 flex">
      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-all duration-300 ease-in-out flex flex-col print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0 ${isCollapsed ? 'w-20' : 'w-56'}`}
      >
         {/* Logo */}
         <div className={`h-16 flex items-center border-b border-slate-200 dark:border-slate-700 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6'}`}>
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
             {systemIcon ? (
               <img src={systemIcon} alt="Logo" className="w-full h-full object-contain bg-white" />
             ) : (
               <Building2 className="h-5 w-5 text-white" />
             )}
           </div>
           {!isCollapsed && <span className="text-lg font-bold text-slate-800 dark:text-white ml-3 whitespace-nowrap overflow-hidden animate-in fade-in duration-300">行政管理系统</span>}
         </div>
         {/* Nav */}
         <nav className="p-4 space-y-2 flex-1 overflow-y-auto overflow-x-hidden">
           {navigation.map((item) => {
             const isActive = location.pathname === item.href;
             return (
               <Link 
                 key={item.name} 
                 to={item.href} 
                 onClick={() => setSidebarOpen(false)}
                 title={isCollapsed ? item.name : undefined}
                 className={`flex items-center py-3 rounded-lg transition-colors ${
                   isCollapsed ? 'justify-center px-0' : 'px-4'
                 } ${
                   isActive 
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                 }`}
               >
                 <item.icon className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} ${isCollapsed ? '' : 'mr-3'}`} />
                 {!isCollapsed && <span className="whitespace-nowrap text-sm font-medium animate-in fade-in duration-300">{item.name}</span>}
               </Link>
             )
           })}
         </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        {/* Header (Banner) */}
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 transition-colors duration-300 flex items-center justify-between px-4 sm:px-6 lg:px-8 print:hidden">
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button 
              onClick={() => setSidebarOpen(true)} 
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 rounded-md"
            >
              <Menu className="h-6 w-6" />
            </button>
            
            {/* Desktop collapse button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:block p-2 -ml-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
              title={isCollapsed ? "展开菜单" : "收起菜单"}
            >
              {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center space-x-4">
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 z-50 transform origin-top-right animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">通知</h3>
                    <div className="flex space-x-2">
                      {unreadCount > 0 && (
                        <button 
                          onClick={markAllNotificationsAsRead}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          全部已读
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button 
                          onClick={clearNotifications}
                          className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 flex items-center"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          清空
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                        暂无通知
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {notifications.map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                            onClick={() => markNotificationAsRead(notification.id)}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-sm font-medium ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                {notification.title}
                              </h4>
                              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap ml-2">
                                {new Date(notification.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {notifications.length > 0 && (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-center">
                      <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                        查看全部通知
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 pl-2 border-l border-slate-200 dark:border-slate-700 relative group">
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 cursor-pointer">
                <User className="h-5 w-5" />
              </div>
              <div className="hidden sm:flex flex-col cursor-pointer">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-none">{user?.name || '未登录'}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-none">
                  {user?.systemRole === 'SUPER_ADMIN' ? '超级管理员' : 
                   user?.systemRole === 'ADMIN' ? '管理员' : 
                   user?.systemRole === 'HR' ? '人事主管' : '普通员工'}
                </span>
              </div>
              
              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right z-50">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden">
                  <div className="py-1">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">主题设置</p>
                      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg p-1">
                        <button
                          onClick={() => setTheme('light')}
                          className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                          title="浅色模式"
                        >
                          <Sun className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={`p-1.5 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                          title="深色模式"
                        >
                          <Moon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTheme('system')}
                          className={`p-1.5 rounded-md transition-colors ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                          title="跟随系统"
                        >
                          <Monitor className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <Link to="/settings" className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">个人设置</Link>
                    <Link to="/login" className="block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-slate-100 dark:border-slate-700">退出登录</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible relative flex flex-col">
          {children || <Outlet />}
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}
    </div>
  );
}
