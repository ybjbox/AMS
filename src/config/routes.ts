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
} from 'lucide-react';

const Dashboard = lazy(() => import('../pages/Dashboard/index'));
const UsersPage = lazy(() => import('../pages/Users'));
const SettingsPage = lazy(() => import('../pages/Settings/index'));
const Todos = lazy(() => import('../pages/Todos'));
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
}

export const routeConfig: RouteConfig[] = [
  { path: '/', label: '控制台', icon: LayoutDashboard, permission: 'dashboard:view', component: Dashboard },
  { path: '/users', label: '员工管理', icon: Users, permission: 'users:view', component: UsersPage },
  { path: '/seating', label: '宴会排座', icon: Armchair, permission: 'seating:view', component: Seating },
  { path: '/name-cards', label: '会议台卡', icon: IdCard, permission: 'name-cards:view', component: NameCards },
  { path: '/documents', label: '常用文件', icon: FileStack, permission: 'documents:view', component: Documents },
  { path: '/attendance', label: '考勤管理', icon: Clock, permission: 'attendance:view', component: Attendance },
  { path: '/contracts', label: '合同管理', icon: FileSignature, permission: 'contracts:view', component: Contracts },
  { path: '/departments', label: '部门管理', icon: Building2, permission: 'settings:view', component: DepartmentsPage },
  { path: '/todos', label: '待办事项', icon: ListTodo, permission: 'todos:view', component: Todos },
  { path: '/settings', label: '系统设置', icon: Settings, permission: 'settings:view', component: SettingsPage },
];
