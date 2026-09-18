import React, { lazy } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  ListTodo,
  Armchair,
  IdCard,
  FileStack,
  Clock,
  FileSignature,
  Building2,
  FileCheck2,
  MessageSquareText,
} from 'lucide-react';

const Dashboard = lazy(() => import('../pages/Dashboard/index'));
const UsersPage = lazy(() => import('../pages/Users'));
const SettingsPage = lazy(() => import('../pages/Settings/index'));
const Todos = lazy(() => import('../pages/Todos'));
const Approvals = lazy(() => import('../pages/Approvals/index'));
const Seating = lazy(() => import('../pages/Seating'));
const NameCards = lazy(() => import('../pages/NameCards/index'));
const Documents = lazy(() => import('../pages/Documents'));
const Attendance = lazy(() => import('../pages/Attendance/index'));
const Contracts = lazy(() => import('../pages/Contracts/index'));
const DepartmentsPage = lazy(() => import('../pages/Departments/index'));
const WeChatNotice = lazy(() => import('../pages/WeChatNotice/index'));

export interface RouteConfig {
  path: string;
  label: string;
  title?: string;
  icon: React.ElementType;
  permission?: string;
  component: React.LazyExoticComponent<React.ComponentType>;
}

export const routeConfig: RouteConfig[] = [
  { path: '/', label: '控制台', icon: LayoutDashboard, permission: 'dashboard:view', component: Dashboard },
  { path: '/users', label: '员工管理', icon: Users, permission: 'users:view', component: UsersPage },
  { path: '/departments', label: '部门管理', icon: Building2, permission: 'departments:view', component: DepartmentsPage },
  { path: '/attendance', label: '考勤管理', icon: Clock, permission: 'attendance:view', component: Attendance },
  { path: '/contracts', label: '合同管理', icon: FileSignature, permission: 'contracts:view', component: Contracts },
  { path: '/seating', label: '宴会排座', icon: Armchair, permission: 'seating:view', component: Seating },
  { path: '/name-cards', label: '会议台卡', icon: IdCard, permission: 'name-cards:view', component: NameCards },
  { path: '/documents', label: '常用文件', icon: FileStack, permission: 'documents:view', component: Documents },
  { path: '/todos', label: '待办事项', icon: ListTodo, permission: 'todos:view', component: Todos },
  { path: '/approvals', label: '审批中心', icon: FileCheck2, permission: 'approvals:view', component: Approvals },
  { path: '/wechat-notice', label: '微信通知', icon: MessageSquareText, permission: 'notice:view', component: WeChatNotice },
  { path: '/settings', label: '系统设置', icon: Settings, permission: 'settings:view', component: SettingsPage },
];

/**
 * 按用户自定义顺序（appSettings.navOrder，path 列表）排列导航项。
 * 未列入的项（如新上模块）保持默认顺序排在末尾；navOrder 为空即默认序。
 */
export function applyNavOrder<T extends { path: string }>(items: T[], navOrder: string[]): T[] {
  if (navOrder.length === 0) return items;
  const rank = new Map(navOrder.map((p, i) => [p, i] as const));
  const fallback = navOrder.length;
  return [...items].sort((a, b) => (rank.get(a.path) ?? fallback) - (rank.get(b.path) ?? fallback));
}
