# AMS 单容器全栈镜像（与 docs/DOCKER.md 对应）
# 架构：Express + node:sqlite 单进程，生产模式下 Express 直接托管 dist/ 静态产物（无 nginx）

# ---- 构建阶段：安装全量依赖 + 构建前端 ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps：仓库内 eslint@10 与 eslint-plugin-react-hooks@7 的 peer 声明矛盾（见 docs/DESIGN-REVIEW.md）
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build

# ---- 运行阶段：只装生产依赖 ----
# dependencies 里现在只有"服务端运行时真会 import 的包"+ tsx（入口加载器）；
# 前端与构建期工具（react / vite / tailwind 等）全部留在 devDependencies，只在 builder 里存在。
# 边界由 scripts/verify-prod-deps.mjs 在 CI 里钉住（含"server.ts 不得静态 import vite"）。
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# 时区必须显式设：整套业务按**本地日历日**判定（server/localDate.ts 里就记着
# "UTC+8 下每天 00:00–07:59 会少一天"这个历史 bug），而 slim 基础镜像默认 UTC。
# 不设的话容器里的"今天"比北京晚 8 小时：打卡归错日、合同剩余天数差一格、提醒与
# 审计保留期的日边界整体偏移 —— 而 CI 把 e2e 钉在 Asia/Shanghai，全绿也看不出来。
ENV TZ=Asia/Shanghai
# tzdata 缺失时 TZ 会被静默忽略（等于没设），所以让构建直接失败并说清原因，
# 而不是等上线后才发现日期算错。
RUN test -e /usr/share/zoneinfo/${TZ} \
  || (echo "基础镜像缺少 tzdata（/usr/share/zoneinfo/${TZ} 不存在），无法设置 TZ=${TZ}" && exit 1) \
  && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
  && echo ${TZ} > /etc/timezone
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY server.ts ./
# server/templates 在镜像里只是「首次启动的种子」：运行期真正读写的模板目录是
# /app/data/templates（跟着 ams-data 卷走）。管理员改过的模板不会被换镜像覆盖。
COPY server ./server
EXPOSE 3000
# 探针看的是状态码：/api/health 在库不可用时返回 503（以前恒 200，
# 于是磁盘满/库坏的容器一直"healthy"地写着失败，restart 也等不到）。
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server.ts"]
