#!/bin/sh
# ECS 裸机单进程的更新入口（在服务器上以 root 执行：`sh /opt/ams/deploy/ecs-deploy.sh`）。
# 没有这个脚本之前，上线是靠人手工敲一串命令的 —— 那串命令里就出过一次构建模式错误。
#
# 下面四条约束都是这台机器实测出来的，改动前请先读完：
#   1) 部署只认 CI 已验证的 commit：verify + e2e 两个 job 不是 success 就直接中止。
#      紧急救火可 `ALLOW_UNVERIFIED=1` 越过，但会在日志里留下显式警告。
#   2) github 的 git-over-HTTPS 在这台机器上会被中间设备 RST（`curl 56 Recv failure` /
#      `early EOF`），**必须 --depth=1**；`curl -I codeload.github.com` 返回 200 不代表能 clone。
#   3) 800 MB 内存的机器上 V8 把堆上限压到约 400 MB，vite build 会在 15 秒处 OOM 自杀。
#      这是 V8 的硬闸门，加 swap 治不了，**必须显式 --max-old-space-size=1024**。
#   4) `npm ci` 要 NODE_ENV=development（否则 npm v9+ 自行推导 --omit=dev，vite 装不上），
#      但 `npm run build` **必须 NODE_ENV=production** —— 两者的 env 逐条命令分开写，
#      绝不能在脚本顶部 export。产物是不是生产构建由 assert-prod-build.mjs 把关。
set -eu

APP="${APP:-/opt/ams}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-ams}"
PORT="${PORT:-3000}"

cd "$APP"
echo "[deploy] 当前 HEAD: $(git log -1 --format='%h %ci')"

git fetch --depth=1 origin "$BRANCH"
TARGET=$(git rev-parse FETCH_HEAD)
echo "[deploy] 目标 commit: $(git log -1 --format='%h %ci' "$TARGET")"

# ---- 闸门一：这个 commit 过 CI 了吗 ----
REPO=$(git config --get remote.origin.url | sed -E 's#.*github\.com[:/]##; s#\.git$##')
if [ "${ALLOW_UNVERIFIED:-0}" = "1" ]; then
  echo "[deploy] !!! ALLOW_UNVERIFIED=1 —— 跳过 CI 闸门，正在部署未经 verify/e2e 确认的 commit"
elif [ -z "$REPO" ]; then
  echo "[deploy] 认不出 origin 的 owner/repo，无法查 CI —— 拒绝部署（可用 ALLOW_UNVERIFIED=1 显式越过）"
  exit 1
else
  node deploy/ci-gate.mjs "$REPO" "$TARGET"
fi

git reset --hard "$TARGET"

# ---- 装依赖与构建：NODE_ENV 必须逐条命令给，见文件头第 4 条 ----
NODE_ENV=development npm ci --include=dev --legacy-peer-deps --no-audit --no-fund
NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024 npm run build

# ---- 闸门二：产物确实是生产构建 ----
node deploy/assert-prod-build.mjs "$APP/dist"

systemctl restart "$SERVICE"
sleep 8

if ! systemctl is-active --quiet "$SERVICE"; then
  echo "[deploy] 服务没能起来，最后 20 行日志："
  journalctl -u "$SERVICE" -n 20 --no-pager
  exit 1
fi

curl -fsS --max-time 10 "http://127.0.0.1:$PORT/api/health"
echo
echo "[deploy] 线上引用产物: $(curl -s --max-time 10 "http://127.0.0.1:$PORT/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)"
echo "[deploy] 完成：$(git log -1 --format='%h') 已上线"
