# AMS 系统整体设计审查报告

> 审查日期：2026-09-13　|　代码基线：main @ c8ac830（+ 工作区调试环境接线，见根目录 `DEBUGGING.md` §9）
> 审查方式：后端（server/ 全部 35 个模块）、前端（src/ 全部 services/store/代表页面）、工程化（构建/文档/脚本）三路并行深查，关键结论逐条人工复核（登录页、api.ts 导出、auditMiddleware 的 auditGate、dateUtils 实现与测试均亲自确认）。
> 结论速览：**地基（数据层 + 安全基建 + 文档意识）质量高于一般内部工具；入口层与前端只盖了一半**——`server/` 中经审计修复的能力大部分没有接线，前端与已建好的 API 大面积脱节。先花约两天把"已建成但没通电"的部分接上，系统即可从演示品变为可用品。

---

## 一、总体评价：系统处于"三张皮"状态

| 层 | 现状 |
|---|---|
| `server/` 业务模块 | 一套经过 docs/AUDIT.md（27 项修复）改造的高质量后端：声明式 RBAC、scrypt 会话体系、幂等迁移、审计脱敏、热备恢复、脚本沙箱。**但其中约 6 个关键模块无人引用，是"死代码"** |
| `server.ts` 入口 | AI Studio 模板旧版：内联保留了审计前的模板端点（含 RCE 路径），只挂了 13 组路由 + authGate；auditGate / errorHandler / templateStore / scriptSandbox / settingsDb / uploadsCleanup / 备份调度 全部未接线 |
| 前端 `src/` | 结构与工程习惯良好（路由懒加载、0 any、事件成对清理），但**几乎没接真实 API**：除 AI、备份两个不可达面板外全跑 mock 或本地持久化；登录在 DEV 是硬编码 mock、生产是 TODO |

文档（AUDIT.md / DOCKER.md / README）系统性领先于代码：引用的 10 个 `npm run test:*` 脚本不存在、描述的 Dockerfile 不存在、声称"已修复"的项在运行链路上未生效。**文档-代码漂移是当前维护的最大敌人。**

---

## 二、P0 — 必须修（安全或核心可用性）

### P0-1 旧版 RCE 模板端点在入口复活，沙箱修复链路整体未接线

- 证据：`server.ts:104-152` 一带——`POST /api/export-templates` 对 name 无白名单校验直接 `fs.writeFile(path.join(TEMPLATES_DIR, fileName), code)`（name 可含 `../`，任意路径写 .js）；`DELETE /api/export-templates/:name` 直接 `fs.unlink`（可删任意文件，如 `../../data/ams.db`）；导出时 `await import(pathToFileURL(...)?t=)` 在**主进程**执行模板代码（RCE）。
- 对照：`server/templateStore.ts`（路径白名单）、`server/scriptSandbox.ts` + `server/sandboxWorker.mjs`（Worker + resourceLimits + vm realm + `codeGeneration:{strings:false,wasm:false}` + 零宿主对象）、`server/excelReplay.ts`（回放 op 白名单 + 行列钳制）——**全仓无任何生产引用**（仅 `scripts/verify-export-sandbox.mjs` 按新行为断言）。
- 文档矛盾：AUDIT.md:33-48 声称"import() 执行路径已彻底移除"。
- 影响：持有 ADMIN 会话者可任意写/删文件并执行任意代码；守门脚本按现状必然失败；文档可信度崩塌。
- 修复方向：删除 server.ts 内联的三个模板端点与 script 分支，改接 templateStore + scriptSandbox + excelReplay（代码已写好，只差接线）。

### P0-2 生产环境无法登录

- 证据：`src/pages/Login.tsx:42-62`——DEV 分支硬编码 mock（`role:'admin'` + `mock_token_123`）；生产分支是 TODO，`authService.login` 被注释，只弹 toast"登录服务尚未接入"。而后端 `/api/auth` 完整可用（本环境实测登录、签发 Token 正常）。
- 影响：系统核心不可用；所有"已登录"功能建立在假身份上。
- 修复方向：解开 `authService.login` 调用，同时接上 `mustChangePassword` 强制改密跳转与 `expiresAt` 处理。

### P0-3 auditGate 未挂载，业务写操作审计实际缺失

- 证据：`server/auditMiddleware.ts:289` 定义了完整审计网关 `auditGate`（头注要求"authGate 之后紧跟"），server.ts 只挂 `authGate`，全文件无 auditMiddleware 引用；AUDIT.md:209 声称"已挂载"。
- 影响：员工/部门/考勤/文档全部增删改无审计留痕（audit_logs 只剩 auth/security 事件）；auditDb 的脱敏规则（密码置"[已脱敏]"、证件/手机掩码等）随之成为运行时死代码——P1-5 的合规价值（"谁改了谁的薪资"）落空。
- 修复方向：server.ts 在 authGate 之后补 `app.use("/api", auditGate)`。

### P0-4 `withAuthToken` 断链，tsc 实测报错

- 证据：`src/services/auditApi.ts:5`、`src/services/backupApi.ts:5` 从 `./api` 导入 `withAuthToken`，但 `src/services/api.ts:75-80` 只导出 `http`；`tsc -p tsconfig.json --noEmit` 两条 TS2305（agent 实测）。
- 影响：当前仅因 BackupPanel 无入口引入而未炸构建；一旦挂载面板，Rollup 构建即失败（missing export）。
- 修复方向：在 api.ts 实现 `withAuthToken`（拼 `access_token` 查询参数），并把 typecheck 接入工作流（见 P1 工程化）。

---

## 三、P1 — 应修（功能承诺未兑现 / 架构债）

### 后端：审计成果未接线系列

| # | 问题 | 证据 | 修复方向 |
|---|---|---|---|
| 1 | errorHandler 未注册，多个 Router 的同步抛错走 Express 默认 HTML 错误页 | errorHandler.ts:15 无人引用；documentsRouter.ts:27-39,109-140、departmentsRouter.ts:17-27、todosRouter.ts:37-48、attendanceRouter.ts 全部 | 路由后注册 `app.use(errorHandler)`，async 处理器套 asyncHandler |
| 2 | 主题持久化未接线（重启即丢，AUDIT P1-6 声称已修） | server.ts:29 内存 `dynamicThemes`；settingsDb.ts:59-65 无生产引用 | themes 读写改走 settingsDb，启动回填 |
| 3 | 定时备份与审计保留期清理均未启动 | backupDb.ts:210-235 `startBackupScheduler`、auditDb.ts:389-413 `pruneAuditLogs` 均无调用方 | server.ts 启动段调用两者 |
| 4 | 监听硬编码 `0.0.0.0`，与 AUDIT.md"默认 127.0.0.1 + HOST 开关"矛盾（docker-compose 设的 HOST 被忽略） | server.ts:265 | `app.listen(PORT, process.env.HOST \|\| "127.0.0.1")` |
| 5 | 上传无字节上限（流式修复解决了内存放大，未解决磁盘耗尽） | documentsRouter.ts:58-107 | 流式累计字节，超阈值 destroy + 400 |

### 前端：接通系列

| # | 问题 | 证据 | 修复方向 |
|---|---|---|---|
| 6 | 权限模型三处脱节：`hasPermission` 默认全放行（`enableStrictPermission` 默认 false）；它读常量字典，而设置页可编辑的是另一套 persist store——**界面授权调整全部无效**；PermissionMatrixPanel 也未挂载 | utils/permission.ts:12-17、config/permission.ts:3-8、store/permissions.ts:18-39、Settings/index.tsx:14-23 | hasPermission 改读 usePermissionsStore，面板挂回 Settings，字典与后端同步 |
| 7 | 四个已完工面板是"死 UI"：BackupPanel、AiConfigPanel、AiHistoryPanel、PermissionMatrixPanel 无任何入口引入；AiAssistant、BackendStatusIndicator 也没挂进 Layout | grep 全 src 无 import；Layout.tsx 仅含 Sidebar/Header/ErrorBoundary | Settings tabs 补挂四面板；Layout 挂载 AI 助手与状态指示 |
| 8 | 登出不清服务端会话、本地数据跨账号残留 | UserMenu.tsx:26-34 不调 authService.logout；todo-storage/ams-notifications/ams_permissions/contract-storage 跨账号残留 | logout 调后端吊销会话；persist key 按用户名隔离或登出清空 |
| 9 | Token 存 localStorage 无过期校验；`document.write` 内插未转义的可编辑标题（现成自注入点） | useUserStore.ts:33-34、api.ts:19、useExport.ts:170,207 | 标题走 escapeHtml；中期 httpOnly cookie 或滑动续期 |
| 10 | 改密链路整体缺失（后端 `mustChangePassword` 已返回且强制改密期 403 拦截业务接口，前端零消费） | services/auth.ts:12,38-39；ProfilePanel.tsx:10-17 占位 | 登录响应含 mustChangePassword 时重定向改密页；ProfilePanel 实现表单 |
| 11 | Dashboard 全静态假数据；员工列表纯前端分页，无视后端 `{items,total}` 信封与 MAX_PAGE_SIZE=200 | useDashboard.ts:40-102；useEmployeeStore.ts:24；后端 listQuery.ts | 接后端统计；切服务端分页/搜索 |
| 12 | Excel 导出纯 mock（setTimeout + "(Mock)" toast），后端 `/api/export/employees`、`/api/export-templates` 就绪未接 | useExport.ts:53-79,145-157 | 接真实导出（顺便消费 P0-1 的安全版模板能力） |

### 工程化

| # | 问题 | 证据 | 修复方向 |
|---|---|---|---|
| 13 | Docker 三件套自相矛盾：Dockerfile 为 node:18-alpine + nginx 静态镜像（node:18 无 node:sqlite），`COPY nginx.conf` 被 .dockerignore:27 排除——`docker build` 必失败；docker-compose 期待全栈 Node 镜像；docs/DOCKER.md 描述的 node:22 Dockerfile 不存在；nginx.conf 代理到不存在的 `backend:3000` | Dockerfile:2,10,19,22；docs/DOCKER.md:7-14 | 按 DOCKER.md 重写：node:22-bookworm-slim 多阶段 + tsx + HEALTHCHECK，删 nginx.conf |
| 14 | `GEMINI_API_KEY` 被 define 进客户端 bundle，`@google/genai` 全仓零引用——照 README 配置真实密钥会泄漏进前端 JS | vite.config.ts:10-12；README.md:16；实际 AI 走 server/aiRouter.ts:63-67 的 OpenAI 兼容协议 + DB 配置 | 删 define 与依赖，README 改指向 AI 配置面板 |
| 15 | lint 只扫 `src/`；`tsconfig.check.json` 是孤儿文件；AUDIT.md 引用的 10 个 `npm run test:*` 脚本不存在 | package.json:13；全仓无 tsconfig.check 引用；AUDIT.md 多处 | lint 扩到 server/scripts；加 `typecheck` script；补 test:* 脚本或改文档 |
| 16 | verify 脚本 19 个三轨制（6 个依赖活 dev server + 真实凭据、4 个自起临时 DATA_DIR、7 个直连数据层），无统一 runner、无 CI | verify-auth/fk/concurrency/save-failure.mjs 硬编码 127.0.0.1:3000 | 11 个自包含脚本统一进 `npm test:server`，6 个改造为自起临时端口 |
| 17 | `xlsx@0.18.5`（停更 + 已知 CVE）在依赖中；唯一使用点 excelParser.ts 无消费者 | package.json:51；src/utils/excelParser.ts:7 | 服务端已用 exceljs，浏览器解析迁移后删除 |
| 18 | 工作区改动未提交；`requests.http` 含真实调试密码，直接提交会入库 | git status：M server.ts/package.json/.gitignore + ?? 新文件 | 拆分提交（接线/env/文档），requests.http 密码改占位符 |
| 19 | `shadcn` CLI 在 dependencies（纯构建期工具） | package.json:47 | 移到 devDependencies 或 npx |

---

## 四、P2 — 建议修（择要）

1. **事务覆盖不全**：departments 树更新、roles 重写、anomalies 重写、employee-departmentId 维护均无事务（departmentsDb.ts:58-113、attendanceDb.ts:294-302、db.ts:262-282）——对比 attendanceDb.ts:101-111 / documentsDb.ts:87-101 已有正确范式，统一补 BEGIN/COMMIT/ROLLBACK。
2. **乐观锁"有名无实"**：version 列只自增，upsert 无 `WHERE version = ?`、不接收 expectedVersion，replaceRecords 仍整表覆盖（attendanceDb.ts:92-125,179-195）——接口收 `expectedVersion`，不匹配返 409。
3. **错误/分页形状不统一**：错误体三种（authGate 带 code / authRouter 只有 error / auditRouter 405 带 code）；5xx 直泄 `e?.message`（含 SQL 报错）；分页两种信封（audit-logs 的 limit/offset vs 业务 page/pageSize）；todos/notifications/schedules/folders 完全不分页；attendance/departments 手写校验未接 zod（validation.ts:132 的 documentUpdate 形同虚设）。
4. **token 经 `?access_token=` 对任意 /api 兜底传入**（authMiddleware.ts:162-164，应仅限 `/files/`、`/backup/export/`）；审计事件 status 固定 200 导致失败事件 result=success（authMiddleware.ts:66-74 + auditDb.ts:220）。
5. **`/api/files` inline 下载 + 无 nosniff** 构成存储型 XSS 面（documentsRouter.ts:149-153）——默认 attachment 或按 MIME 白名单；CSV 导出加公式注入前缀防御（auditRouter.ts:72-82）；restoreBackup 的 copyFileSync 非原子（backupDb.ts:162-171，改临时文件 + rename）。
6. **aiRouter 外呼无超时/取消**，`/models` 存在受控 SSRF（aiRouter.ts:63-70,215-236）——fetch 加 `AbortSignal.timeout`。
7. **`calculateYearsOfService` 3 个测试失败的根因（已人工复核）是实现 bug 而非测试错**：实现返回小数（dateUtils.ts:17-24，空值返回 `'0.0'`），测试与 UI 主约定是"X年Y个月"/`'-'`（dateUtils.test.ts:8,15,19）；且 UserTable.tsx:139-152 自算一份、UserDetailModal.tsx:207 直接显示小数，三处已不一致——按测试修实现，两处组件改调 util。
8. **死代码/残留**：services/attendance.ts 整文件、userApi.getUserList/getUserInfo（路径 `/users` 与形状 `{list}` 双错）、types/attendance 的 AttendanceRecord、SystemLogs 假种子日志（"数据库连接超时"会误导运维，useLogStore.ts:21-44）、mockApi 与 useDocumentStore 重复的递归删除逻辑；generateIdCard 假身份证号**仅进 mock 数据流**（未泄漏真实流，但会随 mock 员工进入打印/导出预览）。
9. **Attendance Table 过重**：394 行全项目最大组件、4 tab × 22 个 Pick 型 props 钻透、手写表格（他处用 react-table）、useExport 两段 ~35 行 iframe 打印逻辑复制；`@tanstack/react-virtual` 声明未使用。
10. **AI Studio 模板残留**：README 原文、metadata.json、replace-aliases.cjs、tmp/、vite.config.ts 乱码注释、`backupRopter` 拼写、`name:"ams-frontend"`、无 engines 字段、.env.example 与 DOCKER.md 环境变量表脱节、api.ts:8 "Python backend" 陈旧注释（AUDIT 声称修过但没修）。
11. **node:sqlite 同步模型阻塞面**（设计取舍）：大 JSON（attendance 20mb limit）、VACUUM INTO、copyFileSync 均同步执行，期间事件循环停摆——大操作错峰即可，暂不必换架构。

---

## 五、真实的亮点（改造中应保留的资产）

- **认证体系**：scrypt 参数化摘要 + timingSafeEqual；账号不存在也跑 dummy scrypt 防枚举；token 只存 SHA-256；空闲 8h + 绝对 7d 双过期、滑动续期不越上限；失败 5 次起指数锁定；降权/停用即时吊销全部会话；首启随机口令写 0600 凭据文件（authDb.ts:92-141, 362-417, 458-500）。
- **声明式 RBAC**：默认拒绝 + PUBLIC_PATHS 白名单 + POLICIES 自上而下命中即止；强制改密期只放行改密/登出（authMiddleware.ts:89-150, 200-206）。
- **SQL 注入面干净**：全量核对无用户输入拼接 SQL；`${}` 仅出现在服务端常量表名/字段白名单（aiContext.ts:14-23、migrate.ts:91-94、db.ts:201-207）。
- **数据层**：user_version 幂等迁移 + 重建表带 FK + `_new` 残表兜底；WAL；`wal_checkpoint(TRUNCATE)` + `VACUUM INTO` 热备、恢复前安全备份、连接热重载钩子（db.ts:21-50、backupDb.ts:75-174）；文档删除"先提交事务后删磁盘"；上传流中断清理半截文件。
- **审计脱敏**：密码/token 类置"[已脱敏]"、证件/手机掩码、大字段折叠、append-only 且 DELETE 一律 405（auditDb.ts:62-143、auditRouter.ts:98-103）。
- **AI 侧**：上下文只取聚合不 dump 敏感字段；对话按 username 强制隔离（aiContext.ts:1-33、aiDb.ts:30-45）。
- **前端工程习惯**：路由级懒加载齐全、严格模式 0 个 `any`、15 处 addEventListener 全部成对清理、createAsyncAction 统一 loading/error、saveFailure 兜底与拦截器 reject 形状精确对齐、统一 sonner toast、DOMPurify 用于合同模板、exceljs 不进前端 bundle。

---

## 六、与作者既有文档的对照

- **docs/AUDIT.md**（2026-07-31，宣称 27 项修 26 项）：修复成果真实存在于 server/ 各模块，但**在当前入口链路上 P0-1（沙箱）、P1-5（审计网关）、P1-6（主题持久化）、P3-1（错误处理）均未生效**；文末自己记录的"4 个验证脚本依赖活 dev server + 凭据文件"的遗留问题依旧。
- **docs/ROADMAP.md**：定位"人事档案+基础考勤"，规划 R1 审批流、R2 员工自助门户为最高优先——与本报告判断一致：**先接通已有能力，再谈行政闭环**。
- **docs/DOCKER.md**：描述的部署形态（node:22 单容器 + 命名卷 + HEALTHCHECK）是正确目标，但仓库里的 Dockerfile 与之完全不符（见 P1-13）。
- **docs/VISUAL_AUDIT.md**：设计令牌迁移记录状态纪律良好，可作为前端改造时的回归参考。

## 七、已验证基线（2026-09-13，Node 26.8.2）

- `GET /api/health` → `{"status":"ok"}`；无 Token → 401；登录 → 签发 Token；带 Token 访问 employees/departments/todos/audit-logs → 200 返回种子数据。
- 热重载：改 server.ts → tsx watch 自动重启，登录会话跨重启有效（SQLite 持久化）。
- `npm run test:run`：**39 通过 / 3 失败**，失败全部为 `dateUtils.test.ts` 的 calculateYearsOfService（根因见 P2-7，上游既有问题）。

## 八、改造路线图建议

| 批次 | 内容 | 工作量 |
|---|---|---|
| ① 安全对齐 | server.ts 内联模板端点 → templateStore+scriptSandbox+excelReplay；挂载 auditGate、errorHandler、startBackupScheduler、pruneAuditLogs、uploadsCleanup；themes 走 settingsDb；HOST 默认 127.0.0.1；上传字节上限；删 GEMINI define/@google/genai/README 残留 | ~1 天 |
| ② 前后端接通 | Login 接真实登录 + 强制改密流转；登出调后端 + persist 隔离；员工/部门/考勤/待办/通知切真实 API（统一 items/total 信封、/users→/employees）；挂载 4 个死面板与 AiAssistant；Dashboard 接真数据；修 withAuthToken | 2-4 天 |
| ③ 数据一致性 | 补事务；乐观锁落地（expectedVersion + 409）；错误/分页形状统一；files 下载 attachment+nosniff；CSV 公式防御 | 1-2 天 |
| ④ 工程化 | lint 覆盖 server/scripts；typecheck 接入；11 个自包含 verify 脚本统一 runner 进 CI；重写 Dockerfile；vitest 增加 node project 承接数据层测试；移除 xlsx | ~1 天 |
| ⑤ 功能演进 | 按 ROADMAP.md（2026-09-22 收口版）优先 N1 考勤数据源接入 + N2 审批流引擎化 + N3 员工自助门户；R1 审批流与"档案柜变办事大厅"这一步已落地为四类固定流程 | 按规划 |

> **实施进度**（随改造更新）：
> - **① 安全对齐 ✅ 已完成**（2026-09-14）：沙箱守门脚本 41/41 通过，审计网关实测留痕，主题持久化跨重启验证通过。
> - **② 前后端接通 ✅ 已完成**（2026-09-14）：真实登录/强制改密页/登出吊销链全通；员工挂载路径按作者原始约定纠正为 `/api/users`；员工/部门/考勤/待办/通知五个域切真实 API；四个死面板 + AI 助手 + 后端状态指示器挂载；Dashboard 真实统计；浏览器冒烟通过（未登录重定向 → 登录 → 真实数据渲染）。**过程中发现并修复**：未读通知创建失败引发的 401 无限错误循环（addNotification 改为静默降级）；考勤 Excel 导入确认为后端功能缺口（前端假数据已移除、如实提示待开放）。
> - **③ 数据一致性 ✅ 已完成**（2026-09-14）：departments 树/职位替换、anomalies 整表替换、员工-部门外键维护补齐事务；考勤排班/打卡 upsert 落地乐观锁（expectedVersion + 409 VERSION_CONFLICT，前端接口已预留参数）；errorHandler 对 5xx 只返回通用文案（细节落服务端日志），employees/audit/backup 路由 500 出口统一走 serverErrorResponse；`/api/files` 下载改 attachment + nosniff（堵存储型 XSS）；审计 CSV 导出加公式注入防御；restoreBackup 改临时文件 + 原子 rename；aiRouter 三处外呼加 AbortSignal.timeout；query token 收窄到三个文件下载路径；审计事件的 status 传真实值（登录失败/越权正确记为 failure）。
> - **④ 工程化 ✅ 已完成**（2026-09-14）：`npm run lint` 覆盖全仓（React 规则限定 src）、`npm run typecheck` 接入 client+server 双检查、`npm run test:server` 统一 runner 跑 11 个自包含验证脚本（**11/11 通过**）；Dockerfile 重写为 node:22-bookworm-slim 单容器（与 compose/DOCKER.md 对齐，nginx.conf 已删）；xlsx（停更+CVE）移除；shadcn 降级为 devDependencies（`src/index.css` 通过 `@import 'shadcn/tailwind.css'` 引用其样式预设，非死依赖——曾误删导致样式编译失败，已按上游锁定版本 4.1.0 恢复）；AI Studio 残留（metadata.json/replace-aliases.cjs/tmp）清理；engines 声明 node>=22.9、项目更名 ams、.env.example 补全环境变量表；vitest 拆分 client(jsdom)/server(node) 双 project，新增 settingsDb 服务端单测。**已知债**：全仓 lint 现有 193 个 error（163 个为 no-explicit-any，均为上游既有代码，属首次全量 lint 暴露的真实债务）。
> - **⑤ 功能演进 ✅ R1/R2 最小闭环已交付**（2026-09-14）：`/api/approvals` 请假申请审批流 v1 上线——员工自助提交（authGate POLICIES 对 POST /approvals 放行 EMPLOYEE）、HR+ 审批（requireRole 双重防御）、重复决定 409 防并发双审、决定后自动通过通知中心告知申请人、auditGate 自动留痕；前端新增「审批中心」页面（自助表单 + 我的申请 + 待我审批）。完整多级审批链、审批模板、撤回等留待 R1 后续迭代。
> - **防死 UI 结构性保障 ✅**（2026-09-14）：新增 `server/tests/ui-reachability.test.ts`（断言每个页面入口/设置面板/顶层组件都被引用，「import 了但没渲染」也会被拦——已做变异验证）；新增 GitHub Actions CI（typecheck/lint/vitest/test:server 四道闸门，lint 因既有债务暂非阻塞）。**PageContainer（新增 width 参数，10 个页面完成接线）与 Permission（元素级权限门，4 处纯条件渲染完成接线）双双下线豁免**；遗留：系统日志页假数据待切 auditApi、文档模块待切真实上传。
> - 文档与脚本同步：requests.http 增补审批用例；verify-indexes（v5）、verify-upload-stream（413 语义）、verify-error-handler（_dev_error 开关）三个脚本已与最新代码对齐。
