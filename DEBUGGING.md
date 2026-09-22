# AMS 本地实时调试环境指南

> 本文档描述如何在本机运行、调试和联调 AMS（行政管理系统），以及为后续功能优化与架构改造预留的改造钩子。
> 环境搭建时对仓库做的接线改动见文末「环境搭建改动清单」。

---

## 1. 架构与调试模型（先读这一段）

AMS 是**单进程全栈应用**，这决定了所有调试姿势：

```
┌─────────────────── 一个 Node 进程 (端口 3000) ───────────────────┐
│                                                                  │
│  Express (server.ts)                                             │
│  ├─ runMigrations()            SQLite 迁移（幂等，user_version）  │
│  ├─ authGate                   /api 鉴权闸门（公开: /health、     │
│  │                             /auth/login，其余需 Bearer Token） │
│  ├─ /api/auth|employees|...    server/ 下 13 组业务路由           │
│  ├─ /api/themes|export-...     Excel 主题/导出（旧接口）          │
│  ├─ node:sqlite                数据层，文件在 data/ams.db         │
│  └─ Vite (middlewareMode)      开发模式下接管非 /api 请求         │
│      └─ React 19 + Tailwind 4  前端 SPA，HMR 热更新经同一端口推送  │
└──────────────────────────────────────────────────────────────────┘
```

要点：
- **前后端同端口同进程**：前端 axios 实例（`src/services/api.ts`）baseURL 固定为相对路径 `/api`，同源直连。开发模式**不需要 proxy，不存在 CORS 问题**。
- **后端重启 = 前端也重启**：`tsx watch`/`node --watch` 重启进程时 Vite 中间件随之重建，浏览器会短暂断开 HMR 并自动重连/刷新，属正常现象。
- 数据层是 **Node 内置 `node:sqlite`**（`server/db.ts`），零原生编译依赖；数据库文件 `data/ams.db`（可用 `DATA_DIR` 环境变量改位置），该目录已被 .gitignore 忽略。

## 2. 运行环境要求

| 组件 | 要求 | 说明 |
|---|---|---|
| Node.js | **≥ 22.9，推荐 22/24/26 LTS** | 代码使用 `node:sqlite`（≥22.5）；`node --watch`、`--env-file-if-exists`（≥22.9）；本机已验证 v26.8.2 可用 |
| npm | ≥ 10 | 安装必须带 `--legacy-peer-deps`，原因见 §3 |
| Git | 任意近期版本 | Windows 下若克隆报 `schannel` SSL 错误，用 `git -c http.sslBackend=openssl clone ...` |
| VS Code | 推荐 | 已内置 Node 调试器与浏览器调试器，无需装扩展即可断点；建议装 ESLint 扩展辅助改造 |

无需安装：Python、Visual Studio Build Tools、任何数据库软件、任何 AI API 密钥（AI 助手未配置时禁用，不影响其它功能）。

## 3. 安装步骤

```bash
git clone https://github.com/ybjbox/AMS.git        # Windows schannel 报错时加 -c http.sslBackend=openssl
cd AMS
npm install --legacy-peer-deps --no-audit --no-fund
```

**为什么必须 `--legacy-peer-deps`**：仓库声明 `eslint-plugin-react-hooks@^7.0.1`（peer 上限 eslint ^9）与 `eslint@^10` 互相矛盾，npm ≥ 8 的严格 peer 校验会直接拒绝安装（`npm ci` 同样失败）。这是仓库自身的依赖矛盾，改造时建议升级 eslint-plugin-react-hooks 到支持 eslint 10 的版本来根治。

**附带坑位**：`--legacy-peer-deps` 模式下 npm **不再自动安装 peer 依赖**，而 `recharts` 把 `react-is` 声明为 peer——旧环境能跑是靠 npm 8/9 的自动装 peer 行为。现已把 `react-is@^19` 显式写入 dependencies（缺失时报错为 `Could not resolve "react-is"`，Vite 预构建会直接崩掉服务端进程）。

**复制环境变量**（仓库外首次即可，本工作区已生成）：

```bash
cp .env.example .env.local    # 可选项见 .env.local 内注释
```

## 4. 启动方式

| 命令 | 用途 | 热重载 |
|---|---|---|
| `npm run dev:watch` | **日常开发/联调（推荐）** | 前端 HMR + 后端文件变更自动重启 |
| `npm run dev` | 仓库原始开发命令（保留未动） | 仅前端 HMR，后端改动需手动重启 |
| `npm run build` && `npm start` | 生产模式验证（托管 dist/） | 无 |
| `npm run test:run` | Vitest 全量测试（改造前基线） | — |
| `npm run lint` / `npm run format` | ESLint / Prettier | — |

`dev:watch` 的实际命令是 `tsx watch server.ts`：tsx 负责 TS 执行，自带监视器默认忽略 node_modules，只监听模块图（含 `server/` 全部文件）。**不要改用 `node --watch`**——它会连 node_modules 一起监听，Vite 每次启动写出的 `vite.config.ts.timestamp-*.mjs` 临时文件会触发"重启→写文件→再重启"的无限循环（已实测踩坑）。

环境变量由 `server/env.ts`（server.ts 的第一个 import，dotenv 实现）加载：优先级为 真实进程环境变量 > `.env.local` > `.env`，对 dev/dev:watch/start/VS Code 调试所有入口一致生效。

**首次启动**（数据库不存在时）：
1. 自动执行数据库迁移建表（种子 45 名员工、部门树、班次、文件夹；迁移版本 v5）；
2. 自动创建管理员账号 `admin`。若 `.env.local` 未设置 `AMS_ADMIN_PASSWORD`，会在**服务端控制台打印随机密码**并写入 `data/ADMIN_CREDENTIALS.txt`（首次改密后请删除该文件）；
3. 系统强制**首次登录改密**：改密前所有业务接口返回 `403 PASSWORD_CHANGE_REQUIRED`，属预期安全设计（`POST /api/auth/change-password`）。
4. 本工作区已完成首次启动：用户名 `admin`，口令取 `.env.local` 里的 `AMS_ADMIN_PASSWORD`（不写进仓库，也不贴在这里；`requests.http` 与 e2e 都从同一个环境变量取）。若换机器且没设该变量，就走上面第 2 条的随机密码 + `ADMIN_CREDENTIALS.txt` 流程。
5. 登录接口有防爆破锁定（连续失败会临时锁定），调试密码时别狂试。

启动成功标志：控制台输出 `Server running on http://localhost:3000`，浏览器访问 <http://localhost:3000> 出现登录页。

## 5. 热重载配置要点

- **前端 HMR（内建，零配置）**：React 组件/样式改动秒级热替换，不丢组件状态。`vite.config.ts` 里 `DISABLE_HMR !== 'true'` 才启用，默认开启；只有调试"整页刷新"类问题时才临时设 `DISABLE_HMR=true`。
- **后端热重启（本次新增）**：`npm run dev:watch`。修改 `server.ts` 或 `server/*.ts` 保存后进程自动重启（控制台可见 `[tsx] change in ... Restarting...` 与迁移幂等跳过），Vite 会向浏览器广播 page reload。数据库文件在 `data/`，重启不丢数据；**登录会话也持久化在 SQLite 中，重启后 Token 依然有效**（已实测）。
- 改 `vite.config.ts`、`package.json`、`.env.local` 这类配置文件后，建议手动重启进程（watch 只监听模块图，不监听配置）。

## 6. 断点调试配置要点（VS Code）

已提供 `.vscode/launch.json`，四种姿势：

| 配置名 | 类型 | 用途 |
|---|---|---|
| `AMS: 后端调试 (断点+热重启)` | node | 启动全栈进程并附加调试器；`npx tsx watch --inspect`，兼具热重启与断点 |
| `AMS: 前端调试 (Edge)` | msedge | 启动 Edge 并把页面 JS 映射回 `src/` 源码，直接在 `.tsx` 里断点 |
| `AMS: 前端调试 (Chrome)` | chrome | 同上，Chrome 版（使用独立 profile，不影响日常浏览器） |
| `AMS: 全栈联调 (后端+Edge)` | compound | 一键同时起前后端调试（stopAll 联动停止）。

**后端断点**：在 `server/*.ts`（如 `employeesRouter.ts`、`db.ts`、`authMiddleware.ts`）任意行打断点 → F5 运行后端配置 → 用前端页面或 `requests.http` 触发请求即可命中。`skipFiles` 已排除 node_modules 与 Node 内部，单步调试不会掉进依赖。
**前端断点**：先起后端（出现 `Server running` 字样）→ F5 运行前端配置 → 在 React 组件/`src/services/*` 里断点。依赖 Vite 开发态 sourcemap，`webRoot` 已指向 `src/`。
** Attach 已运行进程**：终端里手动跑 `node --import tsx --inspect server.ts`（或任何带 `--inspect` 的方式），然后用 VS Code 命令 *Debug: Attach to Node Process* 连入 9229 端口。任何 IDE/DevTools 都可用这条通用通道（`chrome://inspect` 亦然）。

## 7. 接口联调要点

**认证模型**：除 `GET /api/health`、`POST /api/auth/login` 外全部需要登录。浏览器登录后 Token 存 localStorage，由 axios 请求拦截器自动附加 `Authorization: Bearer <token>`；响应拦截器统一处理 401（清 Token、广播 AUTH_EXPIRED 事件跳登录）。

**外部工具联调**（curl / Postman / VS Code REST Client）：先调登录接口拿 Token，再手动带 Header。仓库根目录已提供 **`requests.http`**（配合 REST Client 插件），覆盖健康检查→登录→全部业务接口→401/404 边界用例，登录响应 Token 自动引用。

**接口清单与挂载路径**（2026-09-14 第②批前后端接通后更新；调试时可打断点的对应文件）：

| 挂载点 | 路由文件 | 前端调用方 | 备注 |
|---|---|---|---|
| `/api/auth` | `server/authRouter.ts` | `src/services/auth.ts` ✅ 已接通 | login/me/logout/change-password/accounts |
| `/api/users` | `server/employeesRouter.ts` | `src/services/userApi.ts` ✅ 已接通 | 挂载路径为作者原始约定（Router 注释 + 审计映射表 + 前端路径三方一致）；员工/台卡/考勤/合同页消费 |
| `/api/departments` | `server/departmentsRouter.ts` | `src/store/useDepartmentStore.ts` ✅ 已接通 | GET /（树+职位）、PUT /tree、PUT /roles |
| `/api/attendance` | `server/attendanceRouter.ts` | `src/services/attendanceApi.ts` ✅ 已接通 | shifts/schedules/records/anomalies/analyze；Excel 导入待后端解析接口（页面上已如实提示） |
| `/api/folders` `/api/documents` `/api/document-sets` `/api/files` | `server/documentsRouter.ts` | ⚠️ 文档模块仍走 mockApi（涉及真实文件上传，留待下一批） | 后三个挂载路径为推定，无现成调用方 |
| `/api/todos` | `server/todosRouter.ts` | `src/services/todoApi.ts` ✅ 已接通 | 服务端按 createdBy/assignee 隔离 |
| `/api/approvals` | `server/approvalsRouter.ts` | `src/services/approvalApi.ts` ✅ 已接通 | R1 v1 请假申请闭环：自助提交（EMPLOYEE）+ HR 审批；决定自动通知申请人，重复决定 409 |
| `/api/notifications` | `server/notificationsRouter.ts` | `src/services/notificationApi.ts` ✅ 已接通 | recipient = 当前登录用户 |
| `/api/audit-logs` | `server/auditRouter.ts` | `src/services/auditApi.ts` ✅（API 就绪，日志页 UI 待切换） | 挂载名对齐前端的 `/audit-logs` |
| `/api/backup` | `server/backupRopter.ts`（文件名拼写如此） | `src/services/backupApi.ts` ✅ 已挂载面板 | 仅 ADMIN；恢复备份会热重载 DB 连接 |
| `/api/ai` | `server/aiRouter.ts` | AI 助手组件 ✅ 已挂载 | OpenAI 兼容协议；配置存 `ai_config` 表 |
| `/api/health` `/api/themes` `/api/export-templates` `/api/export/employees` | `server.ts` 内联 | 主题/脚本面板消费中 | 模板端点走 templateStore+沙箱；受 authGate+auditGate 保护 |

✅ = 前后端已对通；⚠️ = 前端仍走 mock 或路径不一致，属于后续"功能优化与架构改造"的切入点。

**联调排障顺序**：`GET /api/health`（进程活着吗）→ 登录接口（鉴权链路通吗）→ 带 Token 调业务接口（数据层通吗）→ 浏览器 DevTools Network 看前端实际请求（谁在用 mock 一目了然：mock 数据不产生网络请求）。

## 8. 面向架构改造的钩子（预留）

1. **拆分前后端双进程**（如需前端独立 Vite Server + 后端独立 API 进程）：在 `vite.config.ts` 补 `server: { proxy: { '/api': 'http://localhost:3001' } }`，前端代码因 baseURL 是相对路径而**无需改动**；后端把 Vite 中间件分支拆掉即可。
2. **API 路径统一**：`/api/users` vs `/api/employees` 等缺口，建议以前端 service 层为唯一改点（`src/services/*` 是全部请求出口，axios 拦截器集中在此）。
3. **mock → 真实 API 迁移**：mock 引用集中在 `src/services/userApi.ts`、`src/store/useAttendanceStore.ts`、`src/store/useDocumentStore.ts` 三处，逐个替换为 `http` 调用即可，后端路由已就绪。
4. **端口/目录**：端口硬编码在 `server.ts` 的 `PORT = 3000`；数据目录用 `DATA_DIR` 环境变量外置（Docker 部署同款机制）。
5. **根治依赖矛盾**：升级 `eslint-plugin-react-hooks` 至支持 eslint 10 的版本后，可去掉 `--legacy-peer-deps`。
6. 旧接口（themes/export-templates/export）已随本次接线纳入 authGate 保护；如需保持匿名访问，把 authGate 挂载移到这些路由之后即可（见 §9 改动清单）。

## 9. 环境搭建改动清单（相对 GitHub 上游）

| 文件 | 改动 | 可还原方式 |
|---|---|---|
| `server.ts` | ① 导入并挂载 13 组业务路由（路径与各 Router 头部注释一致）② 启动时执行 `runMigrations()` ③ `app.use('/api', authGate)` 鉴权闸门 ④ 2026-09-14 安全对齐批次：紧跟 authGate 挂载 `auditGate`（写操作自动审计留痕）、注册统一 `errorHandler`、模板端点改接 templateStore 白名单 + scriptSandbox 沙箱（替换旧版裸 `fs.writeFile`/`await import()` 的 RCE 路径）、themes 读写穿透 settings 表（重启不丢）、启动定时备份/审计保留期清理/上传孤儿扫描、`HOST` 默认 `127.0.0.1`（`PORT`/`HOST` 可用环境变量覆盖）。**①②③是前后端联调能跑通的前提**——上游代码写好了全部路由模块但没有接线，此前登录接口根本不存在于服务端 | `git checkout -- server.ts` |
| `server/env.ts` | 新增：dotenv 加载 `.env.local`/`.env`，作为 server.ts 首个 import（ESM 按导入顺序求值，保证种子逻辑读到 `AMS_ADMIN_PASSWORD`） | 删除文件并去掉 server.ts 首行导入 |
| `package.json` | ① 新增 `dev:watch`（`tsx watch server.ts`）脚本 ② 移除 `better-sqlite3`：全仓零引用的死依赖，且在 Node ≥ 26 无预编译包、本地编译失败会**中断整个 npm install**（数据层实际用 Node 内置 `node:sqlite`）③ 显式新增 `react-is@^19`（recharts 的 peer 依赖，npm 11 legacy 模式不自动装 peer） | 按上表逐项 `git checkout` / 还原条目 |
| `package-lock.json` | 随依赖变更自动更新 | `git checkout -- package-lock.json` |
| `.gitignore` | 追加 `data/`（SQLite 运行期数据）与 `.vscode/*-profile/` | `git checkout -- .gitignore` |
| `.env.local` | 新建（本地环境变量，已被 .gitignore 忽略，不会提交） | 直接删除 |
| `.vscode/`、`requests.http`、`DEBUGGING.md` | 新增调试配置与文档 | 直接删除 |

**已验证的基线记录**（2026-09-13，Node 26.8.2）：
- `GET /api/health` → `{"status":"ok"}`；无 Token 访问业务接口 → `401`；登录 → 签发 Token；带 Token 访问 employees/departments/todos/audit-logs → `200` 返回种子数据；
- 热重载：改 `server.ts` → `[tsx] change ... Restarting...` → 服务自动恢复，且登录会话跨重启有效；
- `npm run test:run`：**39 通过 / 3 失败**，失败全部位于 `src/utils/__tests__/dateUtils.test.ts`（`calculateYearsOfService` 的 3 个用例），为上游既有问题，与本环境无关——改造时可作为第一个顺手修复项。

## 10. 常见问题

| 现象 | 处理 |
|---|---|
| 克隆时报 `schannel: SSL/TLS handshake failed` | `git -c http.sslBackend=openssl clone …`（仅本次生效，不动全局配置） |
| `npm install` 报 ERESOLVE | 加 `--legacy-peer-deps`（见 §3） |
| 启动即崩：`Could not resolve "react-is"` | react-is 已显式写入 dependencies；若复现先重跑 `npm install --legacy-peer-deps` |
| 用 `node --watch` 启动后无限重启 | 预期行为：Vite 临时文件触发循环，改用 `npm run dev:watch`（tsx watch），见 §4 |
| 业务接口返回 `403 PASSWORD_CHANGE_REQUIRED` | 首次登录强制改密：先调 `POST /api/auth/change-password` 或在登录页按提示修改后再操作 |
| 局域网其他设备无法访问 | 默认只绑 `127.0.0.1`（安全默认）；需要时在 `.env.local` 设 `HOST=0.0.0.0`，启动日志会打印安全告警 |
| 审计日志看不到某次写操作 | auditGate 对所有写方法兜底留痕；确认请求带了有效 Token（未过 authGate 的请求由 logSecurityEvent 留痕） |
| 3000 端口被占用 | `netstat -ano | findstr :3000` 找到 PID 结束进程；或临时改 `server.ts` 的 `PORT`（改造时可提取为环境变量） |
| 浏览器页面空白/连接拒绝 | 后端还没起完，等控制台出现 `Server running on http://localhost:3000` 再刷新 |
| 忘记 admin 密码 | 关闭服务，删除 `data/ams.db`（或 `data/` 整目录）后重启，重新种子化；仓库还提供 `scripts/reset-admin-password.mjs` |
| 改了后端代码没重启 | 确认用的是 `dev:watch` 而不是 `dev`；watch 不监听 `vite.config.ts` / `.env.local`，这类文件需手动重启 |
| 断点不命中（前端） | 确认走的是 launch.json 的浏览器配置而非手动开浏览器；Vite sourcemap 需要开发模式（`npm run build` 后的产物无 sourcemap） |
| 登录提示锁定 | 登录接口有防爆破机制，稍等再试或重置数据库 |
