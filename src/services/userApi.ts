import { http } from './api';
import { User } from '../types';

/**
 * 员工 CRUD API — 对接后端 employeesRouter（挂载于 /api/users，作者原始约定）。
 *
 * 列表接口双模式：
 * - 不传分页参数：返回完整 User[]（前端 store 全量持有的现有约定）
 * - 传 ?page&pageSize&keyword：返回 { items, total, page, pageSize, totalPages } 服务端分页信封
 */

export interface EmployeePageParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface EmployeePageResponse {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 全量拉取（store 现有约定；数据量大时建议切 fetchUsersPage 服务端分页） */
export const fetchUsers = (): Promise<User[]> => http.get<User[]>('/users');

/** 服务端分页 + 关键字搜索（name/phone/department） */
export const fetchUsersPage = (params: EmployeePageParams): Promise<EmployeePageResponse> =>
  http.get<EmployeePageResponse>('/users', { params });

/** 获取单个员工详情 */
export const getUserById = (id: string): Promise<User> => http.get<User>(`/users/${id}`);

/** 新增员工（后端 zod 校验：name 必填 + 字段类型；id 由后端按 EMP 序号生成） */
export const createUser = (user: Omit<User, 'id'>): Promise<User> =>
  http.post<User>('/users', user);

/** 更新员工（全字段可选） */
export const updateUser = (id: string, user: Partial<User>): Promise<User> =>
  http.put<User>(`/users/${id}`, user);

/** 删除员工（考勤等关联数据由后端外键级联清理） */
export const deleteUser = (id: string): Promise<{ success: boolean }> =>
  http.delete<{ success: boolean }>(`/users/${id}`);
