# AMS 容器化部署

AMS 经过安全改造后已是**单进程全栈架构**：`server.ts` 用 Express + Vite 中间件模式，
在**同一个端口（默认 3000）**上同时提供 REST API 和打包后的前端 SPA。
因此部署只需要**一个容器**，无需 nginx、无需独立后端服务。

> ⚠️ 必须使用 **Node 22+** 的基础镜像。后端依赖 Node 内置的 `node:sqlite`（DatabaseSync），
> 在 Node 18 上完全不支持，镜像会启动失败。Dockerfile 已锁定 `node:22-bookworm-slim`。

> ✅ runner 阶段只装 **生产依赖**（`npm ci --omit=dev`）。`dependencies` 里只有服务端运行时真会
> import 的那十来个包（express / compression / exceljs / mammoth / nodemailer / pdf-to-img /
> pdfjs-dist / unpdf / undici / dotenv / zod）加 `tsx`（加载 TS 入口）；react、vite、tailwind、
> vitest 等前端与构建期工具全在 `devDependencies`，只存在于 builder 阶段。
> 这条边界由 `scripts/verify-prod-deps.mjs` 在 CI 里钉住（含"server.ts 不得静态 import vite"）。

## 文件说明

| 文件 | 作用 |
|------|------|
| `Dockerfile` | 多阶段构建：builder 装全量依赖跑 `vite build` 产出 `dist/`；runner 只装生产依赖，用 `node --import tsx server.ts` 运行全栈服务 |
| `.dockerignore` | 排除 `node_modules` / `dist` / `data`（含 SQLite 与凭据）/ 密钥，避免烤进镜像 |

> 仓库内**没有** `docker-compose.yml`（此前文档误列）。下面用 `docker run`；若你自己维护一份，
> 记得服务定义只需 `build: .` + `ports: "3000:3000"` + `volumes: ams-data:/app/data`。

## 构建镜像

```bash
docker build -t ams:latest .
```

## 启动方式

```bash
# 首启会随机生成管理员口令（打印横幅 + 落 data/ADMIN_CREDENTIALS.txt，权限 0600）
docker run -d --name ams -p 3000:3000 \
  -e NODE_ENV=production -e HOST=0.0.0.0 \
  -v ams-data:/app/data --restart unless-stopped \
  ams:latest

docker logs -f ams          # 看首次管理员口令
docker inspect --format '{{.State.Health.Status}}' ams   # 内置 HEALTHCHECK
```

如需固定口令（至少 10 位，含字母与数字）：加 `-e AMS_ADMIN_PASSWORD='YourStrongPwd123'`。
停止（数据卷保留）：`docker rm -f ams`。

访问 `http://<host>:3000`。容器内首启会：
1. 创建 `data/ams.db`（SQLite）；
2. 若无管理员账号，则生成随机口令写入 `data/ADMIN_CREDENTIALS.txt`（文件权限 0600）并打印横幅到 stdout；
3. 用 `AMS_ADMIN_PASSWORD` 可覆盖该随机口令。

## 数据持久化

SQLite 库与上传文件都在容器内的 `/app/data`。**务必挂载卷**，否则容器删除即丢全部数据：

- 上面的 `docker run` 已挂 `ams-data` 命名卷到 `/app/data`；
- 手动运行时用 `-v ams-data:/app/data`（命名卷）或 `-v /path/on/host:/app/data`（bind 挂载，注意宿主机目录属主需可写）。

## 健康检查

容器内置 `HEALTHCHECK` 每 30s 请求 `GET /api/health`。可用：

```bash
docker inspect --format='{{.State.Health.Status}}' ams
```

## 反向代理 / TLS（可选）

单容器已可独立工作。若要在前面加 Nginx / Caddy 做 TLS 终止，只需把 `/` 与 `/api` 都转发到
容器 3000 端口即可（同源，无需任何路径改写）。反向代理务必设置 `X-Forwarded-For` 以便登录审计记录真实 IP。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 设为 `production` 后 server.ts 托管 `dist/` 静态资源 |
| `HOST` | `127.0.0.1` | 容器内必须 `0.0.0.0` 才能对外服务 |
| `PORT` | `3000` | 监听端口（已 EXPOSE 3000） |
| `AMS_ADMIN_PASSWORD` | 空（随机生成） | 首启管理员口令覆盖值 |
| `DATA_DIR` | `/app/data` | SQLite 数据目录 |
