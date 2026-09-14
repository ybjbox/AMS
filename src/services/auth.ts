import { http } from './api';
import { UserInfo } from '../types';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  /** 系统角色，权限字典按它取值 */
  role: string;
  systemRole: string;
  employeeId: string | null;
  mustChangePassword: boolean;
}

/** 后端 AuthUser → 前端 UserInfo（role 统一取 systemRole 权限键） */
export function toUserInfo(u: AuthUser): UserInfo {
  return { id: u.id, username: u.username, email: u.email, role: u.systemRole };
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
  user: AuthUser;
}

export interface ChangePasswordResponse {
  success: boolean;
  token: string;
  expiresAt: number;
  user: AuthUser;
}

export const authService = {
  login: (username: string, password: string) =>
    http.post<LoginResponse>('/auth/login', { username, password }),

  /** 校验当前 token 是否仍然有效，并拿回最新的角色信息 */
  me: () => http.get<{ user: AuthUser }>('/auth/me'),

  logout: () => http.post<{ success: boolean }>('/auth/logout'),

  /** 后端会吊销全部旧会话并返回一个新 token */
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post<ChangePasswordResponse>('/auth/change-password', { currentPassword, newPassword }),
};
