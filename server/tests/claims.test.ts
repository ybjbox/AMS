/**
 * 账号认领（v15）的服务端规则。
 *
 * 这一层最要紧的不是"能提交"，而是三条否决：
 * - 同一条档案只能有一条待核对申请（否则同一个人会被开两次号）；
 * - 没有这个工号、或这条档案已经绑过账号，都不允许提交；
 * - 驳回必须写原因（否则申请人只看到"被拒了"）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db.ts';
// accounts 表由 authDb 在模块加载时建；认领测试要操作它，必须先引入
import '../authDb.ts';
import { ClaimError, createClaim, decideClaim, getClaimEmployee, listClaims, ensureClaimsTable } from '../claimsDb.ts';

const EMP = 'CLM001';
const UNBOUND_EMP = 'CLM002';

const insertEmployee = (id: string, name: string, phone: string) =>
  db.prepare('INSERT INTO employees (id, name, department, phone) VALUES (?, ?, ?, ?)').run(id, name, '夜班组', phone);

beforeEach(() => {
  ensureClaimsTable();
  for (const id of [EMP, UNBOUND_EMP]) {
    db.prepare('DELETE FROM account_claims WHERE employeeId = ?').run(id);
    db.prepare('DELETE FROM accounts WHERE employeeId = ?').run(id);
    db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  }
  insertEmployee(EMP, '测试员甲', '13800001234');
  insertEmployee(UNBOUND_EMP, '测试员乙', '13900005678');
});

describe('认领申请', () => {
  it('提交后是 pending，并能在列表里查到；档案对照带出手机尾号', () => {
    const claim = createClaim({
      desiredUsername: 'tester.a',
      employeeId: EMP,
      displayName: '测试员甲',
      phoneTail: '1234',
    });
    expect(claim.status).toBe('pending');
    expect(listClaims('pending').some((c) => c.id === claim.id)).toBe(true);
    expect(getClaimEmployee(claim.id)?.phoneTail).toBe('1234');
  });

  it('同一条档案的第二条申请被拒（一条 pending 就够了）', () => {
    createClaim({ desiredUsername: 'a1', employeeId: EMP, displayName: '', phoneTail: '1234' });
    expect(() =>
      createClaim({ desiredUsername: 'a2', employeeId: EMP, displayName: '', phoneTail: '1234' })
    ).toThrowError(/已经有一条申请/);
  });

  it('工号不存在 → 404 语义', () => {
    try {
      createClaim({ desiredUsername: 'ghost', employeeId: 'NOPE', displayName: '', phoneTail: '0000' });
      throw new Error('应当抛出');
    } catch (e) {
      expect(e).toBeInstanceOf(ClaimError);
      expect((e as ClaimError).status).toBe(404);
    }
  });

  it('档案已经绑过账号 → 不允许认领', () => {
    db.prepare(
      `INSERT INTO accounts (username, employeeId, displayName, email, passwordHash, systemRole)
       VALUES ('bound.one', ?, '测试员乙', '', 'x', 'EMPLOYEE')`
    ).run(UNBOUND_EMP);
    try {
      createClaim({ desiredUsername: 'steal', employeeId: UNBOUND_EMP, displayName: '', phoneTail: '5678' });
      throw new Error('应当抛出');
    } catch (e) {
      expect((e as ClaimError).status).toBe(409);
    }
  });

  it('驳回必须写原因；写了就落库，并带上处理人', () => {
    const claim = createClaim({ desiredUsername: 'c3', employeeId: EMP, displayName: '', phoneTail: '1234' });
    expect(() => decideClaim(claim.id, 'rejected', 'admin')).toThrowError(/必须写原因/);
    const { claim: done, conflict } = decideClaim(claim.id, 'rejected', 'admin', '工号对不上');
    expect(conflict).toBe(false);
    expect(done.status).toBe('rejected');
    expect(done.rejectReason).toBe('工号对不上');
    expect(done.reviewedBy).toBe('admin');
  });

  it('重复决定返回 conflict，不覆盖第一次的结果', () => {
    const claim = createClaim({ desiredUsername: 'c4', employeeId: EMP, displayName: '', phoneTail: '1234' });
    decideClaim(claim.id, 'approved', 'admin');
    const again = decideClaim(claim.id, 'rejected', 'admin', '反悔');
    expect(again.conflict).toBe(true);
    expect(again.claim.status).toBe('approved');
  });
});
