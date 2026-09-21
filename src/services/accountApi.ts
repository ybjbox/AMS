import { http } from './api';

/**
 * 账号管理 API — 对接 /api/auth/accounts*（服务端每个端点都 requireRole("ADMIN")）。
 *
 * 消费方是员工档案里的「系统账号」区块：员工↔账号的绑定（accounts.employeeId）
 * 一旦缺失，转正/补卡/离职审批的领域动作与考勤异常通知都会静默失效，
 * 所以开号与绑定必须在档案里就能做，而不是只剩 curl。
 */

export type AccountSystemRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';

/** 系统角色的中文标签（档案里的账号区块与设置页的账号管理共用） */
export const ACCOUNT_ROLE_LABELS: Record<AccountSystemRole, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  HR: '人事主管',
  EMPLOYEE: '普通员工',
};

/** 与 server/authDb.ts 的 PublicAccount 对齐（绝不含 passwordHash） */
export interface Account {
  username: string;
  employeeId: string | null;
  displayName: string;
  email: string;
  avatar: string;
  systemRole: AccountSystemRole;
  enabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AccountCreateInput {
  username: string;
  password: string;
  systemRole?: AccountSystemRole;
  employeeId?: string | null;
  displayName?: string;
  email?: string;
}

export interface AccountUpdateInput {
  systemRole?: AccountSystemRole;
  enabled?: boolean;
  displayName?: string;
  email?: string;
  employeeId?: string | null;
}

const enc = encodeURIComponent;

export const accountApi = {
  list: (): Promise<Account[]> => http.get<Account[]>('/auth/accounts'),
  create: (input: AccountCreateInput): Promise<Account> => http.post<Account>('/auth/accounts', input),
  update: (username: string, patch: AccountUpdateInput): Promise<Account> =>
    http.put<Account>(`/auth/accounts/${enc(username)}`, patch),
  resetPassword: (username: string, newPassword: string): Promise<{ success: boolean }> =>
    http.post<{ success: boolean }>(`/auth/accounts/${enc(username)}/reset-password`, { newPassword }),
  revokeSessions: (username: string): Promise<{ success: boolean }> =>
    http.post<{ success: boolean }>(`/auth/accounts/${enc(username)}/revoke-sessions`),
  remove: (username: string): Promise<{ success: boolean }> =>
    http.delete<{ success: boolean }>(`/auth/accounts/${enc(username)}`),
};

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';

function pickAlphabet(chars: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return chars[buf[0] % chars.length];
}

/**
 * 生成一次性初始密码：12 位，必含字母与数字（服务端 assertPasswordStrength 要求 ≥10 位
 * 且同时含字母和数字），去掉了易混淆的 I O i l o 0 1。
 */
export function randomInitialPassword(): string {
  const chars = [
    pickAlphabet(UPPER),
    pickAlphabet(UPPER),
    pickAlphabet(LOWER),
    pickAlphabet(LOWER),
    pickAlphabet(LOWER),
    pickAlphabet(DIGIT),
    pickAlphabet(DIGIT),
    pickAlphabet(DIGIT),
  ];
  while (chars.length < 12) chars.push(pickAlphabet(UPPER + LOWER + DIGIT));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** 统一取出后端写好的中文错误串（各账号端点都是 { error }） */
export function accountError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || (e as Error)?.message || fallback;
}
