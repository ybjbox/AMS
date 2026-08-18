/**
 * P1-9 保存失败兜底 回归测试。
 *
 * 前置：先启动开发服务 `npm run dev`（监听 3000）。
 * 运行：`npm run test:save-failure`
 *
 * 目的：锁定前端「保存失败提示」所依赖的后端契约 ——
 *   部门/职位整树 PUT 在校验失败时必须返回非 2xx，且响应体带 `error` 字段（字符串）。
 *   这正是 useDepartmentStore 里 describeSaveError 读取并展示给用户的文案。
 *   若后端将来把错误体从 { error } 改成 { message } 或返回 200+内部错误，
 *   本脚本会立刻告警，避免前端静默回退到「保存失败，请稍后重试」。
 *
 * 说明：P0-2 之后所有 /api 接口都要求登录鉴权，本脚本会自动用
 *       data/ADMIN_CREDENTIALS.txt 里的初始管理员口令登录，
 *       若账号处于「首次登录必须改密」状态则先改一次密，结束前再改回原口令，
 *       保证测试对开发库无副作用、凭据文件始终有效。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
let TOKEN = "";
let pass = 0;
let fail = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

function readAdminPassword() {
  const file = path.join(process.cwd(), "data", "ADMIN_CREDENTIALS.txt");
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, "utf8");
    const m = /^密码:\s*(.+)$/m.exec(txt);
    if (m) return m[1].trim();
  }
  if (process.env.AMS_ADMIN_PASSWORD) return process.env.AMS_ADMIN_PASSWORD;
  throw new Error("无法获取管理员密码：请设置 AMS_ADMIN_PASSWORD 或确保 data/ADMIN_CREDENTIALS.txt 存在");
}

function genPassword() {
  return `Ams${crypto.randomBytes(10).toString("base64url").replace(/[-_]/g, "x")}9`;
}

async function loginAdmin() {
  const originalPassword = readAdminPassword();
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: originalPassword }),
  });
  if (!res.ok) throw new Error(`登录失败 HTTP ${res.status}`);
  const body = await res.json();
  let token = body.token;
  let currentPassword = originalPassword;
  let changed = false;

  if (body.user?.mustChangePassword) {
    const newPassword = genPassword();
    const cp = await fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!cp.ok) throw new Error(`强制改密失败 HTTP ${cp.status}`);
    token = (await cp.json()).token;
    currentPassword = newPassword;
    changed = true;
  }
  return { token, currentPassword, originalPassword, changed };
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
}

async function putTree(body) {
  const res = await fetch(`${BASE}/api/departments/tree`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function putRoles(body) {
  const res = await fetch(`${BASE}/api/departments/roles`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  const { token, currentPassword, originalPassword, changed } = await loginAdmin();
  TOKEN = token;
  console.log("  [auth] 已用管理员账号登录并获得会话 token" + (changed ? "（已通过首次改密）" : ""));

  try {
    console.log("\n=== 1. 部门整树 PUT 校验失败必须返回非 2xx + error 字段 ===");
    {
      const r = await putTree({});
      ok("缺 departments 字段 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串（前端展示文案来源）", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
      ok("error 文案为 'departments array is required'", r.body.error === "departments array is required", JSON.stringify(r.body));
    }
    {
      const r = await putTree({ departments: "not-an-array" });
      ok("departments 非数组 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
    }

    console.log("\n=== 2. 职位整表 PUT 校验失败必须返回非 2xx + error 字段 ===");
    {
      const r = await putRoles({});
      ok("缺 roles 字段 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
      ok("error 文案为 'roles array is required'", r.body.error === "roles array is required", JSON.stringify(r.body));
    }

    console.log("\n=== 3. 成功路径仍可用（不破坏正常保存） ===");
    {
      // GET 仅读，验证端点可达、鉴权正常
      const g = await fetch(`${BASE}/api/departments`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      ok("GET /departments → 200", g.status === 200, `-> ${g.status}`);
      const data = await g.json();
      ok("返回 departments 数组", Array.isArray(data.departments), JSON.stringify(data).slice(0, 80));
    }

    console.log(`\n========== ${pass} passed / ${fail} failed ==========\n`);
  } finally {
    if (changed && currentPassword !== originalPassword) {
      try {
        await fetch(`${BASE}/api/auth/accounts/admin/reset-password`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ newPassword: originalPassword }),
        });
        console.log("  [auth] 已把管理员口令与首次改密标记恢复为种子态");
      } catch (e) {
        console.warn("  [auth] 恢复口令失败（不影响测试结果）:", e.message);
      }
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
