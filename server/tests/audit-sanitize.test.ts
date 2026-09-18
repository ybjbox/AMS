/**
 * 审计脱敏回归测试（第二梯队 #11）：
 *  1. sanitize / writeAuditLog 对 apiKey / api_key / clientSecret 一律丢弃为占位符
 *     （此前 SECRET_KEYS 缺这几个键，PATCH /api/ai/config 把 LLM 密钥明文写进了 afterJson）；
 *  2. v7 清洗迁移把存量 beforeJson/afterJson 里的密钥值替换为 [已脱敏]，且幂等。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test，与开发库完全隔离。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../db.ts";
import { runMigrations, cleanseAuditSecrets } from "../migrate.ts";
import { sanitize, writeAuditLog } from "../auditDb.ts";

const MARKER = "audit-sanitize-it";
const PLAINTEXT = "sk-TEST-PLAINTEXT-0123456789";

beforeAll(() => {
  runMigrations();
  db.prepare("DELETE FROM audit_logs WHERE action = ?").run(MARKER);
});

describe("sanitize：密钥字段不落库", () => {
  it("apiKey / api_key / clientSecret 全部替换为占位符", () => {
    const out = sanitize({
      apiKey: PLAINTEXT,
      api_key: PLAINTEXT,
      clientSecret: PLAINTEXT,
      model: "gpt-4o",
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[已脱敏]");
    expect(out.api_key).toBe("[已脱敏]");
    expect(out.clientSecret).toBe("[已脱敏]");
    expect(out.model).toBe("gpt-4o"); // 非密钥字段保持可读
  });
});

describe("writeAuditLog：落库路径同样脱敏", () => {
  it("PATCH ai/config 式请求体进 afterJson 后不含明文密钥", () => {
    writeAuditLog({
      actor: MARKER,
      action: MARKER,
      method: "PATCH",
      path: "/api/ai/config",
      status: 200,
      after: { apiKey: PLAINTEXT, baseUrl: "https://api.example.com", model: "x" },
    });
    const row = db
      .prepare("SELECT afterJson, changesJson FROM audit_logs WHERE action = ?")
      .get(MARKER) as { afterJson: string; changesJson: string | null };
    expect(row.afterJson).not.toContain(PLAINTEXT);
    expect(row.afterJson).toContain("[已脱敏]");
    expect(row.afterJson).toContain("api.example.com");
  });
});

describe("v7 存量清洗：cleanseAuditSecrets", () => {
  it("把泄露的明文密钥值替换为占位符，其他内容不动，重复执行幂等", () => {
    db.prepare(
      `INSERT INTO audit_logs (actor, action, method, path, status, beforeJson, afterJson)
       VALUES (?, ?, 'PATCH', '/api/ai/config', 200, ?, ?)`
    ).run(
      MARKER,
      `${MARKER}-cleanse`,
      JSON.stringify({ apiKey: PLAINTEXT }),
      JSON.stringify({ apiKey: PLAINTEXT, model: "gpt-4o", baseUrl: "https://x.example" })
    );

    cleanseAuditSecrets();
    const read = () =>
      db
        .prepare("SELECT beforeJson, afterJson FROM audit_logs WHERE action = ?")
        .get(`${MARKER}-cleanse`) as { beforeJson: string; afterJson: string };

    let row = read();
    expect(row.beforeJson).not.toContain(PLAINTEXT);
    expect(row.afterJson).not.toContain(PLAINTEXT);
    expect(row.afterJson).toContain('"apiKey":"[已脱敏]"');
    expect(row.afterJson).toContain("gpt-4o"); // 非密钥字段保留
    expect(row.afterJson).toContain("https://x.example");

    cleanseAuditSecrets(); // 幂等
    row = read();
    expect(row.afterJson).toContain('"apiKey":"[已脱敏]"');

    db.prepare("DELETE FROM audit_logs WHERE action = ?").run(`${MARKER}-cleanse`);
  });
});
