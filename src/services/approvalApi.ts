import { http } from './api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  applicant: string;
  /** 'leave' 请假 | 'makeup' 补卡 */
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
  /** 补卡字段（type='makeup' 时有效） */
  punchDate: string;
  punchTime: string;
  punchKind: string;
}

export interface LeaveCreateInput {
  type?: 'leave';
  leaveType: '事假' | '病假' | '年假' | '调休';
  startDate: string;
  endDate?: string;
  reason: string;
}

export interface MakeupCreateInput {
  type: 'makeup';
  punchDate: string;
  punchTime: string;
  punchKind: '上班卡' | '下班卡';
  reason: string;
}

export interface ConversionCreateInput {
  type: 'conversion';
  reason: string;
}

export interface ResignCreateInput {
  type: 'resign';
  /** 最后工作日 */
  startDate: string;
  reason: string;
}

export type ApprovalCreateInput =
  | LeaveCreateInput
  | MakeupCreateInput
  | ConversionCreateInput
  | ResignCreateInput;

/** 审批 API（R1 v1：请假 + 补卡申请闭环 + R2 员工自助提交） */
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
