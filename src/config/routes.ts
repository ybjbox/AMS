import React, { lazy } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  ListTodo,
  Printer,
  FileStack,
  Clock,
  FileSignature,
  Building2,
  FileCheck2,
  MessageSquareText,
  ClipboardList,
} from 'lucide-react';

const Dashboard = lazy(() => import('../pages/Dashboard/index'));
const UsersPage = lazy(() => import('../pages/Users'));
const SettingsPage = lazy(() => import('../pages/Settings/index'));
const Todos = lazy(() => import('../pages/Todos'));
const Approvals = lazy(() => import('../pages/Approvals/index'));
const PrintTools = lazy(() => import('../pages/PrintTools/index'));
const Documents = lazy(() => import('../pages/Documents'));
const Attendance = lazy(() => import('../pages/Attendance/index'));
const Contracts = lazy(() => import('../pages/Contracts/index'));
const DepartmentsPage = lazy(() => import('../pages/Departments/index'));
const WeChatNotice = lazy(() => import('../pages/WeChatNotice/index'));
const BusinessForms = lazy(() => import('../pages/BusinessForms/index'));

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
  { path: '/print-tools', label: '打印工具', icon: Printer, permission: 'print-tools:view', component: PrintTools },
  { path: '/documents', label: '常用文件', icon: FileStack, permission: 'documents:view', component: Documents },
  { path: '/todos', label: '待办事项', icon: ListTodo, permission: 'todos:view', component: Todos },
  { path: '/approvals', label: '审批中心', icon: FileCheck2, permission: 'approvals:view', component: Approvals },
  { path: '/wechat-notice', label: '微信通知', icon: MessageSquareText, permission: 'notice:view', component: WeChatNotice },
  { path: '/business-forms', label: '业务单据', icon: ClipboardList, permission: 'forms:view', component: BusinessForms },
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
