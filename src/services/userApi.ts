import { http } from './api';
import { STORAGE_KEYS } from '../config/constants';
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

// ---------------------------------------------------------------- 批量导入

export interface ImportRowResult {
  rowNumber: number;
  data: Record<string, string | number>;
  errors: string[];
  duplicate: boolean;
}

export interface ImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rows: ImportRowResult[];
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
  ids: string[];
}

/** 二进制上传（raw body）——axios 拦截器面向 JSON，这里用 fetch 直传 Buffer 语义 */
async function sendBinary<T>(url: string, blob: Blob): Promise<T> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });
  if (!res.ok) {
    let err: unknown;
    try {
      err = await res.json();
    } catch {
      err = { error: `HTTP ${res.status}` };
    }
    throw err;
  }
  return (await res.json()) as T;
}

/** 上传 Excel → 解析 + 校验 + 预览 */
export const previewImport = (file: File): Promise<ImportPreview> =>
  sendBinary<ImportPreview>('/api/users/import', file);

/** 确认导入（服务端二次校验后落库） */
export const commitImport = (rows: ImportRowResult[]): Promise<ImportCommitResult> =>
  http.post<ImportCommitResult>('/users/import/commit', { rows });

/** 合同续签 */
export interface ContractRenewal {
  id: string;
  employeeId: string;
  employeeName: string;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  prevExpiry: string;
  renewedBy: string;
  createdAt: string;
}

export const renewContract = (
  id: string,
  data: { contractYears: number; contractSignDate: string; contractExpiry: string }
): Promise<ContractRenewal> => http.post<ContractRenewal>(`/users/${id}/renew-contract`, data);

export const fetchContractRenewals = (id: string): Promise<ContractRenewal[]> =>
  http.get<ContractRenewal[]>(`/users/${id}/contract-renewals`);
