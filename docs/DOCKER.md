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
| `docker-compose.yml` | 单服务编排：`build: .` + `ports` + `ams-data:/app/data` 卷 + 环境变量 + 日志轮转 + healthcheck。`docker compose up -d` 即可 |
| `.dockerignore` | 排除 `node_modules` / `dist` / `data`（含 SQLite 与凭据）/ 密钥，避免烤进镜像 |

## 构建镜像

```bash
docker build -t ams:latest .
# 或直接用仓库里的 compose（构建 + 启动 + 重启策略 + 卷）
docker compose up -d
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

SQLite 库与全部运行期数据都在容器内的 `/app/data`（即 `DATA_DIR`）。**务必挂载卷**，否则容器删除即丢全部数据：

- `ams-data:/app/data`（命名卷）或 `-v /path/on/host:/app/data`（bind 挂载，注意宿主机目录属主需可写）。

卷里实际放着四样东西，缺一都会在换镜像或重建容器时丢：

| 路径 | 内容 |
|------|------|
| `data/ams.db`（+ `-wal` / `-shm`） | 全部业务数据 |
| `data/uploads/` | 文档中心上传的原始文件（`documents.storedPath` 指向这里） |
| `data/backups/` | 自动备份：`ams-*.db` + 同名 `.uploads` / `.templates` 快照 |
| `data/templates/` | **导出脚本模板**（管理员改过的版本）。镜像里的 `server/templates` 只是首次启动的种子，不会覆盖卷里已有的同名文件 |

> 模板以前住在 `server/templates`（镜像层里），于是"换一次镜像 = 自定义导出模板静默回到出厂值"。
> 现在它在数据卷里，并且跟着备份一起存/一起回滚。

## 健康检查

容器内置 `HEALTHCHECK` 每 30s 请求 `GET /api/health`：

```bash
docker inspect --format='{{.State.Health.Status}}' ams
```

`/api/health` 只在**数据库可用**时返回 200；库打不开（损坏、磁盘满、被别的进程独占）时返回 503，
因此探针能真正发现"进程活着但服务不可用"，`restart: unless-stopped` 也才有机会介入。
磁盘剩余、最近一次备份是否成功、schema 版本、同数据目录上的其它实例等运维细节在
`GET /api/system/diagnostics`（仅管理员，登录后在「系统设置 → 运行诊断」里看），不放在公开探针里。

## 反向代理 / TLS（可选）

单容器已可独立工作。若要在前面加 Nginx / Caddy 做 TLS 终止，只需把 `/` 与 `/api` 都转发到
容器 3000 端口即可（同源，无需任何路径改写）。

要在审计日志与登录暴破限流里看到**真实客户端 IP**，两步都要做：

1. 代理侧传 `X-Forwarded-For`（Nginx：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`）；
2. 容器侧设 `TRUST_PROXY=<可信跳数>`（如 `1`）。

第 2 步是刻意的：**默认不读** `X-Forwarded-For`。没设这一项就去信任该头，任何人都能伪造它，
登录限流与审计里记录的 IP 就成了摆设。只有确实存在可信代理、且知道有几跳时才设。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 设为 `production` 后 server.ts 托管 `dist/` 静态资源 |
| `HOST` | `127.0.0.1` | 容器内必须 `0.0.0.0` 才能对外服务 |
| `PORT` | `3000` | 监听端口（已 EXPOSE 3000） |
| `TZ` | `Asia/Shanghai`（Dockerfile 内） | **不要留成 UTC**：考勤归属日、合同剩余天数、提醒扫描的"今天"都按本地日历日判定，偏移 8 小时会整体算错，而 CI 把 e2e 钉在 Asia/Shanghai，测试全绿也发现不了 |
| `AMS_ADMIN_PASSWORD` | 空（随机生成） | 首启管理员口令覆盖值 |
| `DATA_DIR` | `/app/data` | SQLite 数据目录（库/上传/备份/模板，见「数据持久化」） |
| `TRUST_PROXY` | 不设（不读 XFF） | 只有放在可信反向代理后面才设，值 = 跳数；乱设等于允许客户端伪造来源 IP |
| `BACKUP_ENABLED` | `true` | `false` 关闭定时备份 |
| `BACKUP_INTERVAL_MS` | `86400000` | 备份间隔（默认每日） |
| `BACKUP_RETENTION_DAYS` | `7` | 按天数保留 |
| `BACKUP_MAX_COUNT` | `14` | 份数上限：每份都带 uploads + 模板快照，只按天数删的话磁盘放大没有上界 |
| `BACKUP_MAX_TOTAL_MB` | `0`（不按容量删） | 总量上限，超出从最旧开始删（至少保留一份） |

## 同一个数据目录上跑多个实例

WAL 模式允许多个进程读同一个库，但**恢复备份是"换掉主库文件"**：另一台实例仍握着被替换掉的
旧 inode，它之后的每一次写入都落到一个已被 unlink 的文件上 —— 不报错、不留日志、数据永久消失。

因此进程启动时会在 `DATA_DIR/.instance-<端口>.json` 上登记心跳：

- 发现还有别人在同一目录上跑 → 启动日志打一条明确告警（开发时 `:3000` + 验证用 `:3001` 共用是常态，所以**不禁止**）；
- `POST /api/backup/restore` 在这种状态下直接 409，并列出需要停掉的端口 —— 宁可拒掉，也不静默丢别人的写。

诊断面板的 `health.otherInstances` 也能看到同一份信息。
