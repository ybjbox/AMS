import { http } from './api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  applicant: string;
  type: string;
  leaveType: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  status: ApprovalStatus;
  approver: string | null;
  comment: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApprovalCreateInput {
  leaveType: '事假' | '病假' | '年假' | '调休';
  startDate: string;
  endDate?: string;
  reason: string;
}

/** 审批 API（R1 v1：请假申请闭环 + R2 员工自助提交） */
export const approvalApi = {
  listMine: (): Promise<Approval[]> => http.get<Approval[]>('/approvals/mine'),

  /** 待审批列表（后端 requireRole("HR")，EMPLOYEE 调用会收到 403） */
  listPending: (): Promise<Approval[]> => http.get<Approval[]>('/approvals/pending'),

  create: (data: ApprovalCreateInput): Promise<Approval> => http.post<Approval>('/approvals', data),

  decide: (
    id: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    comment?: string
  ): Promise<Approval> => http.put<Approval>(`/approvals/${id}/decide`, { status, comment }),
};
