import { http } from './api';

/**
 * 账号认领（v15）。
 *
 * 员工端提交走 PUBLIC 的 POST /auth/claims（不需要登录，也不需要口令）；
 * 队列与批准/驳回只有 ADMIN 能做——批准等于发身份。
 */
export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface ClaimEmployee {
  id: string;
  name: string;
  department: string;
  joinDate: string;
  phoneTail: string;
}

export interface Claim {
  id: string;
  desiredUsername: string;
  employeeId: string;
  displayName: string;
  phoneTail: string;
  note: string;
  status: ClaimStatus;
  rejectReason: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** HR 核对时看到的花名册侧信息（列表接口联查带回） */
  employee?: ClaimEmployee | null;
}

export interface ClaimDecisionResult {
  claim: Claim;
  /** 批准时生成的账号（不含口令 hash） */
  account?: { username: string; employeeId: string | null; displayName: string };
  /** 一次性口令：只在批准这一次响应里出现，服务端不存明文 */
  tempPassword?: string;
  error?: string;
}

export interface ClaimLookupResult {
  status: ClaimStatus;
  desiredUsername: string;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string;
  /** 批准且账号确实存在；账号被删时会是 false */
  accountOpened: boolean;
}

export const claimApi = {
  /** 员工端提交（公开，不需登录） */
  submit: (data: {
    desiredUsername: string;
    employeeId: string;
    displayName?: string;
    phoneTail: string;
    note?: string;
  }) => http.post<{ id: string; status: ClaimStatus }>('/auth/claims', data),
  /** 员工端查进度（公开）：按姓名 + 手机尾号取最近一条申请 */
  lookup: (data: { displayName: string; phoneTail: string }) =>
    http.post<ClaimLookupResult>('/auth/claims/lookup', data),
  list: (status?: ClaimStatus) =>
    http.get<Claim[]>(`/auth/claims${status ? `?status=${status}` : ''}`),
  decide: (id: string, decision: 'approved' | 'rejected', reason = '') =>
    http.put<ClaimDecisionResult>(`/auth/claims/${id}/decide`, { decision, reason }),
};
