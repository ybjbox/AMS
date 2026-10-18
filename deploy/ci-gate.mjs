#!/usr/bin/env node
/**
 * 部署前的 CI 闸门：确认 GitHub Actions 对**这个 commit** 的 `verify` 与 `e2e` 两个 job
 * 都已 completed/success，否则拒绝上线。
 *
 * 为什么需要它：CI 的六道闸门测的是"代码能不能上线"，而部署脚本此前完全不看它 ——
 * 2026-10-18 那次 dev 模式产物上线，CI 帮不上忙，但"部署不等 CI"这件事本身是真实缺口。
 *
 * 用 `/commits/{sha}/check-runs` 而不是 `/actions/runs`：后者的 `name` 是 workflow 名，
 * 拿不到 job 级结论。仓库是公开的，匿名请求即可 —— 服务器上不必存任何 token。
 *
 * 用法：node deploy/ci-gate.mjs <owner/repo> <sha>
 * 退出码 0 = 放行；非 0 = 拒绝（含"查不到/查不动"，一律按不放行处理）。
 */
const [repo, sha] = process.argv.slice(2);
if (!repo || !sha) {
  console.error("用法: node deploy/ci-gate.mjs <owner/repo> <sha>");
  process.exit(2);
}

const REQUIRED = ["verify", "e2e"];

let runs;
try {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ams-deploy" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error(`ci-gate: API 返回 HTTP ${res.status}，无法判定 —— 按不放行处理`);
    process.exit(1);
  }
  runs = (await res.json()).check_runs ?? [];
} catch (e) {
  console.error(`ci-gate: 查询失败（${e instanceof Error ? e.message : e}）—— 按不放行处理`);
  process.exit(1);
}

let ok = true;
for (const job of REQUIRED) {
  const hit = runs.find((r) => r.name === job);
  if (!hit) {
    console.log(`  ✗ ${job}: 这个 commit 上没有该 job 的运行记录`);
    ok = false;
  } else if (hit.status !== "completed") {
    console.log(`  ✗ ${job}: 仍在 ${hit.status}，未完成`);
    ok = false;
  } else if (hit.conclusion !== "success") {
    console.log(`  ✗ ${job}: ${hit.conclusion}`);
    ok = false;
  } else {
    console.log(`  ✓ ${job}: success`);
  }
}

if (!ok) {
  console.log(`ci-gate: commit ${sha.slice(0, 7)} 未通过 CI，拒绝部署`);
  process.exit(1);
}
console.log(`ci-gate: commit ${sha.slice(0, 7)} 已通过 verify + e2e，放行`);
