#!/usr/bin/env node
/**
 * 服务端验证脚本统一 runner（npm run test:server）。
 *
 * 只收录「自包含」脚本：自己建临时 DATA_DIR、直连数据层，或自起随机端口的私有实例——
 * 可在无 dev server、无真实凭据的环境（CI）直接运行，且不碰开发库。
 * 若脚本要依赖 :3000 活服务或 data/ADMIN_CREDENTIALS.txt，先改造成自包含再登记。
 */
import { spawnSync } from "node:child_process";

const CASES = [
  // ---- 直连数据层（tsx 直接执行，断言事务/索引/迁移/分页等）----
  "scripts/verify-backup.ts",
  "scripts/verify-cascade-tx.ts",
  "scripts/verify-theme-persist.ts",
  "scripts/verify-indexes.ts",
  "scripts/verify-fresh-migrate.ts",
  "scripts/verify-pagination.ts",
  "scripts/verify-save-failure-core.ts",
  "scripts/verify-uploads-cleanup.ts",
  // ---- 自起临时服务的 HTTP e2e ----
  "scripts/verify-upload-stream.mjs",
  "scripts/verify-todos.ts",
  "scripts/verify-validation.ts",
  "scripts/verify-error-handler.ts",
  "scripts/verify-prod-deps.mjs",
  "scripts/verify-auth.mjs",
  "scripts/verify-audit.mjs",
  "scripts/verify-fk.mjs",
  "scripts/verify-concurrency.mjs",
  "scripts/verify-save-failure.mjs",
  "scripts/verify-export-sandbox.mjs",
];

const results = [];
let failed = 0;

for (const file of CASES) {
  process.stdout.write(`\n===== 运行 ${file} =====\n`);
  const res = spawnSync("npx", ["tsx", file], { stdio: "inherit", shell: process.platform === "win32" });
  const ok = res.status === 0;
  if (!ok) failed++;
  results.push({ file, ok });
}

console.log("\n===== 汇总 =====");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.file}`);
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed > 0 ? 1 : 0);
