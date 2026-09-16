import { http } from './api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  applicant: string;
  /** 'leave' 请假 | 'makeup' 补卡 | 'conversion' 转正 | 'resign' 离职 | 'overtime' 加班 */
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
  /** P2 多级审批：需要的最低角色（leave ≥3 天自动升 ADMIN） */
  requiredRole: 'EMPLOYEE' | 'HR' | 'ADMIN' | 'SUPER_ADMIN';
  /** P2 加班时长（小时，type='overtime' 时有效） */
  hours: number;
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

export interface OvertimeCreateInput {
  type: 'overtime';
  /** 加班日期 */
  startDate: string;
  /** 时长（小时，0~24） */
  hours: number;
  reason: string;
}

export type ApprovalCreateInput =
  | LeaveCreateInput
  | MakeupCreateInput
  | ConversionCreateInput
  | ResignCreateInput
  | OvertimeCreateInput;

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
