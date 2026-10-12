#!/usr/bin/env bash
#
# AMS 自更新容器：拉代码 → 装依赖 → 构建 → 跑，全部在同一个容器里完成。
#
# 为什么不用"构建新镜像 + 换容器"那套：那需要一个能驱动宿主 Docker 守护进程的特权
# 容器（挂 docker.sock，等于在 NAS 上要 root）。这个应用只有一个进程、一份 SQLite，
# 用不着镜像级发布 —— 代价是每次更新要在容器里跑一次 npm ci + build（1~3 分钟）。
#
# 三条保底：
#  1. 拉不到 GitHub（本机访问 GitHub 时好时坏，NAS 同理）只是"这轮跳过"，服务继续跑旧版；
#  2. 新版本启动后健康检查不过 → 自动退回上一个 sha 并重新起；
#  3. 构建失败 → 连代码都不切（checkout 放在构建之前但失败即回退），进程不受影响。
set -uo pipefail

APP=/app
DATA="${DATA_DIR:-$APP/data}"
REPO_URL="${REPO_URL:-https://github.com/ybjbox/AMS.git}"
BRANCH="${BRANCH:-main}"
INTERVAL="${INTERVAL_SECONDS:-300}"
PORT_NO="${PORT:-3000}"
STATE="$APP/.deployed-sha"
LOGF="$DATA/deploy.log"
NODE_PID=""

# 公开仓库匿名拉取；绝不允许 git 弹口令提示把整个容器挂住
export GIT_TERMINAL_PROMPT=0

# 把 PID 1 的输出一分为二：面板的"容器日志"照旧，同时落到宿主目录里的 deploy.log。
# 为什么要这份文件：飞牛 appcgi.dockermgr 根本没有日志端点（只有 list/create/inspect/
# top/stats/start/stop/restart/kill/rm/modify），命令行拿不到 stdout —— 首次部署排查
# 构建失败时只能靠它。先裁一次再起 tee，免得每次重启都往一个无限增长的文件里追加。
mkdir -p "$DATA"
[ -f "$LOGF" ] && tail -n 400 "$LOGF" > "$LOGF.tmp" && mv "$LOGF.tmp" "$LOGF"
exec > >(tee -a "$LOGF") 2>&1

log() { printf '%s [ams] %s\n' "$(date -u +'%F %TZ')" "$*"; }
# 取短 sha 用。别写成 ${x:0:10:-无}：bash 会把 "10:-无" 当算术式报
# arithmetic syntax error，整条 log 静默丢掉（第一次部署时日志一片空白就是这个）。
short() { printf '%.10s' "${1:-}"; }

api_ok() {
  node -e "fetch('http://127.0.0.1:${PORT_NO}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}
page_ok() {
  node -e "fetch('http://127.0.0.1:${PORT_NO}/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

# 两个都得过。只测 /api/health 会放行"后端活着但前端产物不存在"的半成品 ——
# 首次部署正是这样：npm run build 失败，/ 返回 500「前端产物不可用」，而旧写法照样判健康、
# 把 sha 记成已上线，界面上一片空白却显示部署成功。
healthy() {
  local i
  for i in $(seq 1 20); do
    if api_ok && page_ok; then
      return 0
    fi
    sleep 3
  done
  return 1
}

stop_node() {
  [ -n "$NODE_PID" ] || return 0
  kill "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  NODE_PID=""
}

start_node() {
  stop_node
  cd "$APP" || return 1
  # 与仓库 Dockerfile 的 CMD 保持一致：tsx 只做加载器，不引入构建产物
  node --import tsx server.ts &
  NODE_PID=$!
  log "node 已启动 pid=$NODE_PID"
}

# 用 git init + fetch 而不是 clone：/app 里已经有 data/ 与 .npm 之外的挂载，
# clone 要求目录为空，会直接失败
ensure_repo() {
  [ -d "$APP/.git" ] && return 0
  git init -q "$APP"
  git -C "$APP" remote add origin "$REPO_URL"
}

# checkout + 装依赖 + 构建；任何一步失败都返回非 0，调用方负责回退
build_at() {
  local sha="$1"
  git -C "$APP" checkout -q --detach "$(short "$sha")" || { log "checkout $(short "$sha") 失败"; return 1; }
  # 前端构建要 devDependencies（vite/tailwind），所以这里不能 --omit=dev
  ( cd "$APP" && npm ci --legacy-peer-deps --no-audit --no-fund ) || { log "npm ci 失败"; return 1; }
  ( cd "$APP" && npm run build ) || { log "前端构建失败（npm run build 退出码非 0）"; return 1; }
  # 构建"成功退出"不等于产物在：vite 偶发只写出一半
  [ -f "$APP/dist/index.html" ] || { log "构建后仍缺 dist/index.html"; return 1; }
  return 0
}

update_once() {
  local head prev deployed cur
  head=$(git -C "$APP" ls-remote origin "$BRANCH" | cut -f1) || return 0
  [ -n "$head" ] || { log "远端没找到分支 $BRANCH"; return 0; }
  deployed=$(cat "$STATE" 2>/dev/null || echo "")
  [ "$head" = "$deployed" ] && { log "无更新：$(short "$head")"; return 0; }

  prev="$deployed"
  cur="${prev:+$(short "$prev")}"
  log "发现新版本 $(short "$head")（当前 ${cur:-无}），开始构建"
  git -C "$APP" fetch -q --depth=1 origin "$BRANCH" || { log "fetch 失败，保持现状"; return 0; }

  if ! build_at "$head"; then
    log "新版本构建失败 —— 继续跑 $(short "$prev")"
    [ -n "$prev" ] && build_at "$prev"
    return 1
  fi

  start_node
  if healthy; then
    printf '%s' "$head" > "$STATE"
    log "已上线 $(short "$head")"
    return 0
  fi

  log "健康检查未过，回滚到 $(short "$prev")"
  [ -n "$prev" ] || { log "没有可回滚的历史版本，保持当前状态等人工处理"; return 1; }
  build_at "$prev" && start_node
  healthy && log "回滚完成，仍在 $(short "$prev")" || log "回滚后仍不健康，看 data/deploy.log"
  return 1
}

log "启动：$REPO_URL#$BRANCH，每 ${INTERVAL}s 检查一次更新"
ensure_repo

# 首次没有 .deployed-sha 时，先按远端当前版本装一遍
if [ ! -f "$STATE" ]; then
  git -C "$APP" fetch -q --depth=1 origin "$BRANCH" || log "首次 fetch 失败，稍后重试"
  first=$(git -C "$APP" rev-parse FETCH_HEAD 2>/dev/null || echo "")
  if [ -n "$first" ] && build_at "$first"; then
    printf '%s' "$first" > "$STATE"
    log "首次安装完成 $(short "$first")"
  else
    log "首次安装未完成（first=$(short "${first:-无}")）—— 下面每轮会继续尝试"
  fi
fi
start_node
healthy || log "警告：启动后健康检查未通过（首次启动要建库，可能只是慢）"

while :; do
  # node 意外退出（未捕获异常等）时先把它拉回来，再谈更新
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    log "node 进程不在了，重启"
    start_node
  fi
  update_once || true
  sleep "$INTERVAL"
done

# 主循环是 `while :`，走到这里说明它被打断了 —— 留一行证据，别让人对着 29 次静默重启猜
log "主循环退出（不应发生），容器即将结束"
