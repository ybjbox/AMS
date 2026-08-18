/**
 * P3-1 回归：集中式错误处理中间件。
 * 自包含：建临时 DATA_DIR + seed admin → 自起 server（开启 AMS_DEV_ERROR_ROUTE=1）
 * → 验证「同步 throw → errorHandler → JSON 500（而非 HTML 错误页）」，且正常/404 路径不受影响。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ams-err-"));
process.env.PORT = String(3200 + Math.floor(Math.random() * 800));
process.env.NODE_ENV = "production";
process.env.AMS_ADMIN_PASSWORD = "AdminPass123";
process.env.AMS_DEV_ERROR_ROUTE = "1"; // 开启 /api/_dev_error 测试路由
const ADMIN_PW = "AdminPass123";

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const DATA_DIR = process.env.DATA_DIR;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
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

async function getText(p: string, token?: string): Promise<{ status: number; text: string; isJson: boolean }> {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { headers: h });
  const text = await res.text();
  let isJson = false;
  try {
    JSON.parse(text);
    isJson = true;
  } catch {}
  return { status: res.status, text, isJson };
}

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const j = (await r.json()) as any;
  if (j.user?.mustChangePassword) {
    await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${j.token}` },
      body: JSON.stringify({ currentPassword: password, newPassword: password + "x" }),
    });
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: password + "x" }),
    });
    return (await r2.json()).token;
  }
  return j.token;
}

async function main() {
  const migrate = await import("../server/migrate.ts");
  migrate.runMigrations();

  const server = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write("[srv] " + d));

  const healthy = await waitForHealth();
  ok("服务启动并健康检查通过", healthy);
  if (!healthy) {
    server.kill("SIGKILL");
    throw new Error("server did not start");
  }

  try {
    const adminToken = await login("admin", ADMIN_PW);
    ok("admin 登录成功（用于触达错误路由）", !!adminToken);

    // --- 核心：未捕获的同步 throw 必须返回 JSON 500，不能是 HTML 错误页 ---
    const r = await getText("/api/_dev_error", adminToken);
    ok("错误路由返回 500", r.status === 500, `-> ${r.status}`);
    ok("错误响应是 JSON（非 HTML）", r.isJson);
    ok("错误响应体含 error 字段", /"error"/.test(r.text), `-> ${r.text.slice(0, 120)}`);
    ok("错误响应不含 HTML 错误页标记", !/<!DOCTYPE|<html/i.test(r.text), `-> ${r.text.slice(0, 80)}`);

    // --- 反向确认：正常与 404 路径不受影响 ---
    const health = await getText("/api/health");
    ok("健康检查仍为 200 JSON", health.status === 200 && health.isJson);

    // 未知 API 路径应返回 404 JSON（来自 /api 兜底，而非 SPA HTML）
    const missing = await getText("/api/does-not-exist", adminToken);
    ok("未知 API 路由返回 404 JSON（非 SPA HTML）", missing.status === 404 && missing.isJson, `-> ${missing.status}`);
    ok("未知 API 404 不含 HTML 标记", !/<!DOCTYPE|<html/i.test(missing.text));
  } finally {
    server.kill("SIGKILL");
  }
}

main()
  .catch((e) => {
    console.error("脚本异常：", e);
    fail++;
  })
  .finally(() => {
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {}
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail > 0) {
      console.log("失败项：\n - " + fails.join("\n - "));
      process.exit(1);
    }
    process.exit(0);
  });
