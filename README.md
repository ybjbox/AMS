# AMS 行政管理系统

单进程全栈的内部行政管理系统：React 19 + Vite + Tailwind（前端）、Express + Node 内置 SQLite（后端），支持员工/部门/考勤/文档/待办/通知管理、审计留痕、数据库热备，以及带沙箱隔离的 Excel 导出脚本模板与 AI 助手。

## 本地运行

**前置要求**：Node.js ≥ 22.9（数据层使用 Node 内置 `node:sqlite`，无需安装任何数据库）

1. 安装依赖（需 `--legacy-peer-deps`，根因见 [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md) 工程化一节）：
   `npm install --legacy-peer-deps`
2. （可选）复制 `.env.example` 为 `.env.local` 按注释配置环境变量
3. 启动：
   `npm run dev:watch`（开发推荐，前后端热重载）或 `npm run dev`
4. 浏览器访问 <http://localhost:3000>；**首次启动会在服务端控制台打印初始管理员账号密码**（同时写入 `data/ADMIN_CREDENTIALS.txt`），首次登录后请立即改密并删除该文件

## 文档

| 文档 | 内容 |
|---|---|
| [DEBUGGING.md](DEBUGGING.md) | 本地调试环境：热重载、VS Code 断点、接口联调、常见问题 |
| [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md) | 整体设计审查（P0/P1/P2 发现）与五批次改造路线图 |
| [docs/AUDIT.md](docs/AUDIT.md) | 安全审计记录（27 项修复） |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 功能路线图 |
| [docs/DOCKER.md](docs/DOCKER.md) | Docker 部署说明 |

## AI 助手（可选）

AI 功能走 **OpenAI 兼容接口**，不配置即自动禁用，不影响其它功能。登录后在 AI 管理面板配置 baseUrl / apiKey / model（持久化于 SQLite），或通过 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` 环境变量提供默认值。
