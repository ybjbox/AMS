/**
 * 业务单润色 router 级测试：证明 /api/form/polish 走的是与微信通知一致的
 * 准入 + 额度边界（aiGate）。配置与用量均被 mock，不触碰真实 DB。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const mockConfig = {
  enabled: true,
  allowNonAdmin: true,
  useDataDefault: false,
  baseUrl: '',
  model: 'mock-model',
  apiKey: 'sk-mock',
  systemPrompt: '',
  assistantName: '',
  assistantIcon: '',
  assistantLogo: '',
  assistantDraggable: false,
  conversationRetentionDays: 0,
  dailyQuota: 0,
  adminDailyQuota: 0,
  allowPersonalModel: true,
};

let mockUsage = 0;

vi.mock('../aiConfigDb.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../aiConfigDb.ts')>();
  return { ...actual, getAiConfig: () => mockConfig };
});

vi.mock('../aiUserDb.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../aiUserDb.ts')>();
  return {
    ...actual,
    getUserAiConfig: () => null, // 一律视为未配置个人模型，走系统档
    getUsageToday: () => mockUsage,
    incrementUsage: () => {
      mockUsage += 1;
    },
  };
});

const { businessFormRouter } = await import('../businessFormRouter.ts');

let apiServer: Server;
let llmServer: Server;
let base = '';

const DRAFT = '根据集团规章制度规定，员工结婚可申领贺喜红包，行政部门员工张三，本人已登记结婚，特为其申请结婚贺喜红包：人民币888元（捌佰捌拾捌元整）。';

beforeAll(async () => {
  const mockLlm = express();
  mockLlm.post('/v1/chat/completions', express.json(), (req, res) => {
    const msgs = (req.body?.messages ?? []) as Array<{ role: string; content: unknown }>;
    const sys = String(msgs.find((m) => m.role === 'system')?.content ?? '');
    const user = String(msgs.find((m) => m.role === 'user')?.content ?? '');
    res.json({
      choices: [{ message: { content: `POLISH[${sys.includes('业务单') ? 'form' : '?'}]::${user}` } }],
    });
  });
  llmServer = await new Promise<Server>((r) => {
    const s = mockLlm.listen(0, '127.0.0.1', () => r(s));
  });
  mockConfig.baseUrl = `http://127.0.0.1:${(llmServer.address() as AddressInfo).port}/v1`;

  const app = express();
  app.use((req, _res, next) => {
    (req as { auth?: unknown }).auth = {
      username: req.header('x-mock-user') ?? 'tester',
      systemRole: req.header('x-mock-role') ?? 'EMPLOYEE',
    };
    next();
  });
  app.use('/api/form', businessFormRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/form`;
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => llmServer.close(() => r()));
});

function polish(body: unknown, role = 'EMPLOYEE') {
  return fetch(`${base}/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mock-role': role, 'x-mock-user': `form-${role}` },
    body: JSON.stringify(body),
  });
}

describe('POST /polish', () => {
  it('正常润色：返回 text + sourceChars，系统提示词要求不得改动金额', async () => {
    const r = await polish({ text: DRAFT });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { text: string; sourceChars: number };
    expect(j.text).toContain('POLISH[form]');
    expect(j.text).toContain('正文草稿：');
    expect(j.text).toContain('人民币888元');
    expect(j.sourceChars).toBe(DRAFT.length);
  });

  it('空白正文 → 400；超长正文 → 400（不消耗额度）', async () => {
    mockUsage = 0;
    const empty = await polish({ text: '   ' });
    expect(empty.status).toBe(400);
    const big = await polish({ text: '字'.repeat(4001) });
    expect(big.status).toBe(400);
    expect(((await big.json()) as { error: string }).error).toContain('4000');
    expect(mockUsage).toBe(0);
  });

  it('AI 关闭 → 400；allowNonAdmin=false 时员工 403 / 管理员 200', async () => {
    mockConfig.enabled = false;
    expect((await polish({ text: DRAFT })).status).toBe(400);
    mockConfig.enabled = true;

    mockConfig.allowNonAdmin = false;
    expect((await polish({ text: DRAFT })).status).toBe(403);
    expect((await polish({ text: DRAFT }, 'ADMIN')).status).toBe(200);
    mockConfig.allowNonAdmin = true;
  });

  it('未配置系统 API Key → 400 提示去设置里配置', async () => {
    mockConfig.apiKey = '';
    const r = await polish({ text: DRAFT });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('API Key');
    mockConfig.apiKey = 'sk-mock';
  });

  it('额度按角色档位生效：员工档用尽 → 429，管理档仍可继续；不限额档位只计数', async () => {
    mockConfig.dailyQuota = 1;
    mockConfig.adminDailyQuota = 5;
    mockUsage = 1; // 当日已用 1 次
    const over = await polish({ text: DRAFT });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: string }).error).toContain('额度已用尽');

    mockUsage = 4;
    expect((await polish({ text: DRAFT }, 'ADMIN')).status).toBe(200);
    expect(mockUsage).toBe(5);

    mockConfig.dailyQuota = 0; // 0 = 不限
    mockUsage = 999;
    expect((await polish({ text: DRAFT })).status).toBe(200);
    expect(mockUsage).toBe(1000);

    mockConfig.dailyQuota = 0;
    mockConfig.adminDailyQuota = 0;
    mockUsage = 0;
  });
});
