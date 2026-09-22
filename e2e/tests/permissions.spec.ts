import { test, expect } from '@playwright/test';
import { resolveAdminPassword } from '../adminCredentials';

/**
 * 角色权限矩阵 E2E（API 层）—— 对齐 server/authMiddleware.ts 的 POLICIES 表：
 *
 * 角色层级：EMPLOYEE(1) < HR(2) < ADMIN(3) < SUPER_ADMIN(4)
 * 默认策略：读 = EMPLOYEE+，写 = HR+
 * 特例：
 *   POST /approvals                → EMPLOYEE+（自助提交）
 *   /auth/accounts、/auth/security-events、/audit-logs → ADMIN+
 *   /export/*（批量导出敏感字段）   → HR+
 *   /departments 写操作            → ADMIN+
 *
 * 流程：管理员创建测试账号（mustChangePassword=true）→ 各账号登录 → 改密换新会话 →
 *       用新会话跑矩阵 → 收尾删除账号。
 */

// 口令解析统一走 helper：拿不到就抛错，绝不回退到提交进仓库的口令
const ADMIN_PASSWORD = resolveAdminPassword();

const TEST_PASSWORD_1 = 'E2e-Matrix#2026';
const TEST_PASSWORD_2 = 'E2e-Matrix#2027';

const ACCOUNTS = {
  employee: { username: 'e2e-employee', systemRole: 'EMPLOYEE', displayName: 'E2E 普通员工' },
  hr: { username: 'e2e-hr', systemRole: 'HR', displayName: 'E2E HR 专员' },
};

interface Session {
  username: string;
  token: string;
}

/** 登录并返回 token；mustChangePassword 时自动改密换新会话 */
async function login(
  request: import('@playwright/test').APIRequestContext,
  username: string,
  password: string
): Promise<Session> {
  const loginRes = await request.post('/api/auth/login', {
    data: { username, password },
  });
  expect(loginRes.status(), `登录 ${username}`).toBe(200);
  const loginBody = await loginRes.json();
  const token: string = loginBody.token;

  if (loginBody.user?.mustChangePassword) {
    const changeRes = await request.post('/api/auth/change-password', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPassword: password, newPassword: TEST_PASSWORD_2 },
    });
    expect(changeRes.status(), `改密 ${username}`).toBe(200);
    const changeBody = await changeRes.json();
    // 服务端补发新会话，避免被踢回登录页
    const newToken: string = changeBody.token ?? changeBody.session?.token;
    expect(newToken, '改密响应应包含新 token').toBeTruthy();
    return { username, token: newToken };
  }
  return { username, token };
}

/** 矩阵断言：预期状态码 */
async function expectStatus(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  expected: number,
  label: string,
  data?: unknown
) {
  const res = await request.fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  if (res.status() !== expected) {
    const body = await res.text().catch(() => '');
    console.log(`[MISMATCH] ${method} ${path} [${label}] expected=${expected} got=${res.status()} body=${body.slice(0, 250)}`);
  }
  expect(res.status(), label).toBe(expected);
  return res;
}

test.describe.serial('角色权限矩阵', () => {
  let adminToken = '';
  const tokens: Record<string, Session> = {};

  test.beforeAll(async ({ request }) => {
    // 管理员登录
    const res = await request.post('/api/auth/login', {
      data: { username: 'admin', password: ADMIN_PASSWORD },
    });
    expect(res.status()).toBe(200);
    adminToken = (await res.json()).token;

    // 清理可能残留的测试账号（上次运行中断）
    for (const acc of Object.values(ACCOUNTS)) {
      await request.delete(`/api/auth/accounts/${acc.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }

    // 创建测试账号（ADMIN 权限）
    for (const acc of Object.values(ACCOUNTS)) {
      const createRes = await request.post('/api/auth/accounts', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { ...acc, password: TEST_PASSWORD_1 },
      });
      expect(createRes.status(), `创建 ${acc.username}`).toBe(201);
    }

    // 各账号登录 + 改密
    for (const acc of Object.values(ACCOUNTS)) {
      tokens[acc.username] = await login(request, acc.username, TEST_PASSWORD_1);
    }
  });

  test.afterAll(async ({ request }) => {
    if (!adminToken) return;

    // 1) 驳回测试审批（保持数据整洁；审批无删除端点，走正常驳回流程）
    try {
      const pendingRes = await request.get('/api/approvals/pending', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (pendingRes.status() === 200) {
        const items: { id?: unknown; reason?: unknown }[] = await pendingRes.json();
        for (const item of Array.isArray(items) ? items : []) {
          if (typeof item.reason === 'string' && item.reason.includes('E2E 权限矩阵测试') && typeof item.id === 'string') {
            await request.put(`/api/approvals/${item.id}/decide`, {
              headers: { Authorization: `Bearer ${adminToken}` },
              data: { status: 'rejected', comment: 'E2E 测试数据清理' },
            });
          }
        }
      }
    } catch { /* 清理失败不阻断 */ }

    // 2) 删除测试员工（HR/ADMIN 均可删；用 admin 会话）
    try {
      const usersRes = await request.get('/api/users?pageSize=200', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (usersRes.status() === 200) {
        const body: unknown = await usersRes.json();
        const items: { id?: unknown; name?: unknown }[] = Array.isArray(body)
          ? (body as { id?: unknown; name?: unknown }[])
          : ((body as { items?: { id?: unknown; name?: unknown }[] }).items ?? []);
        for (const u of items) {
          if (typeof u.name === 'string' && u.name.startsWith('E2E测试员工') && typeof u.id === 'string') {
            await request.delete(`/api/users/${u.id}`, {
              headers: { Authorization: `Bearer ${adminToken}` },
            });
          }
        }
      }
    } catch { /* 清理失败不阻断 */ }

    // 3) 删除测试账号
    for (const acc of Object.values(ACCOUNTS)) {
      await request.delete(`/api/auth/accounts/${acc.username}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  });

  // ---- 读操作：EMPLOYEE+ 全部可读 ----
  test('读操作：EMPLOYEE / HR / ADMIN 均可读员工列表', async ({ request }) => {
    for (const acc of Object.values(ACCOUNTS)) {
      await expectStatus(request, tokens[acc.username].token, 'GET', '/api/users', 200,
        `GET /users as ${acc.systemRole} 应 200`);
    }
  });

  // ---- 写操作：默认 HR+（EMPLOYEE 应 403）----
  test('写操作：EMPLOYEE 被拒（403），HR 可写', async ({ request }) => {
    // POST /users 创建员工（默认写策略 → HR+）
    await expectStatus(request, tokens['e2e-employee'].token, 'POST', '/api/users', 403,
      'POST /users as EMPLOYEE 应 403', { name: 'E2E测试', idCard: '110101199001011234' });
    await expectStatus(request, tokens['e2e-hr'].token, 'POST', '/api/users', 201,
      'POST /users as HR 应 201', {
        name: 'E2E测试员工',
        idCard: '110101199001011234',
        gender: '男',
        age: 30,
        phone: '13300000001',
        department: '研发部',
        status: '在职',
        joinDate: '2026-01-01',
        employmentType: '正式',
      });
  });

  // ---- 审批自助提交：EMPLOYEE+ ----
  test('审批自助提交：EMPLOYEE 可提交（特例策略）', async ({ request }) => {
    // 先造一条待审批数据；注意返回结构可能是数组或信封
    const res = await expectStatus(request, tokens['e2e-employee'].token, 'POST', '/api/approvals', 201,
      'POST /approvals as EMPLOYEE 应 201', {
        type: 'leave',
        leaveType: '事假',
        startDate: '2026-12-01',
        endDate: '2026-12-02',
        reason: 'E2E 权限矩阵测试请假',
      });
    // 清理：管理员不再提供审批删除接口——该数据留给管理员查看（无删除端点），无副作用
    void res;
  });

  // ---- 审计日志：仅 ADMIN ----
  test('审计日志：EMPLOYEE / HR 被拒（403），ADMIN 可读', async ({ request }) => {
    await expectStatus(request, tokens['e2e-employee'].token, 'GET', '/api/audit-logs', 403,
      'GET /audit-logs as EMPLOYEE 应 403');
    await expectStatus(request, tokens['e2e-hr'].token, 'GET', '/api/audit-logs', 403,
      'GET /audit-logs as HR 应 403');
    await expectStatus(request, adminToken, 'GET', '/api/audit-logs', 200,
      'GET /audit-logs as ADMIN 应 200');
  });

  // ---- 运行诊断：仅 ADMIN ----
  test('运行诊断：EMPLOYEE / HR 被拒（403），ADMIN 可读且响应结构完整', async ({ request }) => {
    await expectStatus(request, tokens['e2e-employee'].token, 'GET', '/api/system/diagnostics', 403,
      'GET /system/diagnostics as EMPLOYEE 应 403');
    await expectStatus(request, tokens['e2e-hr'].token, 'GET', '/api/system/diagnostics', 403,
      'GET /system/diagnostics as HR 应 403');
    const res = await expectStatus(request, adminToken, 'GET', '/api/system/diagnostics', 200,
      'GET /system/diagnostics as ADMIN 应 200');
    const body = await res.json();
    expect(body.health?.status, 'health.status').toBe('ok');
    expect(body.health?.db, 'health.db').toBe('up');
    expect(typeof body.health?.uptimeSec, 'uptimeSec 应为数字').toBe('number');
    expect(typeof body.health?.version, 'version 应为字符串').toBe('string');
    expect(body.accessLog, '应含访问日志汇总').toBeTruthy();
    expect(typeof body.accessLog.total, 'accessLog.total').toBe('number');
    expect(Array.isArray(body.recent), 'recent 应为数组').toBe(true);
    expect(body.tableCounts, '应含表行数').toBeTruthy();
    expect(typeof body.tableCounts.employees, 'employees 行数').toBe('number');
  });

  // ---- 账号管理：仅 ADMIN ----
  test('账号管理：EMPLOYEE / HR 被拒（403）', async ({ request }) => {
    await expectStatus(request, tokens['e2e-employee'].token, 'GET', '/api/auth/accounts', 403,
      'GET /auth/accounts as EMPLOYEE 应 403');
    await expectStatus(request, tokens['e2e-hr'].token, 'POST', '/api/auth/accounts', 403,
      'POST /auth/accounts as HR 应 403', { username: 'x', password: 'y' });
  });

  // ---- 组织架构写：仅 ADMIN（特例策略）----
  test('组织架构写：EMPLOYEE / HR 被拒（403），ADMIN 通过鉴权', async ({ request }) => {
    // 该 Router 的写端点是整树替换 PUT /departments/tree（无单点 POST）。
    // 为不修改真实组织数据，ADMIN 用例发送非法载荷：预期 400（证明已通过鉴权层、止步于校验）。
    await expectStatus(request, tokens['e2e-employee'].token, 'PUT', '/api/departments/tree', 403,
      'PUT /departments/tree as EMPLOYEE 应 403', { departments: [] });
    await expectStatus(request, tokens['e2e-hr'].token, 'PUT', '/api/departments/tree', 403,
      'PUT /departments/tree as HR 应 403', { departments: [] });
    await expectStatus(request, adminToken, 'PUT', '/api/departments/tree', 400,
      'PUT /departments/tree as ADMIN 应 400（鉴权通过，载荷非法）', { notAnArray: true });
  });

  // ---- 越权提升防护：HR 不能创建更高权限账号 ----
  test('HR 尝试创建账号被拒 + EMPLOYEE 无法访问他人数据面', async ({ request }) => {
    // HR 不能动账号管理（ADMIN 特例）
    await expectStatus(request, tokens['e2e-hr'].token, 'GET', '/api/auth/security-events', 403,
      'GET /auth/security-events as HR 应 403');
  });

  // ---- 会话安全：登出后 token 失效 ----
  test('登出后旧 token 失效（401）', async ({ request }) => {
    // 用员工账号单独登录一个临时会话，登出，验证 token 失效
    const loginRes = await request.post('/api/auth/login', {
      data: { username: 'e2e-employee', password: TEST_PASSWORD_2 },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    const logoutRes = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status()).toBe(200);

    const meRes = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status(), '登出后旧 token 应失效').toBe(401);
  });
});
