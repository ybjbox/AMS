/**
 * POST /api/ai/test（连接可用性检测）：router 级单测。
 * 出站 fetch 全部 stub，不发真实网络请求；SSRF 守卫按现行政策断言（内网地址 → 400）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { aiRouter } = await import('../aiRouter.ts');

// router 内部走 global fetch（会被 stub），测试客户端固定用真实 fetch
const realFetch = globalThis.fetch;

let app: express.Express;
let apiServer: Server;
let base = '';

async function start(role: string): Promise<string> {
  app = express();
  app.use((req, _res, next) => {
    (req as { auth?: { systemRole: string } }).auth = {
      systemRole: (req.header('x-mock-role') ?? role) as string,
    };
    next();
  });
  app.use('/api/ai', aiRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  base = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api/ai`;
  return base;
}

async function stop() {
  await new Promise<void>((r) => apiServer.close(() => r()));
}

const DRAFT = {
  // 用 TEST-NET-3 的文档地址（203.0.113.0/24，永不路由到真机）：字面量 IP 不需要 DNS，
  // 断言因此与本机是否有代理/解析器无关；fetch 本来就被测试打桩接管。
  baseUrl: 'http://203.0.113.7/v1',
  apiKey: 'sk-draft',
  model: 'some-model',
};

async function callTest(body: unknown, role = 'SUPER_ADMIN') {
  await start(role);
  try {
    return await realFetch(`${base}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally {
    await stop();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ai/test', () => {
  it('非超级管理员 → 403', async () => {
    const r = await callTest(DRAFT, 'EMPLOYEE');
    expect(r.status).toBe(403);
  });

  it('连接成功：返回 ok + latencyMs + 模型回复', async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      expect(String(url)).toBe('http://203.0.113.7/v1/chat/completions');
      expect(init?.headers?.Authorization).toBe('Bearer sk-draft');
      expect(JSON.parse(init!.body!).model).toBe('some-model');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '正常' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await callTest(DRAFT);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; latencyMs?: number; reply?: string };
    expect(j.ok).toBe(true);
    expect(j.latencyMs).toBeGreaterThanOrEqual(0);
    expect(j.reply).toBe('正常');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('服务商 401 → ok:false 且提示 API Key 无效', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('unauthorized', { status: 401 })
    );
    const r = await callTest(DRAFT);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; error?: string };
    expect(j.ok).toBe(false);
    expect(j.error).toContain('API Key 无效或无权限');
  });

  it('网络不可达（fetch 抛错）→ ok:false 且提示无法连接', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    const r = await callTest(DRAFT);
    const j = (await r.json()) as { ok: boolean; error?: string };
    expect(j.ok).toBe(false);
    expect(j.error).toContain('无法连接服务商');
  });

  it('SSRF 守卫维持现状：内网地址 → 400', async () => {
    const r = await callTest({ ...DRAFT, baseUrl: 'http://10.0.0.2:46351/v1' });
    expect(r.status).toBe(400);
    const j = (await r.json()) as { error?: string };
    expect(j.error).toContain('不允许访问内网地址');
  });
});
