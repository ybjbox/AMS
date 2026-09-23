/**
 * 企业微信考勤接入链路回归（N1 · 无真实凭据的形态）。
 *
 * 用一个本地假企微服务把整条链路钉住（凭据→token→分段分批→映射→幂等落库），
 * 因为真实联调要等可信 IP 与自建应用 Secret；这条测试就是"凭据一到就能跑"的证据。
 *
 * 重点断言四类：
 *  1. 官方硬限制真的落实：token 缓存、单次 ≤29 天分段、每批 ≤100 人、datatype 固定为 1（只取上下班）；
 *  2. 敏感字段在服务端边界即被丢弃 —— 返回值与落库行里都不许出现位置/WiFi/设备号/媒体；
 *  3. 幂等与"只写已认领"：重复同步不造双份，未认领 userid 只计数不落库，预览一行都不写；
 *  4. 权限与掩码：未登录 401、HR 403、回传掩码不改原 Secret、映射唯一冲突给 400 而不是 500。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { db, createEmployee, deleteEmployee } from '../db.ts';
import { authGate } from '../authMiddleware.ts';
import { createAccount, createSession, deleteAccount } from '../authDb.ts';
import { ensurePunchRecordUniqueIndex } from '../migrate.ts';
import { upsertRecord } from '../attendanceDb.ts';
import { wecomRouter } from '../wecomRouter.ts';
import {
  defaultWeComConfig,
  deleteWeComBinding,
  getWeComConfig,
  getWeComSyncState,
  listWeComBindings,
  setWeComConfig,
  setWeComSyncState,
  upsertWeComBinding,
  validateWeComBaseUrl,
  WeComConfigError,
} from '../wecomDb.ts';
import { fetchCheckinRecords, formatPunchTime, resetWeComTokenCache, CHECKIN_DATA_TYPE } from '../wecomClient.ts';
import { runWeComSync, resolveSyncWindow, WeComSyncError, MAX_BACKFILL_DAYS } from '../wecomSync.ts';

const UA = 'Mozilla/5.0 (vitest-wecom)';
const PW = 'Wecom#Test2026-aa';

interface StubCall {
  starttime: number;
  endtime: number;
  opencheckindatatype: number;
  useridlist: string[];
}

const stub = {
  tokenCalls: 0,
  calls: [] as StubCall[],
  rows: [] as Record<string, unknown>[],
  /** 下 N 次 getcheckindata 返回该 errcode（0 表示不注入故障） */
  failOnceWith: 0,
  failMsg: '',
  requireToken: '',
};

let wecomServer: Server;
let app: Server;
let stubOrigin = '';
let apiOrigin = '';
let superToken = '';
let hrToken = '';
let empA: { id: string; name: string };
let empB: { id: string; name: string };
const userIds = ['zhang_san', 'li_si'];
const extraUserId = 'wang_wu';

/** 一条"满字段"的原始记录：真实企微会返回这些，我们必须一个都不带走 */
function rawPunch(userid: string, at: number): Record<string, unknown> {
  return {
    userid,
    checkin_type: '上班打卡',
    exception_type: '未打卡',
    checkin_time: at,
    location_title: '群邦大厦',
    location_detail: '浙江省杭州市西湖区xx路1号',
    wifiname: 'guanbang-office',
    wifimac: 'aa:bb:cc:dd:ee:ff',
    notes: '客户现场打卡，含手机号 13800000000',
    mediaids: 'MEDIA_SECRET_ID',
    lat: 30259000,
    lng: 120219000,
    deviceid: 'DEVICE-9527',
    sch_checkin_time: at - 1800,
    groupid: 1234,
    schedule_id: 5678,
    timeline_id: 90,
    checkin_groupid: 1,
  };
}

function punchRowOf(userid: string, at: number) {
  return { userid, checkin_time: at };
}

beforeAll(async () => {
  ensurePunchRecordUniqueIndex();
  empA = createEmployee({ name: '企微同步甲' })!;
  empB = createEmployee({ name: '企微同步乙' })!;

  const wecomApp = express();
  wecomApp.get('/cgi-bin/gettoken', (req, res) => {
    stub.tokenCalls += 1;
    stub.requireToken = `tok-${stub.tokenCalls}`;
    if (!req.query.corpsecret) {
      res.json({ errcode: 40013, errmsg: 'invalid corpid' });
      return;
    }
    res.json({ errcode: 0, errmsg: 'ok', access_token: stub.requireToken, expires_in: 7200 });
  });
  wecomApp.post('/cgi-bin/checkin/getcheckindata', express.json(), (req, res) => {
    if (String(req.query.access_token ?? '') !== stub.requireToken) {
      res.json({ errcode: 40014, errmsg: 'invalid access_token' });
      return;
    }
    stub.calls.push(req.body as StubCall);
    if (stub.failOnceWith) {
      const code = stub.failOnceWith;
      stub.failOnceWith = 0;
      res.json({ errcode: code, errmsg: stub.failMsg || `stub-${code}` });
      return;
    }
    res.json({ errcode: 0, errmsg: 'ok', checkindata: stub.rows });
  });
  wecomServer = await new Promise<Server>((r) => {
    const s = wecomApp.listen(0, '127.0.0.1', () => r(s));
  });
  stubOrigin = `http://127.0.0.1:${(wecomServer.address() as AddressInfo).port}`;

  const apiApp = express();
  apiApp.use('/api', authGate);
  apiApp.use('/api/wecom', wecomRouter);
  app = await new Promise<Server>((r) => {
    const s = apiApp.listen(0, '127.0.0.1', () => r(s));
  });
  apiOrigin = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/wecom`;

  for (const u of ['wecom-super', 'wecom-hr']) deleteAccount(u);
  createAccount({ username: 'wecom-super', password: PW, systemRole: 'SUPER_ADMIN' });
  createAccount({ username: 'wecom-hr', password: PW, systemRole: 'HR' });
  superToken = createSession('wecom-super', '127.0.0.1', UA).token;
  hrToken = createSession('wecom-hr', '127.0.0.1', UA).token;
});

afterAll(async () => {
  clearPunches();
  for (const id of [...userIds, extraUserId]) deleteWeComBinding(id);
  setWeComConfig(defaultWeComConfig());
  setWeComSyncState({ cursorAt: null, lastSyncAt: null, lastReport: null, lastErrors: [] });
  deleteEmployee(empA.id);
  deleteEmployee(empB.id);
  deleteAccount('wecom-super');
  deleteAccount('wecom-hr');
  await new Promise<void>((r) => wecomServer.close(() => r()));
  await new Promise<void>((r) => app.close(() => r()));
});

function clearPunches() {
  db.prepare('DELETE FROM punch_records WHERE employeeId IN (?, ?)').run(empA.id, empB.id);
}

function configure(overrides: Partial<ReturnType<typeof getWeComConfig>> = {}) {
  setWeComConfig({
    ...defaultWeComConfig(),
    corpId: 'ww-test-corp',
    agentId: '1000002',
    corpSecret: 'stub-secret-value',
    baseUrl: stubOrigin,
    ...overrides,
  });
  resetWeComTokenCache();
}

function resetStub(rows: Record<string, unknown>[] = []) {
  stub.tokenCalls = 0;
  stub.calls = [];
  stub.rows = rows;
  stub.failOnceWith = 0;
  stub.failMsg = '';
}

async function api(method: string, pathName: string, token?: string, body?: unknown) {
  const res = await fetch(`${apiOrigin}${pathName}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'User-Agent': UA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json };
}

const punchCount = () =>
  Number(db.prepare('SELECT COUNT(*) AS c FROM punch_records WHERE source = ?').get('wecom')?.c ?? 0);

describe('企微客户端：官方硬限制与字段白名单', () => {
  beforeEach(() => resetStub());

  it('access_token 只取一次并复用；opencheckindatatype 固定为 1（只取上下班打卡）', async () => {
    configure();
    const cfg = getWeComConfig();
    const at = Math.floor(Date.now() / 1000) - 3600;
    resetStub([rawPunch(userIds[0], at)]);
    const first = await fetchCheckinRecords(cfg, userIds, at - 60, at + 60);
    const second = await fetchCheckinRecords(cfg, userIds, at - 60, at + 60);
    expect(stub.tokenCalls).toBe(1);
    expect(first.calls + second.calls).toBe(2);
    expect(stub.calls.every((c) => c.opencheckindatatype === CHECKIN_DATA_TYPE)).toBe(true);
    expect(CHECKIN_DATA_TYPE).toBe(1);
  });

  it('60 天窗口 + 120 人 → 按 ≤29 天分段、每批 ≤100 人（3 × 2 = 6 次调用，首尾相接不重叠）', async () => {
    configure();
    const cfg = getWeComConfig();
    const users = Array.from({ length: 120 }, (_, i) => `u${i}`);
    const end = Math.floor(Date.now() / 1000);
    const start = end - 60 * 86400;
    const res = await fetchCheckinRecords(cfg, users, start, end);
    expect(res.calls).toBe(6);
    for (const call of stub.calls) {
      expect(call.endtime - call.starttime).toBeLessThanOrEqual(29 * 86400);
      expect(call.useridlist.length).toBeLessThanOrEqual(100);
      expect(call.useridlist.length).toBeGreaterThan(0);
    }
    const windows = stub.calls.map((c) => `${c.starttime}-${c.endtime}`);
    expect(new Set(windows).size).toBe(3);
    expect(stub.calls[0].useridlist.length + stub.calls[1].useridlist.length).toBe(120);
  });

  it('token 失效只重取一次并重试该次调用', async () => {
    configure();
    const cfg = getWeComConfig();
    resetStub([punchRowOf(userIds[0], Math.floor(Date.now() / 1000) - 60)]);
    // 先发一次让 stub 记住 token，然后把已存 token 作废（stub 只认最新签发的那个）
    await fetchCheckinRecords(cfg, userIds, Math.floor(Date.now() / 1000) - 120, Math.floor(Date.now() / 1000));
    stub.requireToken = 'revoked-by-server';
    const before = stub.tokenCalls;
    const res = await fetchCheckinRecords(cfg, userIds, Math.floor(Date.now() / 1000) - 120, Math.floor(Date.now() / 1000));
    expect(stub.tokenCalls).toBe(before + 1);
    expect(res.punches.length).toBe(1);
  });

  it('可信 IP 被拒时给出可操作的中文原因（60020）', async () => {
    configure();
    const cfg = getWeComConfig();
    resetStub();
    stub.failOnceWith = 60020;
    await expect(fetchCheckinRecords(cfg, userIds, 1, 2)).rejects.toThrow(/可信 IP/u);
  });

  it('接口整体不可用时不静默：抛错而非返回空数组', async () => {
    configure();
    const cfg = getWeComConfig();
    resetStub();
    stub.failOnceWith = 45009;
    await expect(fetchCheckinRecords(cfg, userIds, 1, 2)).rejects.toThrow(/频率限制/u);
  });
});

describe('baseUrl 目标地址校验', () => {
  it('官方域名与本机回环通过，形近域名 / 内网 / 带参数地址一律拒', () => {
    expect(validateWeComBaseUrl('https://qyapi.weixin.qq.com')).toBe('https://qyapi.weixin.qq.com');
    expect(validateWeComBaseUrl('http://127.0.0.1:4567/')).toBe('http://127.0.0.1:4567');
    // 出站请求会带上 corpSecret，形近域名必须拒（这是留这条配置的代价）
    expect(() => validateWeComBaseUrl('https://qyapi.weixin.qq.com.evil.test')).toThrow(/只能是/u);
    expect(() => validateWeComBaseUrl('http://intranet.internal:8080')).toThrow(/必须使用 https/u);
    expect(() => validateWeComBaseUrl('https://intranet.internal')).toThrow(/只能是/u);
    expect(() => validateWeComBaseUrl('https://x.test/?a=1')).toThrow(WeComConfigError);
    expect(() => validateWeComBaseUrl('https://u:p@qyapi.weixin.qq.com')).toThrow(/账号密码/u);
    expect(() => validateWeComBaseUrl('ftp://qyapi.weixin.qq.com')).toThrow(/http\(s\)/u);
  });
});

describe('同步：映射、幂等与只读预览', () => {
  beforeEach(() => {
    clearPunches();
    resetStub();
    configure();
    setWeComSyncState({ cursorAt: null, lastSyncAt: null, lastReport: null, lastErrors: [] });
    for (const id of [...userIds, extraUserId]) deleteWeComBinding(id);
  });

  it('没有任何映射时直接拒绝开跑，并说明要先登记 userid', async () => {
    await expect(runWeComSync({ dryRun: false })).rejects.toThrow(WeComSyncError);
    await expect(runWeComSync({ dryRun: false })).rejects.toThrow(/userid/u);
    expect(stub.calls.length).toBe(0);
  });

  it('已认领的落库（来源标 wecom、姓名取档案真值），未认领的只进 unbound 且登记为待认领', async () => {
    const at = Math.floor(Date.now() / 1000) - 3600;
    resetStub([rawPunch(userIds[0], at), rawPunch(userIds[1], at + 60), rawPunch(userIds[1], at + 120)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: empA.id, operator: 'tester' });
    const report = await runWeComSync({ dryRun: false, dateFrom: formatPunchTime(at - 60)!.date, dateTo: formatPunchTime(at + 600)!.date });

    expect(report.written).toBe(1);
    expect(report.unbound).toEqual([{ wecomUserId: userIds[1], count: 2 }]);
    const row = db
      .prepare('SELECT * FROM punch_records WHERE employeeId = ?')
      .get(empA.id) as unknown as Record<string, string>;
    expect(row.source).toBe('wecom');
    expect(row.employeeName).toBe(empA.name);
    expect(row.date).toBe(formatPunchTime(at)!.date);
    // 与 Excel 导入通道同一时间形状（HH:mm:ss），否则同一分钟会被认成两条
    expect(row.time).toMatch(/^\d{2}:\d{2}:00$/u);
    // 敏感字段一个都不能落库
    const dump = JSON.stringify(row);
    for (const leak of ['wifimac', 'deviceid', 'mediaids', 'lat', 'lng', 'location', 'notes', 'aa:bb:cc']) {
      expect(dump).not.toContain(leak);
    }
    // 未认领者被登记为待认领，下一轮才会进请求列表
    const pending = listWeComBindings().find((b) => b.wecomUserId === userIds[1]);
    expect(pending?.employeeId).toBeNull();
  });

  it('重复同步同一区间幂等：第二次一行都不新增', async () => {
    const at = Math.floor(Date.now() / 1000) - 7200;
    resetStub([punchRowOf(userIds[0], at), punchRowOf(userIds[0], at + 90)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: empA.id, operator: 'tester' });
    const range = { dateFrom: formatPunchTime(at - 60)!.date, dateTo: formatPunchTime(at + 600)!.date };
    const first = await runWeComSync({ dryRun: false, ...range });
    const second = await runWeComSync({ dryRun: false, ...range });
    expect(first.written).toBe(2);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(2);
    expect(punchCount()).toBe(2);
  });

  it('同一分钟已有手工/导入卡时，同步不造第二条（跨来源共用唯一键）', async () => {
    const at = Math.floor(Date.now() / 1000) - 5400;
    resetStub([punchRowOf(userIds[0], at)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: empB.id, operator: 'tester' });
    // 先由补卡/导入路径写一条同分钟的卡（HH:mm:ss）
    upsertRecord({
      employeeId: empB.id,
      employeeName: empB.name,
      date: formatPunchTime(at)!.date,
      time: `${formatPunchTime(at)!.time.slice(0, 5)}:00`,
    });
    const report = await runWeComSync({
      dryRun: false,
      dateFrom: formatPunchTime(at - 60)!.date,
      dateTo: formatPunchTime(at + 600)!.date,
    });
    expect(report.written).toBe(0);
    expect(report.skipped).toBe(1);
    expect(
      Number(db.prepare('SELECT COUNT(*) AS c FROM punch_records WHERE employeeId = ?').get(empB.id)?.c ?? 0)
    ).toBe(1);
  });
  it('干跑预览零副作用：不写打卡、不登记映射、不抬游标', async () => {
    const at = Math.floor(Date.now() / 1000) - 3600;
    resetStub([rawPunch(userIds[0], at), rawPunch(userIds[1], at)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: empA.id, operator: 'tester' });
    const report = await runWeComSync({
      dryRun: true,
      dateFrom: formatPunchTime(at - 60)!.date,
      dateTo: formatPunchTime(at + 600)!.date,
    });
    expect(report.fetched).toBe(2);
    expect(report.written).toBe(0);
    expect(punchCount()).toBe(0);
    expect(listWeComBindings().map((b) => b.wecomUserId)).toEqual([userIds[0]]);
    expect(getWeComSyncState().cursorAt).toBeNull();
  });

  it('映射指向已删除员工时报出来，不静默丢数据', async () => {
    const at = Math.floor(Date.now() / 1000) - 3600;
    resetStub([punchRowOf(userIds[0], at)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: 'EMP9999', operator: 'tester' });
    const report = await runWeComSync({
      dryRun: false,
      dateFrom: formatPunchTime(at - 60)!.date,
      dateTo: formatPunchTime(at + 600)!.date,
    });
    expect(report.missingEmployees).toEqual([`${userIds[0]} → EMP9999`]);
    expect(report.written).toBe(0);
  });

  it('增量窗口：从游标回看 overlap，首轮没有游标则回看 7 天；一次补拉不超过 180 天', () => {
    const cfg = { ...defaultWeComConfig(), overlapMinutes: 120 };
    const now = new Date('2026-09-23T12:00:00');
    setWeComSyncState({ cursorAt: Math.floor(now.getTime() / 1000) - 3600 });
    expect(resolveSyncWindow({}, cfg, now).startSec).toBe(Math.floor(now.getTime() / 1000) - 3600 - 7200);
    setWeComSyncState({ cursorAt: null });
    expect(resolveSyncWindow({}, cfg, now).startSec).toBe(Math.floor(now.getTime() / 1000) - 7 * 86400);
    expect(() =>
      resolveSyncWindow({ dateFrom: '2020-01-01', dateTo: '2026-09-23' }, cfg, now)
    ).toThrow(new RegExp(`最多 ${MAX_BACKFILL_DAYS} 天`));
    expect(() => resolveSyncWindow({ dateFrom: '2026-09-24', dateTo: '2026-09-23' }, cfg, now)).toThrow(/早于/u);
    // 斜杠式日期必须拒（否则会被静默当成"没填"而退化成增量窗口）
    expect(() => resolveSyncWindow({ dateFrom: '2026/09/20', dateTo: '2026-09-23' }, cfg, now)).toThrow(/格式/u);
    expect(() => resolveSyncWindow({ dateFrom: '', dateTo: 'bad' }, cfg, now)).toThrow(/格式/u);
    expect(resolveSyncWindow({ dateFrom: '2026-09-20', dateTo: '2026-09-20' }, cfg, now).endSec).toBe(
      Math.floor(new Date(2026, 8, 21, 0, 0, 0).getTime() / 1000)
    );
  });
});

describe('/api/wecom HTTP 层（真 authGate）', () => {
  beforeEach(() => {
    resetStub();
    configure();
    clearPunches();
    for (const b of listWeComBindings()) deleteWeComBinding(b.wecomUserId);
  });

  it('未登录 401；HR 也进不来（读配置都要 ADMIN）', async () => {
    expect((await api('GET', '/config')).status).toBe(401);
    expect((await api('GET', '/config', hrToken)).status).toBe(403);
    expect((await api('POST', '/test', hrToken)).status).toBe(403);
    expect((await api('GET', '/config', superToken)).status).toBe(200);
  });

  it('Secret 掩码回显：回传掩码不改原值，清除哨兵才置空', async () => {
    const masked = (await api('GET', '/config', superToken)).json as { corpSecret: string };
    expect(masked.corpSecret).toContain('********');
    expect(masked.corpSecret).not.toContain('stub-secret-value');

    await api('PUT', '/config', superToken, { ...masked, corpSecret: '********', corpId: 'ww-renamed' });
    expect(getWeComConfig().corpSecret).toBe('stub-secret-value');
    expect(getWeComConfig().corpId).toBe('ww-renamed');

    await api('PUT', '/config', superToken, { corpSecret: '__CLEAR__' });
    expect(getWeComConfig().corpSecret).toBe('');
  });

  it('非法 baseUrl 在保存时就被拒（400），不会等到调接口才失败', async () => {
    const res = await api('PUT', '/config', superToken, { baseUrl: 'http://192.168.1.10:8080' });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toMatch(/https/u);
    expect(getWeComConfig().baseUrl).toBe(stubOrigin);
  });

  it('成员映射：认领/退回/删除，以及两条冲突路径都给 400 而不是 500', async () => {
    let res = await api('PUT', '/bindings', superToken, { items: [{ wecomUserId: userIds[0], employeeId: empA.id }] });
    expect(res.status).toBe(200);
    expect((res.json as { items: { employeeId: string | null }[] }).items[0].employeeId).toBe(empA.id);

    // 同一员工被第二个 userid 认领 → 唯一索引冲突翻成可读 400
    res = await api('PUT', '/bindings', superToken, { items: [{ wecomUserId: userIds[1], employeeId: empA.id }] });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toMatch(/已被企业微信账号/u);

    // 一批里两个 userid 指向同一员工也是 400
    res = await api('PUT', '/bindings', superToken, {
      items: [
        { wecomUserId: userIds[1], employeeId: empB.id },
        { wecomUserId: 'wang_wu', employeeId: empB.id },
      ],
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toMatch(/本次提交/u);

    // 档案里查无此人
    res = await api('PUT', '/bindings', superToken, { items: [{ wecomUserId: userIds[1], employeeId: 'EMP9999' }] });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toMatch(/员工档案不存在/u);

    // 退回待认领
    res = await api('PUT', '/bindings', superToken, { items: [{ wecomUserId: userIds[0], employeeId: null }] });
    expect((res.json as { items: { employeeId: string | null }[] }).items[0].employeeId).toBeNull();

    res = await api('DELETE', `/bindings/${userIds[0]}`, superToken);
    expect(res.status).toBe(200);
    expect(listWeComBindings().some((b) => b.wecomUserId === userIds[0])).toBe(false);
  });

  it('userid 带非法字符时拒绝写入（映射表不接受注入面）', async () => {
    const res = await api('PUT', '/bindings', superToken, { items: [{ wecomUserId: "a' OR 1=1--", employeeId: null }] });
    expect(res.status).toBe(400);
    expect(listWeComBindings()).toEqual([]);
  });

  it('凭据没配齐时预览报 400，同步不返回空跑 jobId', async () => {
    setWeComConfig({ ...defaultWeComConfig(), baseUrl: stubOrigin });
    expect((await api('POST', '/preview', superToken, {})).status).toBe(400);
    expect((await api('POST', '/sync', superToken, {})).status).toBe(400);
  });

  it('同步任务走 202 + jobId 轮询，进度里能看到新增条数', async () => {
    const at = Math.floor(Date.now() / 1000) - 3600;
    resetStub([punchRowOf(userIds[0], at)]);
    upsertWeComBinding({ wecomUserId: userIds[0], employeeId: empA.id, operator: 'wecom-super' });
    const started = await api('POST', '/sync', superToken, {
      dateFrom: formatPunchTime(at - 60)!.date,
      dateTo: formatPunchTime(at + 600)!.date,
    });
    expect(started.status).toBe(202);
    const jobId = (started.json as { jobId: string }).jobId;
    let job = (await api('GET', `/sync/jobs/${jobId}`, superToken)).json as { status: string; created: number };
    for (let i = 0; i < 40 && job.status === 'running'; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await api('GET', `/sync/jobs/${jobId}`, superToken)).json as { status: string; created: number };
    }
    expect(job.status).toBe('done');
    expect(job.created).toBe(1);
    expect(punchCount()).toBe(1);
    // 别人的任务不能看：HR 连路径都进不来（403），换个管理员可以
    expect((await api('GET', `/sync/jobs/${jobId}`, hrToken)).status).toBe(403);
  });
});
