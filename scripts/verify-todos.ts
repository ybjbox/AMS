/**
 * P2-7 回归：待办/通知接入后端（跨设备同步 + 协作派单）。
 * 自包含：建临时 DATA_DIR → runMigrations 建表 + seed admin → createAccount('alice')
 * → 自起 server（node --import tsx，可真杀）→ 真实 HTTP 验证。
 *
 * 覆盖：
 *  - 跨设备同步：服务端为真相源，多次 fetch 一致；标记完成、删除均跨「设备」生效
 *  - 协作派单：admin 派给 alice → 双方列表均可见，且 alice 自动收到「指派」通知
 *  - 权限隔离：alice 删不了 admin 创建的（非派给自己）的待办
 *  - 系统类去重：同 createdBy+type+targetId 未完成只存一条
 *  - 边界：缺 title → 400
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-todos-'));
process.env.PORT = String(3200 + Math.floor(Math.random() * 800));
process.env.NODE_ENV = 'production';
process.env.AMS_ADMIN_PASSWORD = 'AdminPass123';
const ADMIN_PW = 'AdminPass123';
const ALICE_PW = 'Password123';

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = (await r.json()) as any;
  if (j.user?.mustChangePassword) {
    await fetch(`${BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j.token}` },
      body: JSON.stringify({ currentPassword: password, newPassword: password + 'x' }),
    });
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: password + 'x' }),
    });
    return (await r2.json()).token;
  }
  return j.token;
}

async function req(method: string, p: string, body?: any, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function main() {
  // 1) 建表 + seed admin + 创建第二用户 alice（server 启动前，同进程写库）
  const migrate = await import('../server/migrate.ts');
  migrate.runMigrations();
  const authDb = await import('../server/authDb.ts');
  try {
    authDb.createAccount({
      username: 'alice',
      password: ALICE_PW,
      displayName: 'Alice',
      systemRole: 'EMPLOYEE',
    } as any);
  } catch (e: any) {
    if (!/已存在/.test(e?.message ?? '')) console.log('createAccount warn:', e?.message);
  }

  // 2) 起服务
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

  const healthy = await waitForHealth();
  ok('服务启动并健康检查通过', healthy);
  if (!healthy) {
    server.kill('SIGKILL');
    throw new Error('server did not start');
  }

  try {
    const adminToken = await login('admin', ADMIN_PW);
    const aliceToken = await login('alice', ALICE_PW);
    ok('admin 登录成功', !!adminToken);
    ok('alice 登录成功（协作派单的第二方）', !!aliceToken);

    // 3) 跨设备同步：admin 创建 manual todo
    const create1 = await req('POST', '/api/todos', { title: '写周报', type: 'manual' }, adminToken);
    ok('admin 创建待办 201', create1.status === 201, `status ${create1.status}`);
    ok('返回 createdBy=admin', create1.body?.createdBy === 'admin');
    const todoId = create1.body?.id;

    // 4) 第二次 fetch（模拟另一台设备）仍可见 → 服务端真相源
    const listA = await req('GET', '/api/todos', undefined, adminToken);
    ok('admin 列表含刚创建的待办（跨设备一致）', Array.isArray(listA.body) && listA.body.some((t: any) => t.id === todoId));

    // 5) 标记完成 → 再次 fetch 反映
    const toggle = await req('PUT', `/api/todos/${todoId}`, { completed: true }, adminToken);
    ok('标记完成成功', toggle.status === 200 && toggle.body?.completed === true);
    const listB = await req('GET', '/api/todos', undefined, adminToken);
    ok('完成状态跨设备生效', listB.body?.find((t: any) => t.id === todoId)?.completed === true);

    // 6) 协作派单：admin 派给 alice
    const assign = await req('POST', '/api/todos', { title: '审阅合同', type: 'manual', assignee: 'alice' }, adminToken);
    ok('派单创建 201 且 assignee=alice', assign.status === 201 && assign.body?.assignee === 'alice');
    ok('派单 createdBy=admin', assign.body?.createdBy === 'admin');
    const assignId = assign.body?.id;

    // 7) alice 列表可见（协作生效）
    const aliceList = await req('GET', '/api/todos', undefined, aliceToken);
    ok('alice 能看到别人派给自己的待办', Array.isArray(aliceList.body) && aliceList.body.some((t: any) => t.id === assignId));
    // 8) admin 列表也含（自己创建的）
    const adminList2 = await req('GET', '/api/todos', undefined, adminToken);
    ok('admin 列表仍含派出的待办', adminList2.body?.some((t: any) => t.id === assignId));

    // 9) 派单自动通知：alice 收到「指派」通知
    const aliceNotifs = await req('GET', '/api/notifications', undefined, aliceToken);
    ok(
      'alice 收到派单通知（自动生成）',
      Array.isArray(aliceNotifs.body) &&
        aliceNotifs.body.some((n: any) => (n.title + n.message).includes('待办') && !n.read)
    );

    // 10) 权限隔离：alice 删不了 admin 创建的（非派给自己）的待办
    const delByAlice = await req('DELETE', `/api/todos/${todoId}`, undefined, aliceToken);
    ok('alice 删除他人待办被拒（404）', delByAlice.status === 404, `status ${delByAlice.status}`);
    const stillThere = await req('GET', '/api/todos', undefined, adminToken);
    ok('被拒删的待办仍存在（数据不被越权破坏）', stillThere.body?.some((t: any) => t.id === todoId));

    // 11) 系统类去重：同 createdBy+type+targetId 未完成只存一条
    const dup1 = await req('POST', '/api/todos', { title: '合同到期提醒', type: 'contract', targetId: 'EMP001' }, adminToken);
    const dup2 = await req('POST', '/api/todos', { title: '合同到期提醒', type: 'contract', targetId: 'EMP001' }, adminToken);
    ok('系统类重复创建返回同一项（去重）', dup1.body?.id === dup2.body?.id, `${dup1.body?.id} vs ${dup2.body?.id}`);

    // 12) 通知标记已读
    const firstNotif = (aliceNotifs.body as any[])[0];
    if (firstNotif) {
      const before = (aliceNotifs.body as any[]).filter((n) => !n.read).length;
      const mk = await req('PUT', `/api/notifications/${firstNotif.id}/read`, undefined, aliceToken);
      const afterList = await req('GET', '/api/notifications', undefined, aliceToken);
      const after = (afterList.body as any[]).filter((n) => !n.read).length;
      ok('标记已读接口成功', mk.status === 200);
      ok('未读数下降', after === before - 1, `${before} -> ${after}`);
    } else {
      ok('通知存在可标记已读', false, 'alice 无通知');
    }

    // 13) 删除（创建者自己删）
    const del = await req('DELETE', `/api/todos/${todoId}`, undefined, adminToken);
    ok('创建者删除自己待办成功', del.status === 200);
    const afterDel = await req('GET', '/api/todos', undefined, adminToken);
    ok('删除后列表不含该项', !afterDel.body?.some((t: any) => t.id === todoId));

    // 14) 边界：缺 title → 400
    const bad = await req('POST', '/api/todos', { type: 'manual' }, adminToken);
    ok('缺 title 创建返回 400', bad.status === 400, `status ${bad.status}`);
  } finally {
    try {
      server.kill('SIGKILL');
    } catch {}
  }

  console.log(`\nP2-7 回归结果：${pass} 通过 / ${fail} 失败`);
  if (fail > 0) {
    console.log('失败项：\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('脚本异常：', e);
  process.exit(1);
});
