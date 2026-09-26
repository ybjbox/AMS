/**
 * P1-9 保存失败兜底 回归测试。
 *
 * 目的：锁定前端「保存失败提示」所依赖的后端契约 ——
 *   部门/职位整树 PUT 在校验失败时必须返回非 2xx，且响应体带 `error` 字段（字符串）。
 *   这正是 useDepartmentStore 里 describeSaveError 读取并展示给用户的文案。
 *   若后端将来把错误体从 { error } 改成 { message } 或返回 200+内部错误，
 *   本脚本会立刻告警，避免前端静默回退到「保存失败，请稍后重试」。
 *
 * 运行：node scripts/verify-save-failure.mjs（也包含在 npm run test:server 里）
 * 自起临时 DATA_DIR + 随机端口的私有实例，不依赖 :3000 也不碰开发库。
 */
import { bootServer, summarize } from "./lib/liveServer.mjs";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name + (extra ? ` -> ${extra}` : ""));
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function main() {
  const { port, req, stop } = await bootServer({ tag: "savefail" });
  void port;
  try {
    console.log("\n=== 1. 部门整树 PUT 校验失败必须返回非 2xx + error 字段 ===");
    {
      const r = await req("PUT", "/api/departments/tree", {});
      ok("缺 departments 字段 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串（前端展示文案来源）", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
      ok("error 文案为 'departments array is required'", r.body.error === "departments array is required", JSON.stringify(r.body));
    }
    {
      const r = await req("PUT", "/api/departments/tree", { departments: "not-an-array" });
      ok("departments 非数组 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
    }

    console.log("\n=== 2. 职位整表 PUT 校验失败必须返回非 2xx + error 字段 ===");
    {
      const r = await req("PUT", "/api/departments/roles", {});
      ok("缺 roles 字段 → 400", r.status === 400, `-> ${r.status}`);
      ok("错误体含 error 字符串", typeof r.body.error === "string" && r.body.error.length > 0, JSON.stringify(r.body));
      ok("error 文案为 'roles array is required'", r.body.error === "roles array is required", JSON.stringify(r.body));
    }

    console.log("\n=== 3. 成功路径仍可用（不破坏正常保存） ===");
    {
      const g = await req("GET", "/api/departments");
      ok("GET /departments → 200", g.status === 200, `-> ${g.status}`);
      ok("返回 departments 数组", Array.isArray(g.body?.departments), JSON.stringify(g.body).slice(0, 80));
    }
  } finally {
    await stop();
  }

  process.exit(summarize({ pass, fail, failures }));
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
