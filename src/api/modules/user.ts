import request from '../request';

// 基础的用户信息接口
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

// 列表返回结构（根据实际后端数据结构可作调整）
export interface UserListResponse {
  list: UserInfo[];
  total: number;
}

/**
 * 获取用户列表
 * @param params 请求参数
 * @returns 用户列表数据
 */
export const getUserList = (params?: GetUserListParams): Promise<UserListResponse> => {
  return request.get('/users', { params });
};

/**
 * 获取用户详情
 * @param userId 用户 ID
 * @returns 用户详情数据
 */
export const getUserInfo = (userId: string | number): Promise<UserInfo> => {
  return request.get(`/users/${userId}`);
};
