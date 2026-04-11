import { api } from './mockApi';
import { http } from './api';
import { User } from '../types';

// 基础的用户信息接口 (From src/api/modules/user.ts)
export interface UserInfo {
  id: string | number;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  status?: number;
  createdAt?: string;
}

// 获取用户列表的请求参数接口
export interface GetUserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
}

// 列表返回结构
export interface UserListResponse {
  list: UserInfo[];
  total: number;
}

/**
 * 获取用户列表 (Axios)
 * @param params 请求参数
 * @returns 用户列表数据
 */
export const getUserList = (params?: GetUserListParams): Promise<UserListResponse> => {
  return http.get('/users', { params });
};

/**
 * 获取用户详情 (Axios)
 * @param userId 用户 ID
 * @returns 用户详情数据
 */
export const getUserInfo = (userId: string | number): Promise<UserInfo> => {
  return http.get(`/users/${userId}`);
};

/**
 * 获取所有员工列表 (Mock)
 * @returns 员工列表
 */
export const fetchUsers = async (): Promise<User[]> => {
  return api.fetchUsers();
};

/**
 * 获取单个员工详情
 * @param id 员工 ID
 * @returns 员工详情
 */
export const getUserById = async (id: string): Promise<User> => {
  const users = await api.fetchUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error('User not found');
  return user;
};

/**
 * 新增员工
 * @param user 员工信息（不包含 ID）
 * @returns 创建后的员工信息
 */
export const createUser = async (user: Omit<User, 'id'>): Promise<User> => {
  return api.createUser(user as User);
};

/**
 * 更新员工信息
 * @param id 员工 ID
 * @param user 员工信息
 * @returns 更新后的员工信息
 */
export const updateUser = async (id: string, user: Partial<User>): Promise<User> => {
  return api.updateUser({ id, ...user } as User);
};

/**
 * 删除员工
 * @param id 员工 ID
 */
export const deleteUser = async (id: string): Promise<void> => {
  return api.deleteUser(id);
};
