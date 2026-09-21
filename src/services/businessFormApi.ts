import { http } from './api';

/**
 * 业务单据生成 API — 对接后端 businessFormRouter（/api/form）。
 *
 * 版面与句式由前端模板（pages/BusinessForms/lib）保证，服务端只提供可选的正文润色，
 * 与其他 AI 功能共享同一套准入与每日额度策略。
 * 归档记录（/form/records）挂在员工档案下，读取口径与合同信息一致：本人或 HR 及以上。
 */

export interface PolishResult {
  text: string;
  sourceChars: number;
}

/** 正文润色（可选步骤，由「仅润色正文」显式触发；走系统模型时计一次每日额度） */
export const polishFormBody = (text: string): Promise<PolishResult> =>
  http.post<PolishResult>('/form/polish', { text }, { timeout: 60_000 });

export interface BusinessFormRecordInput {
  employeeId: string;
  kind: string;
  kindLabel?: string;
  department?: string;
  relation?: string;
  date: string;
  amount?: number;
  body: string;
}

/** 与 server/businessFormsDb.ts 的 BusinessFormRecord 对齐（字段均为已落库的必填值） */
export interface BusinessFormRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: string;
  kindLabel: string;
  department: string;
  relation: string;
  date: string;
  amount: number;
  body: string;
  operator: string;
  createdAt: string;
}

/** 某员工已归档的业务单（新→旧） */
export const listBusinessFormRecords = (employeeId: string): Promise<BusinessFormRecord[]> =>
  http.get<BusinessFormRecord[]>(
    `/form/records?employeeId=${encodeURIComponent(employeeId)}`
  );

/** 把当前业务单归档进该员工档案；归属员工由服务端按 employeeId 回填 */
export const createBusinessFormRecord = (
  input: BusinessFormRecordInput
): Promise<BusinessFormRecord> => http.post<BusinessFormRecord>('/form/records', input);
