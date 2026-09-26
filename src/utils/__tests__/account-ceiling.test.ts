/**
 * 角色天花板的客户端镜像（批次 1）：这里算的不是权限，而是「该不该摆这个按钮」。
 * 服务端 authRouter 的规则必须在界面上有同一份映射，否则管理员会看到一堆点了必 403 的操作。
 */
import { describe, it, expect } from 'vitest';
import { canManageAccount, grantableRoles } from '../accountCeiling';

describe('canManageAccount', () => {
  it('ADMIN 管不了超管，也管不了同级管理员', () => {
    expect(canManageAccount('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canManageAccount('ADMIN', 'ADMIN')).toBe(false);
  });

  it('ADMIN 管得了 HR 与员工', () => {
    expect(canManageAccount('ADMIN', 'HR')).toBe(true);
    expect(canManageAccount('ADMIN', 'EMPLOYEE')).toBe(true);
  });

  it('超管例外：同级超管之间可互管', () => {
    expect(canManageAccount('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canManageAccount('SUPER_ADMIN', 'ADMIN')).toBe(true);
  });

  it('自己的账号永远可管（改自己资料属自助）', () => {
    expect(canManageAccount('ADMIN', 'ADMIN', true)).toBe(true);
    expect(canManageAccount('EMPLOYEE', 'SUPER_ADMIN', true)).toBe(true);
  });

  it('角色缺失时一律拒绝（不靠界面兜底猜）', () => {
    expect(canManageAccount(undefined, 'EMPLOYEE')).toBe(false);
    expect(grantableRoles(undefined)).toEqual([]);
  });
});

describe('grantableRoles', () => {
  it('ADMIN 只能授予低于自己的角色', () => {
    expect(grantableRoles('ADMIN')).toEqual(['HR', 'EMPLOYEE']);
  });

  it('HR 只剩「普通员工」可授予（能不能进这个页面由账号端点的 ADMIN 门槛决定）', () => {
    expect(grantableRoles('HR')).toEqual(['EMPLOYEE']);
  });

  it('超管全给', () => {
    expect(grantableRoles('SUPER_ADMIN')).toEqual(['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE']);
  });
});
