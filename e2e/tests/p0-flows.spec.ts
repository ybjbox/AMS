import { acct } from '../runScoped';
import { test, expect } from '@playwright/test';
import { resolveAdminPassword } from '../adminCredentials';

/**
 * P0 功能闭环 E2E：
 * 1. 补卡申请闭环：员工提交补卡 → 管理员审批通过 → 打卡记录自动写入 → 清理
 * 2. 月度考勤汇总：ADMIN 可读、响应结构完整
 * 3. 公告发布：ADMIN 发布 → 全员可见 → 停用即隐藏 → 删除；员工无管理权限（403）
 *
 * 账号准备：管理员创建「补卡测试员工」档案 + 关联账号；测试后全量清理。
 */

const ADMIN_PASSWORD = resolveAdminPassword();
const TEST_ACCOUNT = acct('e2e-makeup');
const PW_1 = 'E2e-P0#2026a';
const PW_2 = 'E2e-P0#2026b';
const PUNCH_DATE = '2026-09-15';
const PUNCH_TIME = '09:06';

interface Session {
  token: string;
}

async function login(
  request: import('@playwright/test').APIRequestContext,
  username: string,
  password: string
): Promise<Session> {
  const res = await request.post('/api/auth/login', { data: { username, password } });
  expect(res.status(), `登录 ${username}`).toBe(200);
  const body = await res.json();
  let token: string = body.token;
  if (body.user?.mustChangePassword) {
    const ch = await request.post('/api/auth/change-password', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPassword: password, newPassword: PW_2 },
    });
    expect(ch.status()).toBe(200);
    token = (await ch.json()).token ?? token;
  }
  return { token };
}

test.describe.serial('P0 功能闭环', () => {
  let adminToken = '';
  let employeeToken = '';
  let employeeId = '';
  let createdPunchRecordId = '';
  let announcementId = '';

  test.beforeAll(async ({ request }) => {
    const admin = await login(request, 'admin', ADMIN_PASSWORD);
    adminToken = admin.token;
    const auth = { Authorization: `Bearer ${adminToken}` };

    // 清理上次残留
    await request.delete(`/api/auth/accounts/${TEST_ACCOUNT}`, { headers: auth });

    // 创建测试员工
    const empRes = await request.post('/api/users', {
      headers: auth,
      data: {
        name: 'E2E补卡员工',
        idCard: '110101199203044321',
        gender: '男',
        age: 33,
        phone: '13300009999',
        department: '研发部',
        status: '在职',
        joinDate: '2026-01-01',
        employmentType: '正式',
      },
    });
    expect(empRes.status(), '创建测试员工').toBe(201);
    const emp = await empRes.json();
    employeeId = emp.id;

    // 创建关联账号（employeeId 关联是补卡落库的前提）
    const accRes = await request.post('/api/auth/accounts', {
      headers: auth,
      data: { username: TEST_ACCOUNT, password: PW_1, systemRole: 'EMPLOYEE', displayName: 'E2E补卡员工', employeeId },
    });
    expect(accRes.status(), '创建测试账号').toBe(201);

    // 登录（自动改密）
    const empSession = await login(request, TEST_ACCOUNT, PW_1);
    employeeToken = empSession.token;
  });

  test.afterAll(async ({ request }) => {
    if (!adminToken) return;
    const auth = { Authorization: `Bearer ${adminToken}` };
    // 清理打卡记录
    if (createdPunchRecordId) {
      await request.delete(`/api/attendance/records/${createdPunchRecordId}`, { headers: auth });
    }
    // 清理公告
    if (announcementId) {
      await request.delete(`/api/announcements/${announcementId}`, { headers: auth });
    }
    // 清理账号与员工
    await request.delete(`/api/auth/accounts/${TEST_ACCOUNT}`, { headers: auth });
    if (employeeId) {
      await request.delete(`/api/users/${employeeId}`, { headers: auth });
    }
  });

  // ---------- P0-1 补卡闭环 ----------
  test('补卡申请：员工提交 → 审批通过 → 打卡记录自动写入', async ({ request }) => {
    const empAuth = { Authorization: `Bearer ${employeeToken}` };
    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    // 1) 员工提交补卡
    const applyRes = await request.post('/api/approvals', {
      headers: empAuth,
      data: {
        type: 'makeup',
        punchDate: PUNCH_DATE,
        punchTime: PUNCH_TIME,
        punchKind: '上班卡',
        reason: 'E2E：当日忘打卡',
      },
    });
    expect(applyRes.status(), '提交补卡').toBe(201);
    const approval = await applyRes.json();
    expect(approval.type).toBe('makeup');
    expect(approval.punchDate).toBe(PUNCH_DATE);
    expect(approval.status).toBe('pending');

    // 2) 管理员审批通过
    const decideRes = await request.put(`/api/approvals/${approval.id}/decide`, {
      headers: adminAuth,
      data: { status: 'approved', comment: 'E2E 审批通过' },
    });
    expect(decideRes.status(), '审批通过').toBe(200);

    // 3) 打卡记录已自动写入（闭环验证）
    const recRes = await request.get(
      `/api/attendance/records?dateFrom=${PUNCH_DATE}&dateTo=${PUNCH_DATE}`,
      { headers: adminAuth }
    );
    expect(recRes.status()).toBe(200);
    const records: { id: string; employeeId: string; date: string; time: string }[] = await recRes.json();
    // 库里统一存 HH:mm:ss（与 Excel 导入、企业微信同步同形）：以前补卡写 09:06、导入写 09:06:00，
    // 同一分钟会被 (employeeId,date,time) 唯一键认成两条。断言归一后的形状，而不是申请单里的 HH:mm。
    const created = records.find((r) => r.employeeId === employeeId && r.time === `${PUNCH_TIME}:00`);
    expect(created, `补卡记录应存在（员工 ${employeeId}，${PUNCH_DATE} ${PUNCH_TIME}）`).toBeTruthy();
    createdPunchRecordId = created!.id;

    // 4) 申请人可在「我的申请」看到已通过记录
    const mineRes = await request.get('/api/approvals/mine', { headers: empAuth });
    const mine: { id: string; status: string }[] = await mineRes.json();
    const mineItem = mine.find((m) => m.id === approval.id);
    expect(mineItem?.status).toBe('approved');
  });

  test('补卡申请：字段缺失被拒（400）', async ({ request }) => {
    const empAuth = { Authorization: `Bearer ${employeeToken}` };
    const badRes = await request.post('/api/approvals', {
      headers: empAuth,
      data: { type: 'makeup', punchDate: PUNCH_DATE, reason: '缺少时间和卡类型' },
    });
    expect(badRes.status(), '缺少 punchTime/punchKind 应 400').toBe(400);
  });

  // ---------- P0-2 月度报表 ----------
  test('月度考勤汇总：ADMIN 可读且结构完整', async ({ request }) => {
    const res = await request.get('/api/attendance/summary?month=2026-09', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.month).toBe('2026-09');
    expect(Array.isArray(body.rows)).toBe(true);
    // 本轮补卡后，测试员工的 09-15 应有打卡 → 月报包含该员工（有打卡即出现）
    const row = body.rows.find((r: { employeeId: string }) => r.employeeId === employeeId);
    if (row) {
      expect(typeof row.workDays).toBe('number');
      expect(typeof row.lateCount).toBe('number');
      expect(typeof row.earlyLeaveCount).toBe('number');
      expect(typeof row.missingCount).toBe('number');
    }
  });

  // ---------- P0-3 公告 ----------
  test('公告：员工无发布权限（403），可读有效公告', async ({ request }) => {
    const empAuth = { Authorization: `Bearer ${employeeToken}` };
    const forbidden = await request.post('/api/announcements', {
      headers: empAuth,
      data: { title: '员工不应能发布' },
    });
    expect(forbidden.status(), 'EMPLOYEE 发布公告应 403').toBe(403);

    const allForbidden = await request.get('/api/announcements/all', { headers: empAuth });
    expect(allForbidden.status(), 'EMPLOYEE 读取管理列表应 403').toBe(403);

    const readable = await request.get('/api/announcements', { headers: empAuth });
    expect(readable.status(), 'EMPLOYEE 可读有效公告').toBe(200);
  });

  test('公告：发布 → 全员可见 → 停用即隐藏 → 删除', async ({ request }) => {
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const empAuth = { Authorization: `Bearer ${employeeToken}` };
    const title = `E2E 公告 ${Date.now()}`;

    // 发布（重要公告）
    const createRes = await request.post('/api/announcements', {
      headers: adminAuth,
      data: { title, content: 'E2E 验证内容', priority: 'important' },
    });
    expect(createRes.status(), '发布公告').toBe(201);
    const ann = await createRes.json();
    announcementId = ann.id;

    // 员工可见（且重要公告置顶）
    const listRes = await request.get('/api/announcements?limit=10', { headers: empAuth });
    const list: { id: string; title: string }[] = await listRes.json();
    const found = list.find((a) => a.id === ann.id);
    expect(found, '员工应能看到新公告').toBeTruthy();
    expect(list[0]?.id, '重要公告应置顶').toBe(ann.id);

    // 停用 → 从有效列表消失
    const offRes = await request.put(`/api/announcements/${ann.id}`, {
      headers: adminAuth,
      data: { active: 0 },
    });
    expect(offRes.status()).toBe(200);
    const list2 = await request.get('/api/announcements?limit=10', { headers: empAuth });
    const list2Data: { id: string }[] = await list2.json();
    expect(list2Data.some((a) => a.id === ann.id), '停用后不应出现在有效列表').toBe(false);

    // 删除
    const delRes = await request.delete(`/api/announcements/${ann.id}`, { headers: adminAuth });
    expect(delRes.status()).toBe(200);
    announcementId = ''; // 已删除，跳过 afterAll 清理
  });
});
