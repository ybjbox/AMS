import type { AccountSystemRole } from '@/services/accountApi';

const ALL_ROLES: AccountSystemRole[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'];

const ROLE_RANK: Record<AccountSystemRole, number> = {
  EMPLOYEE: 1,
  HR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/**
 * 角色天花板的客户端镜像：对**别人**的账号动手时，自己的秩必须严格更高；
 * 只有超级管理员之间可以互管。服务端 authRouter 的 aboveRole 是同一条规则，
 * 这里只用来决定按钮摆不摆出来 —— 裁定始终在服务端。
 *
 * 不镜像的后果不是越权（服务端会挡），而是「看得见、点了必 403」的假入口，
 * 而且错误提示只会说「权限不足」，没人知道自己其实是管理员。
 */
export function canManageAccount(
  actor: AccountSystemRole | undefined,
  targetRole: AccountSystemRole,
  isSelf = false
): boolean {
  if (isSelf || actor === 'SUPER_ADMIN') return true;
  return !!actor && ROLE_RANK[actor] > ROLE_RANK[targetRole];
}

/** 可授予 / 可改成的角色：秩严格低于自己的那些（超管全给） */
export function grantableRoles(actor: AccountSystemRole | undefined): AccountSystemRole[] {
  if (actor === 'SUPER_ADMIN') return ALL_ROLES;
  return ALL_ROLES.filter((r) => actor && ROLE_RANK[actor] > ROLE_RANK[r]);
}
