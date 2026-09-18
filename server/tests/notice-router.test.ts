/**
 * #19 微信通知生成器：router 级 E2E（自起临时 express + mock 模型服务）。
 * 不走 authGate（会话中间件），用注入 req.auth 的小中间件模拟角色。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const mockConfig = {
  enabled: true,
  allowNonAdmin: true,
  useDataDefault: false,
  baseUrl: "",
  model: "mock-model",
  apiKey: "sk-mock",
  systemPrompt: "",
  assistantName: "",
  assistantIcon: "",
  assistantLogo: "",
  assistantDraggable: false,
  conversationRetentionDays: 0,
};

vi.mock('../aiConfigDb.ts', () => ({
  getAiConfig: () => mockConfig,
}));

const { noticeRouter } = await import('../wechatNoticeRouter.ts');

let app: express.Express;
let mockLlm: express.Express;
let apiServer: Server;
let llmServer: Server;
let base = "";

beforeAll(async () => {
  // mock OpenAI 兼容服务：echo 最后一条 user 消息前 20 字
  mockLlm = express();
  mockLlm.post("/v1/chat/completions", express.json(), (req, res) => {
    const msgs = (req.body?.messages ?? []) as Array<{ role: string; content: string }>;
    const sys = msgs.find((m) => m.role === "system")?.content ?? "";
    const user = msgs.find((m) => m.role === "user")?.content ?? "";
    res.json({
      choices: [
        { message: { content: `NOTICE[${sys.includes("微信") ? "wx" : "?"}]::${user}` } },
      ],
    });
  });
  llmServer = await new Promise<Server>((r) => {
    const s = mockLlm.listen(0, "127.0.0.1", () => r(s));
  });
  const llmPort = (llmServer.address() as AddressInfo).port;
  mockConfig.baseUrl = `http://127.0.0.1:${llmPort}/v1`;

  app = express();
  app.use((req, _res, next) => {
    (req as { auth?: { systemRole: string } }).auth = {
      systemRole: (req.header("x-mock-role") ?? "EMPLOYEE") as string,
    };
    next();
  });
  app.use("/api/notice", noticeRouter);
  apiServer = await new Promise<Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const port = (apiServer.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}/api/notice`;
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => llmServer.close(() => r()));
});

describe('POST /generate', () => {
  it('正常生成：返回 notice + sourceChars，并带系统提示词请求模型', async () => {
    const r = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "9月20日14:00消防演练", instruction: "简短" }),
    });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { notice: string; sourceChars: number };
    expect(j.notice).toContain("NOTICE[wx]");
    expect(j.notice).toContain("补充要求：简短");
    expect(j.sourceChars).toBe("9月20日14:00消防演练".length);
  });

  it('空 source → 400；超长 source → 400', async () => {
    const empty = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "  " }),
    });
    expect(empty.status).toBe(400);
    const big = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "字".repeat(20_001) }),
    });
    expect(big.status).toBe(400);
  });

  it('AI 关闭 → 400；allowNonAdmin=false 时员工 403 / 管理员放行', async () => {
    mockConfig.enabled = false;
    const off = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "x" }),
    });
    expect(off.status).toBe(400);
    mockConfig.enabled = true;

    mockConfig.allowNonAdmin = false;
    const emp = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mock-role": "EMPLOYEE" },
      body: JSON.stringify({ source: "x" }),
    });
    expect(emp.status).toBe(403);
    const admin = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mock-role": "ADMIN" },
      body: JSON.stringify({ source: "开会通知" }),
    });
    expect(admin.status).toBe(200);
    mockConfig.allowNonAdmin = true;
  });

  it('无 apiKey → 400 提示去设置里配置', async () => {
    mockConfig.apiKey = "";
    const r = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "x" }),
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("API Key");
    mockConfig.apiKey = "sk-mock";
  });
});

describe('POST /extract', () => {
  it('txt raw 字节体 → 文本；不支持类型 → 400', async () => {
    const ok = await fetch(`${base}/extract?filename=a.txt`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from("会议改到周五", "utf-8"),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { text: string }).text).toBe("会议改到周五");

    const bad = await fetch(`${base}/extract?filename=a.zip`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from("PK"),
    });
    expect(bad.status).toBe(400);
  });
});
