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

export interface RouteConfig {
  path: string;
  label: string;
  title?: string;
  icon: React.ElementType;
  permission?: string;
  component: React.LazyExoticComponent<React.ComponentType>;
  /** 侧边栏分组：人事 / 会务 / 协作（未设置则归入默认组） */
  group?: NavGroup;
}

export type NavGroup = '人事' | '会务' | '协作';

export const NAV_GROUP_ORDER: NavGroup[] = ['人事', '会务', '协作'];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  '人事': '人事',
  '会务': '会务',
  '协作': '协作',
};

export const routeConfig: RouteConfig[] = [
  { path: '/', label: '控制台', icon: LayoutDashboard, permission: 'dashboard:view', component: Dashboard },
  { path: '/users', label: '员工管理', icon: Users, permission: 'users:view', component: UsersPage, group: '人事' },
  { path: '/departments', label: '部门管理', icon: Building2, permission: 'settings:view', component: DepartmentsPage, group: '人事' },
  { path: '/attendance', label: '考勤管理', icon: Clock, permission: 'attendance:view', component: Attendance, group: '人事' },
  { path: '/contracts', label: '合同管理', icon: FileSignature, permission: 'contracts:view', component: Contracts, group: '人事' },
  { path: '/seating', label: '宴会排座', icon: Armchair, permission: 'seating:view', component: Seating, group: '会务' },
  { path: '/name-cards', label: '会议台卡', icon: IdCard, permission: 'name-cards:view', component: NameCards, group: '会务' },
  { path: '/documents', label: '常用文件', icon: FileStack, permission: 'documents:view', component: Documents, group: '会务' },
  { path: '/todos', label: '待办事项', icon: ListTodo, permission: 'todos:view', component: Todos, group: '协作' },
  { path: '/approvals', label: '审批中心', icon: FileCheck2, permission: 'approvals:view', component: Approvals, group: '协作' },
  { path: '/settings', label: '系统设置', icon: Settings, permission: 'settings:view', component: SettingsPage, group: '协作' },
];
