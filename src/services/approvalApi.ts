import { http } from './api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

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

export interface ApprovalLedgerQuery {
  /** pending | approved | rejected | withdrawn | decided（已处理过的全部）| 空=全部 */
  status?: ApprovalStatus | 'decided' | '';
  /** 处理月份 YYYY-MM（未决定的按提交月份归入） */
  month?: string;
  applicant?: string;
  limit?: number;
}

export interface CompBalance {
  linked: boolean;
  employeeId?: string;
  hours: number;
  pendingHours: number;
}

/** 审批 API（R1 v1：请假 + 补卡申请闭环 + R2 员工自助提交） */
export const approvalApi = {
  listMine: (): Promise<Approval[]> => http.get<Approval[]>('/approvals/mine'),

  /** 待审批列表（后端 requireRole("HR")，EMPLOYEE 调用会收到 403） */
  listPending: (): Promise<Approval[]> => http.get<Approval[]>('/approvals/pending'),

  /** 审批台账（HR+）：含已办/撤回，可按状态与处理月份筛选 */
  listAll: (query: ApprovalLedgerQuery = {}): Promise<Approval[]> => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.month) params.set('month', query.month);
    if (query.applicant) params.set('applicant', query.applicant);
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return http.get<Approval[]>(`/approvals/all${qs ? `?${qs}` : ''}`);
  },

  create: (data: ApprovalCreateInput): Promise<Approval> => http.post<Approval>('/approvals', data),

  decide: (
    id: string,
    status: 'approved' | 'rejected',
    comment?: string
  ): Promise<Approval> => http.put<Approval>(`/approvals/${id}/decide`, { status, comment }),

  /** 批量决定：单条失败不影响其余，返回已办与失败明细 */
  batchDecide: (
    ids: string[],
    status: 'approved' | 'rejected',
    comment?: string
  ): Promise<{ decided: string[]; failed: { id: string; error: string }[] }> =>
    http.put<{ decided: string[]; failed: { id: string; error: string }[] }>('/approvals/batch-decide', {
      ids,
      status,
      comment,
    }),

  /** 撤回本人仍在待审的申请 */
  withdraw: (id: string): Promise<Approval> => http.put<Approval>(`/approvals/${id}/withdraw`),

  /** 我的调休余额（口径与审批校验一致：已批扣减 + 待审预占） */
  compBalance: (): Promise<CompBalance> => http.get<CompBalance>('/approvals/comp-balance'),
};
