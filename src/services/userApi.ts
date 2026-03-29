import { api } from './mockApi';
import { User } from '../types';

/**
 * 获取所有员工列表
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
  const user = users.find(u => u.id === id);
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
