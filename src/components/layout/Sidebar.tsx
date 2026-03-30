import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Building2, ListTodo, Armchair, IdCard, FileStack, Clock, FileSignature } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useAppSettings } from '../../store/appSettings';
import { Permission } from '../../types';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isCollapsed: boolean;
}

const NAVIGATION_CONFIG = [
  { name: '控制台', href: '/', icon: LayoutDashboard, permission: Permission.VIEW_DASHBOARD },
  { name: '员工管理', href: '/users', icon: Users, permission: Permission.VIEW_USERS },
  { name: '宴会排座', href: '/seating', icon: Armchair, permission: Permission.VIEW_DASHBOARD },
  { name: '会议台卡', href: '/name-cards', icon: IdCard, permission: Permission.VIEW_DASHBOARD },
  { name: '常用文件', href: '/documents', icon: FileStack, permission: Permission.VIEW_DASHBOARD },
  { name: '考勤管理', href: '/attendance', icon: Clock, permission: Permission.VIEW_DASHBOARD },
  { name: '合同管理', href: '/contracts', icon: FileSignature, permission: Permission.VIEW_DASHBOARD },
  { name: '待办事项', href: '/todos', icon: ListTodo, permission: Permission.VIEW_DASHBOARD },
  { name: '系统设置', href: '/settings', icon: Settings, permission: Permission.VIEW_SETTINGS },
];

export default function Sidebar({ sidebarOpen, setSidebarOpen, isCollapsed }: SidebarProps) {
  const location = useLocation();
  const hasPermission = useAuth(state => state.hasPermission);
  const systemIcon = useAppSettings(state => state.systemIcon);

  const visibleNav = useMemo(() => {
    return NAVIGATION_CONFIG.filter(item => hasPermission(item.permission));
  }, [hasPermission]);

  return (
    <aside 
      className={`fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-all duration-300 ease-in-out flex flex-col print:hidden shrink-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-56'} w-56`}
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
         {visibleNav.map((item) => {
           const isActive = location.pathname === item.href;
           return (
             <Link 
               key={item.name} 
               to={item.href} 
               onClick={() => setSidebarOpen(false)}
               title={isCollapsed ? item.name : undefined}
               className={`flex items-center py-3 rounded-r-lg transition-all duration-200 ease-in-out ${
                 isCollapsed ? 'justify-center pr-[3px]' : 'pl-3 pr-4'
               } ${
                 isActive 
                  ? 'border-l-[3px] border-blue-600 dark:border-blue-400 bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' 
                  : 'border-l-[3px] border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
               }`}
             >
               <item.icon className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} ${isCollapsed ? '' : 'mr-3'}`} />
               {!isCollapsed && <span className="whitespace-nowrap text-sm font-medium animate-in fade-in duration-300">{item.name}</span>}
             </Link>
           )
         })}
       </nav>
    </aside>
  );
}
