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
  // 0 = 不限：既有路由用例不触发额度计数，档位逻辑单独在 ai-quota-tiers 测
  dailyQuota: 0,
  adminDailyQuota: 0,
  allowPersonalModel: true,
};

vi.mock('../aiConfigDb.ts', async (importOriginal) => {
  // 保留真实的 quotaLimitForRole（纯函数），只把配置读取换成 mockConfig
  const actual = await importOriginal<typeof import('../aiConfigDb.ts')>();
  return { ...actual, getAiConfig: () => mockConfig };
});

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
    const msgs = (req.body?.messages ?? []) as Array<{ role: string; content: unknown }>;
    const sys = String(msgs.find((m) => m.role === "system")?.content ?? "");
    const userRaw = msgs.find((m) => m.role === "user")?.content ?? "";
    const user = typeof userRaw === "string" ? userRaw : JSON.stringify(userRaw);
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

  it('套打模板：【通知】首行 + 抬头 + 缩进正文 + 右对齐落款/中文日期', async () => {
    const r = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "现下发《关于冯世钦等任职调整的通知》，请各单位知悉。",
        greeting: "各部门、所属公司：",
        signature: "群邦集团办公室",
        date: "2026-09-14",
      }),
    });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { notice: string };
    const lines = j.notice.split("\n");
    expect(lines[0]).toBe("【通知】");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("各部门、所属公司：");
    // 正文段统一 8 空格缩进（模型 echo 的每行都算一段）
    const bodyLines = lines.slice(3).filter((l) => l.trim() && !/^\s*$/.test(l));
    expect(bodyLines.some((l) => l.startsWith("        "))).toBe(true);
    // 落款与日期右对齐（前导空格补齐）+ 中文日期格式
    const tail = lines.slice(-2);
    expect(tail[0].trim()).toBe("群邦集团办公室");
    expect(tail[0].startsWith(" ")).toBe(true);
    expect(tail[1].trim()).toBe("2026年9月14日");
    // 模型收到的用户消息带格式说明，避免其重复生成抬头/落款
    expect(j.notice).toContain("格式说明");
  });

  it('详细程度档位：注入「详细程度」要求，非法值回退标准', async () => {
    const brief = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "9月20日开会", detail: "brief" }),
    });
    const bj = (await brief.json()) as { notice: string };
    expect(bj.notice).toContain("详细程度：简洁");

    const bad = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "9月20日开会", detail: "<script>" }),
    });
    const gj = (await bad.json()) as { notice: string };
    expect(gj.notice).toContain("详细程度：标准");

    // 来源文件名透传：模型可见「来源文件名」行（供简洁档引用《文件标题》）
    const named = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "经集团公司研究决定：任某为某项目总经理。",
        detail: "brief",
        sourceName: "关于冯世钦等任职调整的通知.docx",
      }),
    });
    const nj = (await named.json()) as { notice: string };
    expect(nj.notice).toContain("来源文件名：关于冯世钦等任职调整的通知.docx");
    expect(nj.notice).toContain("必须引用文件名称");
  });

  it('落款右对齐基线封顶：长正文不把落款推到满屏空格后', async () => {
    const r = await fetch(`${base}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: `任甲为${"乙".repeat(200)}部门总经理`,
        signature: "群邦集团办公室",
        date: "2026-09-19",
      }),
    });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { notice: string };
    const tail = j.notice.split("\n").slice(-2);
    // 基线 36 列 − 「群邦集团办公室」显示宽 14 = 恰好 22 个前导空格
    expect(tail[0]).toBe(`${" ".repeat(22)}群邦集团办公室`);
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

describe('POST /extract（异步任务 + 轮询）', () => {
  /** 上传 → 202 jobId → 轮询至 done/error，返回最终快照 */
  async function extractAndWait(filename: string, bytes: Buffer): Promise<{ status: string; text?: string; chars?: number; error?: string; stage: string; percent: number }> {
    const r = await fetch(`${base}/extract?filename=${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    if (r.status !== 202) {
      const j = (await r.json()) as { error?: string };
      throw new Error(`HTTP ${r.status}: ${j.error ?? ""}`);
    }
    const { jobId } = (await r.json()) as { jobId: string };
    const deadline = Date.now() + 30_000;
    for (;;) {
      await new Promise((res) => setTimeout(res, 50));
      const p = await fetch(`${base}/extract/job/${encodeURIComponent(jobId)}`);
      expect(p.status).toBe(200);
      const j = (await p.json()) as { status: string; text?: string; chars?: number; error?: string; stage: string; percent: number };
      if (j.status === "done" || j.status === "error") return j;
      if (Date.now() > deadline) throw new Error("job 未在时限内完成");
    }
  }

  it('txt raw 字节体 → 任务完成回文本；不支持类型 → 同步 400；越权轮询 → 404', async () => {
    const done = await extractAndWait("a.txt", Buffer.from("会议改到周五", "utf-8"));
    expect(done.status).toBe("done");
    expect(done.text).toBe("会议改到周五");
    expect(done.percent).toBe(100);

    const bad = await fetch(`${base}/extract?filename=a.zip`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from("PK"),
    });
    expect(bad.status).toBe(400);

    const ghost = await fetch(`${base}/extract/job/nonexistent`);
    expect(ghost.status).toBe(404);
  });

  it('解析缓存：同一文件二次上传直接 200 cached；DELETE /extract/cache 后重新走任务', async () => {
    const bytes = Buffer.from(`缓存测试 ${Date.now()}`, "utf-8");
    const first = await extractAndWait("cache.txt", bytes);
    expect(first.status).toBe("done");

    const hit = await fetch(`${base}/extract?filename=cache.txt`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    expect(hit.status).toBe(200);
    const hj = (await hit.json()) as { text: string; chars: number; cached?: boolean };
    expect(hj.cached).toBe(true);
    expect(hj.text).toBe(bytes.toString("utf-8"));

    const del = await fetch(`${base}/extract/cache`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { cleared: number }).cleared).toBeGreaterThan(0);

    const miss = await extractAndWait("cache.txt", bytes);
    expect(miss.status).toBe("done");
    expect(miss.text).toBe(bytes.toString("utf-8"));
  });

  it('图片 → 视觉模型 OCR（image_url base64 内容透传）', async () => {
    const j = await extractAndWait("通知.png", Buffer.from("fake-png-bytes"));
    expect(j.status).toBe("done");
    // mock 回显 user 消息：应包含 data URL 与转录指令（JSON 数组多模态内容）
    expect(j.text).toContain("data:image/png;base64,");
    expect(j.text).toContain("转录");
    expect(j.chars).toBeGreaterThan(0);
  });

  it('扫描版 PDF（无文字层）→ 逐页渲染后走视觉模型 OCR', async () => {
    // 合法但只有空白页、无文字对象的 PDF：本地提取必然失败，触发回退链
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
    ];
    let pdfText = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((b, i) => {
      offsets.push(Buffer.byteLength(pdfText));
      pdfText += `${i + 1} 0 obj ${b} endobj\n`;
    });
    const xref = Buffer.byteLength(pdfText);
    pdfText +=
      `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") +
      `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const j = await extractAndWait("scan.pdf", Buffer.from(pdfText, "latin1"));
    expect(j.status).toBe("done");
    // 空白页渲染成 PNG 后交给视觉模型：回显应包含 image_url 与页码提示
    expect(j.text).toContain("data:image/png;base64,");
    expect(j.text).toContain("第 1/1 页");
  });
});
