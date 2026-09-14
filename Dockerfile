# AMS 单容器全栈镜像（与 docker-compose.yml / docs/DOCKER.md 对应）
# 架构：Express + node:sqlite 单进程，生产模式下 Express 直接托管 dist/ 静态产物（无 nginx）

# ---- 构建阶段：安装依赖 + 构建前端 ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps：仓库内 eslint@10 与 eslint-plugin-react-hooks@7 的 peer 声明矛盾（见 docs/DESIGN-REVIEW.md）
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:22-bookworm-slim AS runner
# 完整依赖：server.ts 顶层静态 import 了 vite（生产分支跳过但仍需可解析），且 tsx 负责运行 TS 入口
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY server ./server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server.ts"]
