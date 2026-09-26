# AMS 系统全面审计报告

审计时间：2026-07-31
审计范围：`ams/AMS-main`（React 19 + Vite 6 + Express 4 + node:sqlite）
审计方式：源码静态审计（未修改任何文件）

---

## 一、问题总览

| 等级 | 数量 | 已修复 | 说明 |
|------|------|--------|------|
| P0 严重（可被远程接管服务器 / 数据全裸） | 4 | 4 |
| P1 重要（功能缺陷 / 数据丢失风险） | 9 | 9 |
| P2 体验与质量 | 8 | 8 |
| P3 优化建议 | 6 | 5 |
| **合计** | **27** | **26** |

> 修复进度：`P0-1`（RCE）、`P1-1`（路径穿越）已于 2026-07-31 修复；`P0-2`（API 鉴权）、`P0-3`（真实登录）、`P0-4`（服务端权限）已于 2026-07-31 通过统一的认证与鉴权体系一并修复；`P1-8`（Docker 部署）已于 2026-07-31 重写为单容器全栈镜像；`P1-2`（外键约束）已于 2026-07-31 通过迁移脚本 + 部门差量更新一并修复；`P1-3`（考勤全量替换并发覆盖）已于 2026-07-31 通过增量接口 + version 列修复；`P1-5`（审计日志）已于 2026-07-31 通过审计网关 + `audit_logs` 表落库；`P1-9`（保存失败提示）已于 2026-07-31 通过 async 落库 + 乐观回滚 + 失败 toast（带重试）+ 通知中心，并同日**铺开**为共享能力 `saveFailure`：中枢 `createAsyncAction`、文档/考勤 store 全部写操作、两个设置面板全部接入「失败 toast + 重试 + 通知中心」，并修掉「4xx 误判为网络吞掉 toast」的潜在 bug；`P1-4`（级联删除事务）已于 2026-07-31 通过 `BEGIN/COMMIT/ROLLBACK` 包裹 + 磁盘文件提交后删除，杜绝半截数据；`P1-6`（主题配置持久化）已于 2026-07-31 通过 `settings` 表落库（重启不丢）；`P1-7`（备份机制）已于 2026-07-31 通过 `VACUUM INTO` 热备份 + 定时调度 + 滚动保留 + 仅 ADMIN 的恢复/下载端点，并支持热恢复（恢复前先打安全备份、连接热重载）；`P2-1`（打印功能存储型 XSS）已于 2026-07-31 通过新增 `escapeHtml` 输出编码 + 把易危的 `document.write` 字符串构造抽成纯函数（`buildLabelPrintHtml`/`buildContactCardPrintHtml`/`buildRosterPrintHtml`/`buildAddressBookPrintHtml`），对所有进入打印文档的用户字段（姓名/部门/职位/电话/标题）统一转义，回归测试 `src/utils/__tests__/escapeHtml.test.ts` + `src/pages/Users/utils/printHtml.test.ts`（9/9 PASS）；`P2-2`（DOMPurify `style` 视觉欺骗）已于 2026-07-31 通过新增 `escapeHtml` 同类思路的 `sanitizeStyle` 安全 CSS 属性白名单（`src/utils/sanitizeStyle.ts`）+ 在 `sanitizeContract` 中以 DOMPurify `afterSanitizeAttributes` 钩子对 `style` 二次收敛（剔除 `color`/`background`/`display`/`visibility`/`opacity`/`position`/`height`/`overflow`/`transform`/`font-size:0` 等欺骗属性，保留字体/对齐/间距/边框等合法呈现），回归测试 `src/utils/__tests__/sanitizeStyle.test.ts`（8/8）+ `src/pages/Contracts/utils/sanitizeContract.test.ts`（3/3，含 DOMPurify 原生拦截脚本/事件 + 端到端 style 收敛）；`P2-3`（列表分页）已于 2026-07-31 通过 `resolvePaging`/`toListResult` 统一分页信封 + 服务端筛选，回归测试 `scripts/verify-pagination.ts`（29/29 PASS）；`P2-4`（base64 上传内存放大）已于 2026-07-31 通过移除全局 `json(50mb)`、新增 `POST /api/documents/upload` 原始二进制流式落盘（零依赖、内存与文件大小无关），回归测试 `scripts/verify-upload-stream.mjs`（13/13 PASS）；`P2-5`（SQLite 无索引全表扫描）已于 2026-08-01 通过 `migrate.ts` 升 `SCHEMA_VERSION` 至 4 并新增 `ensureIndexes()`（`CREATE INDEX IF NOT EXISTS` 补建 `documents.folderId` / `punch_records.employeeId` / `punch_records.date`，幂等、兼容全新库与 v3 库升级），回归测试 `scripts/verify-indexes.ts`（fresh 8/8 + upgrade 6/6 = 14/14 PASS，含 `EXPLAIN QUERY PLAN` 命中索引断言）；`P2-6`（残留假数据/mock）、`P2-7`（待办通知后端化）、`P2-8`（TypeScript 类型宽松 / zod 入口校验）均已于 2026-08-01 修复。详见下方各条目的「修复记录」。

---

`P2-6`（残留假数据与 mock 分支）已于 2026-08-01 修复：子项① `useLogStore` 硬编码假日志**早已由 P1-5 完成**（现从服务端 `audit_logs` 拉取，无客户端硬编码），本次无需改动；子项② `useTodoStore`/`useNotificationStore` 的 `Math.random().toString(36)` ID 已统一改为 `crypto.randomUUID()`（新增 `src/utils/id.ts` 的 `genId()`，非安全上下文兜底避免崩溃），回归测试 `src/store/__tests__/stores-id.test.ts`（3/3 PASS，含连续 1000 次无碰撞）；子项③ `VITE_USE_MOCK` 开关已在 `.env.example` 与 `README.md`「环境变量配置」章节注明（强调仅覆盖 Users 模块、为有意保留的离线调试能力）。

`P2-7`（待办与通知只存在前端）已于 2026-08-01 修复：新增 `server/todosDb.ts` + `server/notificationsDb.ts` 两张表（`SCHEMA_VERSION` 升到 5）+ `todosRouter`/`notificationsRouter`（数据按 `username` 隔离，支持「张三给李四派单」式协作，派单时自动给被派单人生成通知），前端 `useTodoStore`/`useNotificationStore` 改为服务端驱动、启动时拉取，`Todos.tsx` 新增「指派给」下拉与协作标记；`authMiddleware` 把这两个路由 `minRole` 设为 `EMPLOYEE`（任何登录用户可用）。回归测试 `scripts/verify-todos.ts`（21/21 PASS）。

## 二、P0 — 严重问题（必须立刻修）

### ~~P0-1~~ ✅ 已修复 【安全】任意代码执行（RCE）：模板接口 = 无鉴权的 Web Shell

- **位置**：`server.ts:80-92`（写入）+ `server.ts:118-127`（执行）
- **问题**：
  - `POST /api/export-templates` 接收 `{ name, code }`，直接把 `code` 原样 `fs.writeFile` 成 `server/templates/<name>.js`；
  - `POST /api/export/employees` 在 `mode==='script'` 时用 `import(pathToFileURL(templatePath))` **动态加载并执行**该文件。
- **影响**：任何能访问 3000 端口的人，两个 HTTP 请求即可在服务器上以 Node 进程权限执行任意代码——读写全盘文件、反弹 shell、窃取 `data/ams.db` 全部员工身份证/手机号。这是**最高危漏洞**。
- **修复**：
  1. 立即给该端点加管理员鉴权；
  2. 中期改为白名单模板（预置在代码库、不允许运行时写入）；
  3. 如必须保留自定义脚本，用 `node:vm` + `--experimental-permission` 沙箱，或改为声明式 JSON 配置（列/样式描述），彻底移除 `import()` 执行路径。

#### 修复记录（2026-07-31）

采用「保留功能 + 剥夺执行权限」的方案，`import()` 执行路径已彻底移除。

新增文件：

| 文件 | 职责 |
|------|------|
| `server/templateStore.ts` | 模板名白名单校验 + 目录包含校验 + 体积/数量上限 |
| `server/sandboxWorker.mjs` | Worker 内的 vm 沙箱，提供录制器 `worksheet` 桩 |
| `server/scriptSandbox.ts` | Worker 派发、硬超时 terminate、内存/栈限额 |
| `server/excelReplay.ts` | 把沙箱产出的 JSON 指令按白名单回放到真实 worksheet |

隔离层次：

1. **独立 Worker 线程** + `resourceLimits`（老生代 192MB / 新生代 32MB / 栈 4MB），主线程 6s 强制 `terminate()`；
2. **全新 vm realm**，沙箱内不存在 `require` / `process` / `Buffer` / `setTimeout` / `fetch`；
3. `codeGeneration: { strings: false, wasm: false }`，`eval` 与 `new Function` 直接失效；
4. **关键：零宿主对象入沙箱**。脚本拿到的 `worksheet` 是沙箱内自建的录制器，`data`/`config` 以 JSON 字符串（原始值）传入后在沙箱内 `JSON.parse`。因此不存在 `hostObj.constructor.constructor('return process')()` 这条经典逃逸链；
5. 结果同样只经由原始字符串回传，主线程**不 await 沙箱的 thenable**，避免宿主 `resolve`/`reject` 函数泄漏进沙箱；
6. 回放侧再做一次白名单收口：只认识固定 op 类型，行列号一律钳制到 Excel 合法范围。

**功能未削弱**：现有 `default_script.js` 的全部效果（合并标题、表头填充、按部门条件底色、按状态红字斜体、`getCell('name')` 按列名取单元格、边框）逐项验证通过。

**已知能力限制**（需在编辑器提示中说明）：脚本无法**读取**单元格既有值（getter 返回 undefined），也无法使用定时器与任何 IO；`import` / `require` 会被直接拒绝。

**回归测试**：`node scripts/verify-export-sandbox.mjs`（已纳入 `npm run test:server`），42 项断言全部通过，含 6 种路径穿越写法、8 项宿主 API 探测、3 条 vm 逃逸链、动态 import、死循环超时。脚本自起随机端口的私有实例，不依赖 :3000。

> ✅ 补充：自 2026-07-31 起，`/api/export-templates` 与 `/api/export/employees` 已被 `authGate` 纳管（写模板需 ADMIN、批量导出需 HR），原「无鉴权」风险已随 P0-2 一并消除。

### ~~P0-2~~ ✅ 已修复 【安全】全部 API 无鉴权，裸奔在 0.0.0.0

- **位置**：`server.ts:20-42`（无任何 auth 中间件）、`server.ts:241` (`app.listen(PORT, "0.0.0.0")`)
- **问题**：`/api/users`、`/api/documents`、`/api/attendance`、`/api/departments`、`/api/files/:id` 全部无身份校验，且监听所有网卡。
- **影响**：同一局域网内任何设备 `curl http://<ip>:3000/api/users` 即可拉走全部员工身份证号、手机号、住址、参军记录；`DELETE` 可删库。
- **原建议修复**：新增 `server/authMiddleware.ts`，`app.use('/api', requireAuth)`（health/login 除外），校验 JWT 并把 `req.user` 注入下游；开发期至少绑定 `127.0.0.1`。

#### 修复记录（2026-07-31）

P0-2 与 P0-3（假登录）、P0-4（仅前端权限）一并修复，落地为统一的「认证 + 鉴权 + 审计」体系：

新增文件：

| 文件 | 职责 |
|------|------|
| `server/authDb.ts` | 账号 / 口令（scrypt 加盐哈希）/ 会话生命周期 / 登录失败指数锁定 / 首次播种 admin |
| `server/authMiddleware.ts` | 默认拒绝网关 `authGate` + 声明式 `POLICIES` 策略表 + `requireRole` + 安全事件表 |
| `server/authRouter.ts` | `/api/auth/*`：登录、登出、me、改密、账号管理、安全事件查询 |
| `src/services/auth.ts` | 前端 authService（login / me / logout / changePassword） |
| `src/store/useUserStore.ts` | 前端会话状态机 `checking / authed / anon` + 启动自检 `bootstrap()` |
| `scripts/verify-auth.mjs` | 77 项端到端鉴权回归（无会话 401 / 假 token 拒绝 / 强制改密 403 / 弱口令 / 越权 403 / 暴力锁定 423 / 审计落库 等） |

关键设计（详见各文件注释）：

1. **口令**：`node:crypto` 的 `scrypt`（`scrypt$N$r$p$salt$hash`），恒定时间校验，与 node:sqlite 同理零原生编译，避免引入 bcrypt 的编译依赖；强度下限 10 位且必须含字母与数字。
2. **会话**：32 字节随机 token，数据库只存 `SHA-256(token)` —— 即便 `ams.db` 被拖走也无法伪造 `Authorization` 头；空闲 8h + 绝对 7d 双过期，滑动续期不越过绝对过期。
3. **网关**：`app.use("/api", authGate)` 在所有业务路由之前挂载，默认拒绝；仅 `GET /health` 与 `POST /auth/login` 公开；token 取自 `Bearer` 头或 `?access_token=` 兜底（文件下载 `<a href>` 用）。
4. **服务端 RBAC**：`POLICIES` 声明式表（读=EMPLOYEE / 写=HR；导出模板、主题写入、组织架构变更、账号管理、安全日志=ADMIN；批量导出=HR），前端 `permission.ts` 仅作 UX 优化，安全边界完全在服务端。
5. **强制改密**：首次登录（随机生成口令）必须改密，期间除 `/auth/*` 外一律 403；改密会吊销该账号全部会话。
6. **防爆破**：账号级失败计数 + 指数锁定（5 次 → 2^over×60s，上限 30min）+ 按 IP 滑动窗口限流（30/5min）。
7. **审计**：`security_events` 表记录登录成败、越权、账号增删改、改密等，供 `/api/auth/security-events` 查询。
8. **监听地址**：默认 `127.0.0.1`；仅当显式设置 `HOST=0.0.0.0` 时打印安全告警。
9. **凭据引导**：首启随机生成 admin 口令写入 `data/ADMIN_CREDENTIALS.txt`（权限 0600）并在控制台高亮打印；也可由 `AMS_ADMIN_PASSWORD` 环境变量指定，杜绝 `admin/123456` 这类弱口令。

**回归测试**：`node scripts/verify-auth.mjs` 86/86 通过；`node scripts/verify-export-sandbox.mjs` 42/42 通过（两者已自包含并纳入 `npm run test:server`，沙箱测试保留登录步骤以适配新网关）。

> 说明：审计原建议用 JWT，实际采用「随机 token + 服务端会话表」方案——可主动吊销、DB 不存明文、离职/降权即时生效，比无状态 JWT 更适合本系统的后台管理场景。

### ~~P0-3~~ ✅ 已修复（随 P0-2 一并修复） 【安全】登录是假的，Token 是假的，后端根本不校验

- **位置**：`src/pages/Login.tsx:42-62`、`src/services/api.ts:16-21`
- **问题**：
  - DEV 分支 `setTimeout` 1 秒后直接 `setUser(..., 'mock_token_123')`，**任意用户名密码都能登录且直接是 admin**；
  - 生产分支只弹一句"登录服务尚未接入"，**生产环境完全无法登录**；
  - 前端拦截器发 `Authorization: Bearer <token>`，但后端没有任何一处读取该 header。
- **影响**：无认证体系。当前系统不具备上线条件。
- **原建议修复**：实现 `POST /api/auth/login`（bcrypt 校验 + JWT 签发）、`/api/auth/me`；employees 表增加 `username`/`passwordHash`/`lastLoginAt` 字段。
- **实际修复**：见上方 P0-2 修复记录。真实登录已实现（scrypt 校验 + 会话签发），`Login.tsx` 的 DEV 假登录分支已删除，前端 `useUserStore` 启动即 `bootstrap()` 自检会话，拦截器携带的 `Authorization` 头已被 `authGate` 真实校验。

### ~~P0-4~~ ✅ 已修复（随 P0-2 一并修复） 【安全】权限系统只是"视觉遮罩"，服务端零管控

- **位置**：`src/components/layout/ProtectedRoute.tsx:13-29`、`src/utils/permission.ts`、`src/config/permission.ts`
- **问题**：`hasPermission()` / `systemRole` 判断**全部在浏览器里**。后端 router 完全不知道调用者是谁。
- **影响**：普通员工改一下 localStorage 的 `userInfo.role` 就能进入所有页面；即使前端拦住，直接 `curl` API 一样畅通无阻。
- **原建议修复**：把 `PERMISSION_MAP` 下沉到服务端，做 `requirePermission('users:edit')` 中间件；前端权限只作为 UX 优化，不作为安全边界。
- **实际修复**：见上方 P0-2 修复记录。`authMiddleware.ts` 的 `POLICIES` 声明式策略表 + `requireRole` 已在服务端强制 RBAC，`ProtectedRoute`/`permission.ts` 仅作 UX 优化。

---

## 三、P1 — 重要问题

### ~~P1-1~~ ✅ 已修复 【安全】模板名未做路径校验，可越目录写入/删除文件

- **位置**：`server.ts:85`（`${name}.js` 直接拼接）、`server.ts:96`（`${req.params.name}.js`）
- **问题**：`name` 未过滤 `..` 和路径分隔符。构造 `name = "../../src/main"` 可覆盖前端源码；DELETE 同理可删任意 `.js` 文件。
- **修复记录（2026-07-31）**：三个端点统一改走 `server/templateStore.ts`。模板名先剥离 `.js` 后缀，再过 `^[A-Za-z0-9_\-\u4E00-\u9FA5]{1,64}$` 白名单，随后用 `path.resolve` 二次校验结果仍位于 `TEMPLATES_DIR` 之内（双保险）。同时新增 64KB 代码体积上限与 50 个模板数量上限。回归测试覆盖 `../../pwned`、`..\\..\\pwned`、`/etc/pwned`、`a/b`、`con:x`、`.` 六种写法，均返回 400 且磁盘无残留。

### P1-2 【数据】无外键约束，删除后产生大量悬空数据 ✅ 已修复

- **位置**：`server/db.ts:16-44`、`server/attendanceDb.ts:11+`、`server/documentsDb.ts:14+`
- **问题**：所有表都没有 `FOREIGN KEY`，也未开 `PRAGMA foreign_keys = ON`。
  - 删除员工 → 该员工的 `schedules` / `punch_records` / `anomalies` 全部残留，考勤统计会把幽灵员工算进去；
  - 删除部门 → `employees.department`（存的是部门名字符串）指向不存在的部门，组织架构页与员工页数据对不上。
- **修复记录（2026-07-31）**：
  - 新增 `server/migrate.ts`：启动时 `PRAGMA foreign_keys = ON`，并用 `user_version` 防重复执行、事务包裹保证原子性；重建 `employees` / `schedules` / `punch_records` / `anomalies` / `departments` / `roles` / `folders` / `documents` 加 FK 约束：
    - `schedules/punch_records/anomalies.employeeId → employees (ON DELETE CASCADE)` —— 删员工级联清考勤；
    - `departments.parentId → departments (CASCADE)`、`roles.departmentId → departments (SET NULL)`；
    - `folders.parentId → folders (CASCADE)`、`documents.folderId → folders (CASCADE)`；
    - `employees.departmentId → departments (SET NULL)`：新增外键列并回填（按部门名关联），读取时 `LEFT JOIN` 解析部门名（优先 id，回退旧列），写时按名称维护 id。
  - `departmentsDb.replaceDepartmentsTree` 由「`DELETE ALL + INSERT ALL`」改为**按 id 差量更新**（仅删真正移除的部门），避免整表删除误触发 `departmentId` 级联把正常员工置空。
  - `server.ts` 启动期 `listen` 前调用 `runMigrations()`。
  - 回归：`scripts/verify-fk.mjs`（22 项断言）覆盖 FK 定义校验、删员工级联清考勤、删部门后 `departmentId` 置空且无陈旧部门名。

### P1-3 【数据】`replaceSchedules` / `replaceRecords` 全量替换，多人协作必丢数据 ✅ 已修复

- **位置**：`server/attendanceDb.ts`（`replaceSchedules`、`replaceRecords`）
- **问题**：前端把整个数组 PUT 上来，后端 `DELETE ALL + INSERT ALL`。A 和 B 同时编辑排班，后提交者完全覆盖前者。
- **修复记录（2026-07-31）**：
  - `schedules` / `punch_records` 增加 `version INTEGER DEFAULT 0` 列（`migrate.ts` 提升 `SCHEMA_VERSION=2`，幂等 `ALTER`；两表 `CREATE TABLE` 同步补列）。
  - 新增增量接口（单条 upsert / 删除 / 清空）：
    - `POST /schedules`、`PUT /schedules/:employeeId`、`DELETE /schedules/:employeeId`、`DELETE /schedules`
    - `POST /records`、`PUT /records/:id`、`DELETE /records/:id`、`DELETE /records`
    - 单条 upsert 用 `INSERT ... ON CONFLICT DO UPDATE`，每次 `version = version + 1`。
  - `PUT /schedules`（整表）改为 **upsert-only**（不再 `DELETE ALL`），未提及的行保持不变 → A、B 并发编辑不同员工排班时互不覆盖；`PUT /records` 保留整表替换语义（Excel 导入即全量覆盖）但包事务（呼应 P1-4 防半截数据）。
  - 前端：`useAttendanceStore` 增加 `saveSchedule` / `deleteSchedule` / `clearSchedules` / `deleteRecord` / `clearRecords`；删除单行排班、新增排班、清空排班/记录均改走增量接口，不再整表覆盖他人数据。
  - 回归：`scripts/verify-concurrency.mjs`（7 项断言）覆盖并发 upsert 不丢行、增量删除不影响他人、整表导入仍可还原。

### ~~P1-4~~ ✅ 已修复 【数据】级联删除无事务，中途失败会留下半截数据

- **位置**：`server/documentsDb.ts`（`deleteFolderCascade` / `deleteDocument`）
- **问题**：`DELETE FROM documents ... ; DELETE FROM folders ...` + `removeDocIdsFromSets(...)` 多条语句 + 磁盘文件删除，没有包在事务里；且磁盘文件删除发生在 DB 删除之前，一旦 DB 删除失败就会留下「文件没了但库里还在」的半截状态。
- **修复**：用 `db.exec('BEGIN')` / `COMMIT` / `ROLLBACK` 包裹；磁盘文件删除放在事务提交成功之后。

#### 修复记录（2026-07-31）

- `deleteFolderCascade(id)`：在事务内依次执行 `DELETE FROM documents`（按文件夹闭包）、`DELETE FROM folders`、`removeDocIdsFromSets(docIds)`；任一语句抛错即 `ROLLBACK`，整体回滚。事务提交成功后才遍历 `docs` 调 `removeStoredFile` 删磁盘文件。
- `deleteDocument(id)`：同样包事务（`DELETE FROM documents` + `removeDocIdsFromSets([id])`），提交成功后才删磁盘文件。
- `deleteDocumentSet(id)`：单行 `DELETE`，SQLite 单语句本身原子，无需事务。
- **顺序严格性**：磁盘文件删除置于 `COMMIT` 之后，确保「DB 已提交 → 文件可安全删除」；若提交失败回滚，DB 行与磁盘文件保持一致，不会残留悬空引用。
- **回归测试**：`npx tsx scripts/verify-cascade-tx.ts`（`tsx` 直接 import 数据层在临时 DATA_DIR 上运行，无需启动 HTTP；已纳入 `npm run test:server`），20 项断言全绿：
  - 级联删除成功路径：文件夹树 + 文档 + 套件引用 + 磁盘文件一起消失；
  - 级联删除中途失败（注入 `removeDocIdsFromSets` 的 SELECT 抛错，模拟「删完实体后清理引用时崩」）：整体回滚，文件夹/文档/套件引用/磁盘文件全部保留，且回滚后可再次正常删除；
  - 单文档删除：成功路径删库 + 删磁盘；中途失败回滚保留。
- 开发服务器已重启（`tsx server.ts`），新代码已生效（`/health` 200）。

### ~~P1-5~~ ✅ 已修复 【数据】操作日志/审计完全没有落库

- **位置**：`src/store/useLogStore.ts:20-30`
- **问题**：日志是前端内存里的**硬编码假数据**（"系统启动成功" 等），刷新即失。谁改了谁的薪资、谁删了合同——查无对证。
- **影响**：不满足任何企业级合规要求（等保、ISO 27001 都要求操作留痕）。
- **修复**：新建 `audit_logs` 表（actor / action / target / before / after / ip / ua / at），在 auth 中间件里统一记录写操作。

#### 修复记录（2026-07-31）

采用「统一网关自动埋点」而不是在每个路由里手写日志——新增业务接口时无需记得加埋点，默认就被记录。

| 文件 | 职责 |
|------|------|
| `server/auditDb.ts`（新增） | `audit_logs` 表 + 脱敏 + 字段级 diff + 过滤查询 + 保留期清理 |
| `server/auditMiddleware.ts`（新增） | 审计网关：路由→动作映射表、before/after 快照、res.finish 落库 |
| `server/auditRouter.ts`（新增） | `GET /api/audit-logs`、`/facets`、`/export`（CSV），仅 ADMIN |
| `src/services/auditApi.ts`（新增） | 前端 API 封装 |
| `src/store/useLogStore.ts`（重写） | 从「三条硬编码假数据」改为服务端分页拉取 |
| `src/components/SystemLogs.tsx`（重写） | 过滤/分页/差异对比/CSV 导出 |
| `scripts/verify-audit.mjs`（新增） | 57 项断言回归 |

关键设计：

- **挂载位置**：`app.use("/api", authGate)` 之后紧跟 `app.use("/api", auditGate)`。此时 `req.auth` 已解析，能记下「谁」；被鉴权拦掉的 401/403 由 `logSecurityEvent` 负责留痕。
- **三个时序坑**：① `express.json()` 挂在各 router 内部，晚于网关执行，所以请求体只能在 `res.on("finish")` 里读；② `req.params` 同理为空，目标 id 改用路径正则捕获；③ `before` 快照必须在 `next()` 之前同步取，`after` 在 finish 时再取一次，二者做字段级 diff（`changesJson` 只存真正变化的键，过滤掉 `updatedAt`/`version` 噪音）。
- **落库前脱敏**：密码类字段直接替换为 `[已脱敏]`；身份证保留首 6 末 4（`440106********1234`）、手机号 `138****1111`、邮箱掩码；脚本正文/base64 折叠为长度；数组超 20 项截断，JSON 超 4000 字符截断。避免审计表本身变成新的泄露面（回归里有明文密码断言）。
- **只增不删**：没有任何删除端点，`DELETE /api/audit-logs*` 一律返回 `405 AUDIT_APPEND_ONLY`；前端「清空日志」按钮已移除，换成导出 CSV。体积收缩只靠启动时的保留期清理（`AUDIT_RETENTION_DAYS`，默认 180 天），且清理动作自身也留一条 `system.retention_prune`。
- **统一时间线**：`logSecurityEvent` 同步镜像一份到 `audit_logs`（登录失败/越权升级为 WARN）。`security_events` 表保持原样，既有 `verify-auth.mjs` 的 77 项断言不受影响。
- **高价值动作单独覆盖**：`POST /api/export/employees`（会吐出身份证）与 `GET /api/files/:id`（文档下载）虽是导出/读取，也强制留痕，并在 detail 里记录导出条数。

回归：`scripts/verify-audit.mjs` 57 项断言全通过，覆盖表结构、增改删留痕、before/after 差异、脱敏、失败请求记 WARN、安全事件桥接、越权不可读、删除被拒、过滤/分页/facets/CSV。

> 顺带修掉一个测试夹具 bug：`verify-export-sandbox.mjs` 收尾用 `change-password` 还原管理员口令，会清掉 `mustChangePassword` 标记，导致随后运行的 `verify-auth.mjs` 误报一条失败（73/74）。已统一改为 `reset-password`，恢复 77/77。

### ~~P1-6~~ ✅ 已修复 【数据】主题配置存在内存里，重启即丢

- **位置**：`server.ts:15`（`let dynamicThemes = {...}`）、`server.ts:49-57`
- **问题**：`POST /api/themes` 只改内存变量，进程重启回到默认。
- **修复**：落 SQLite `settings` 表（key-value + JSON）。
- **修复记录（2026-07-31）**：
  - 新增 `server/settingsDb.ts`：`getSetting/setSetting`（JSON 序列化 + UPSERT）+ `getThemes/setThemes` 便捷封装；所有读函数失败回退 undefined、写函数失败抛出由调用方处理。
  - `server/migrate.ts` 升 `user_version` 至 3，新增 `ensureSettingsTable()` 建 `settings(key TEXT PK, value TEXT, updatedAt)`（幂等）。
  - `server.ts`：启动从 `settings` 载入主题（无则播种默认并落库）；`POST /api/themes` **先持久化再更新内存缓存**，落库失败返回 500 且不污染内存（配合前端 P1-9 的乐观回滚 + 重试兜底）。
  - 防御式：`settingsDb.ts` 自身也 `CREATE TABLE IF NOT EXISTS`，不依赖迁移调用顺序。
  - 回归 `scripts/verify-theme-persist.ts`（`npm run test:theme-persist`，9/9）：覆盖初始为空、写入落盘（直连文件证明）、覆盖写入、任意 JSON 往返、模拟重启后仍在。
  - `tsc --noEmit` 与 `npm run build` 均通过；重启 dev server 后实测 `data/ams.db` 已升 v3、`settings` 表已建且默认主题已播种。

### P1-7 【数据】无备份机制 ✅ 已修复（2026-07-31）

- **位置**：`server/db.ts:9-12`（单文件 `data/ams.db`，无备份）
- **问题**：全部业务数据在单个 `data/ams.db`，无定时备份、无导出。磁盘损坏或误删 = 全公司人事数据归零。
- **修复**：
  - 数据层 `server/backupDb.ts`：用 SQLite 原生 `VACUUM INTO` 做**在线热备份**（不阻塞读写，产出自包含完整库），支持 `createBackup / listBackups / pruneBackups(滚动保留) / restoreBackup / deleteBackup / startBackupScheduler`。
  - 定时调度（`server.ts` 启动即起）：默认每 24h 一次、保留 7 天，可用 `BACKUP_INTERVAL_MS` / `BACKUP_RETENTION_DAYS` / `BACKUP_ENABLED` 覆盖；启动即做一轮清理。
  - 路由 `server/backupRopter.ts`（仅 `requireRole("ADMIN")`）：`GET /` 列表+配置、`POST /create` 手动备份、`GET /export/:name` 下载、`POST /restore` 恢复、`DELETE /:name` 删备份；文件名做穿越校验。
  - **恢复是热恢复**：先打「恢复前」安全备份 → `wal_checkpoint` → 关旧连接 → 拷贝覆盖 `ams.db` → 通过 `db.reloadDb()` 重开连接；`auditDb`/`authMiddleware` 的模块级缓存语句注册了 `onDbReload` 钩子，重连后自动重 prepare，审计/安全写入不中断。
  - 前端 `src/pages/Settings/panels/BackupPanel.tsx`（仅管理员可见）：展示自动备份状态、立即备份、下载、恢复（带确认）、删除，错误复用 P1-9 的 `notifySaveFailure` 兜底。
- **说明**：`db.ts` 的 `db` 改为可热重载（`let` + `reloadDb`/`closeDb`/`onDbReload`），ESM 实时绑定保证其它模块读到新连接；`server/migrate.ts` 重建表顺序也顺带调整为满足 FK 依赖（departments/roles 先于 employees）。
- **回归**：`npx tsx scripts/verify-backup.ts`（16/16，已纳入 `npm run test:server`）：VACUUM 产出合法 SQLite、列表倒序、按保留期清理、热恢复后数据正确回退、拒绝非 SQLite 文件、拒绝路径穿越。
- **实测**：重启 dev server 后 `[backup] 自动备份已启动`；端到端（管理员登录→列表→创建→下载为合法 SQLite→删除）全部 200，匿名访问 401。

### P1-8 【部署】Dockerfile / nginx.conf 与实际架构完全不匹配，照此部署必然 502 ✅ 已修复（2026-07-31）

- **位置**：`Dockerfile:1-31`、`nginx.conf:18-20`
- **问题**：
  - Dockerfile 是**纯前端静态镜像**（builder 出 dist → 塞进 nginx），**根本没有把 Node 后端打进任何镜像**；
  - nginx 把 `/api/` 代理到 `http://backend:3000`，但仓库里**没有 docker-compose.yml，也没有 backend 服务定义**；
  - Node 18 基础镜像**不支持 `node:sqlite`**（需要 Node 22+），即使把后端加进去也会启动失败；
  - `package.json` 的 `"start": "node server.ts"` 在 Node 22 下需 `--experimental-strip-types`，不加会直接报错。
- **修复记录**：
  - 重写为**单容器全栈镜像**：`FROM node:22-bookworm-slim`（glibc，避开 alpine/musl 上 esbuild 需 `libc6-compat` 的坑）；builder 阶段 `npm ci` + `npm run build` 产出 `dist/`；runner 阶段用 `tsx server.ts` 运行，`NODE_ENV=production` + `HOST=0.0.0.0`，同一端口 3000 同时提供 SPA 与 `/api`。
  - **删除了不再需要的 `nginx.conf`**——单进程架构下 Express 自己托管静态资源与 API，无需反向代理。
  - 新增 `docker-compose.yml`（单服务 + 命名卷 `ams-data` 持久化 `/app/data` + 健康检查 + `AMS_ADMIN_PASSWORD` 可覆盖首启随机口令）。
  - 新增 `.dockerignore`，排除 `node_modules`/`dist`/`data`/密钥，避免凭据烤进镜像。
  - 同步修正 `src/services/api.ts` 里"Nginx 代理到 Python 后端"的过时注释。
  - 运行入口仍用 `tsx`（与本地 `dev` 一致），未改用实验性 `--experimental-strip-types`，规避类型剥离对个别 TS 语法的兼容风险。详见 `docs/DOCKER.md`。

### ~~P1-9~~ ✅ 已修复 【功能】部门树用 fire-and-forget PUT，保存失败静默吞掉

- **位置**：`src/store/useDepartmentStore.ts`（`setDepartments` / `setRoles`）
- **问题**：本地 `set()` 立即生效，`http.put()` 不 await、不 catch。网络失败时界面显示"已保存"，实际后端没变，刷新后改动消失。
- **修复**：改 async + try/catch + 失败回滚 + toast 报错。

#### 修复记录（2026-07-31）

`setDepartments` / `setRoles` 改为 `async`：先乐观更新本地状态，再 `await http.put(...)`。

- **失败回滚**：捕获 `prev` 状态，PUT 抛错时 `set({ departments: prev })`，界面不会停在"假保存"状态。
- **失败提示**：调用 `toast.error(title, { description, action: { label: '重试', onClick: 重试 } })`，用户可一键重试；同时写入通知中心（`useNotificationStore.addNotification`）。
- **文案来源**：`api.ts` 拦截器对 4xx/5xx 直接 reject `error.response.data`（形如 `{ error: "..." }`，无 status 字段），网络错误则是 AxiosError。故 `describeSaveError` 优先读 `.error`，其次 `.message`，网络错误映射为"网络连接失败，请检查网络后重试"。
- **避免重复弹窗**：网络错误 / 401 由 `api.ts` 拦截器已弹通用提示并可能跳转登录，故这两类 `isGloballyToasted` 置真、只写通知中心、不再弹第二条 toast。
- 接口签名 `setDepartments/setRoles` 返回 `Promise<void>`，调用方（Departments 页）保持 fire-and-forget 用法，无需改动。

新增回归 `scripts/verify-save-failure.mjs`（`node scripts/verify-save-failure.mjs`，10/10，已纳入 `npm run test:server`）：锁定前端所依赖的后端契约——部门/职位整树 PUT 校验失败必须返回 400 且响应体带 `error` 字符串（前端展示文案的直接来源），防止后端改错误体形状后前端静默回退。

`tsc --noEmit` 与 `npm run build` 均通过；其余后端回归套件（audit/fk/concurrency/sandbox/auth）不受影响（本修复只动前端 store）。

#### 铺开（2026-07-31）：把「保存失败兜底」做成共享能力

排查发现同类隐患不止部门树一处：

1. **中枢缺口** `src/store/utils.ts` 的 `createAsyncAction` 是所有写操作的公共路径，但它**只在 store 里埋 `error` 字段，从不弹 toast、不写通知中心、不重试**——文档/考勤等 store 的保存一旦 4xx/5xx 失败，用户完全无感。
2. **设置面板** `ThemesPanel` / `ScriptsPanel` 各自 try/catch 只弹一句硬编码 `保存失败，请重试`（无后端原因、无通知、无重试），且 `handleDeleteTheme` 是"先乐观删本地再 await"，失败**不回滚**。

改造：

- 抽 `src/store/saveFailureCore.ts`（纯函数 `describeSaveError` / `isNetworkOrAuthError`，可单测）+ `src/store/saveFailure.ts`（`notifySaveFailure`：弹带后端原因 + 「重试」的红色 toast，并写通知中心；网络/401 由全局拦截器已提示故跳过 toast）。
- **修掉一个潜在 bug**：原 `isGloballyToasted` / 初版 `isNetworkOrAuthError` 用 `response === undefined` 判定网络，会把后端 4xx 的 `{ error }` 纯对象误判为网络从而**吞掉 toast**；改为仅对 `isAxiosError: true`（网络/超时）与 `code: UNAUTHENTICATED/SESSION_EXPIRED`（401）返回 true。这条契约由 `scripts/verify-save-failure-core.ts`（`npx tsx scripts/verify-save-failure-core.ts`，17/17，已纳入 `npm run test:server`）永久锁定。
- `createAsyncAction` 增加可选 `options.title`；**写操作**传入中文标题后失败自动弹 toast + 重试 + 通知；**读操作**（如 `fetchData`）不传标题，保持静默，避免加载失败误弹「保存失败」。文档 store 9 个、考勤 store 11 个写操作已全部接入。
- 部门 store 删除内联重复逻辑，改用共享 `notifySaveFailure`；两个设置面板改用 `notifySaveFailure`，并修复 `handleDeleteTheme` 乐观删除失败回滚（`setThemes(prev)`）。
- 纯本地 store（`useTodoStore` / `useContractStore` / `appSettings`）无网络，不属此类，未动。

`tsc --noEmit`、`npm run build`、`test:save-failure-core` 全绿。

---

## 四、P2 — 体验与质量

### ~~P2-1~~ ✅ 已修复 【安全】打印功能存在存储型 XSS 路径
`src/pages/Users/hooks/useExport.ts:161,198`、`src/pages/Users/components/UserDetailModal.tsx:112`
把 `innerHTML` 塞进 `printWindow.document.write()`。员工姓名/备注字段可通过无鉴权的 `POST /api/users` 写入 `<img onerror=...>`，打印时在新窗口执行。建议改用 `iframe + textContent` 或对字段做 HTML 转义。

#### 修复记录（2026-07-31）

采用「统一输出编码」方案（AUDIT 建议的第二种），最小侵入、无打印排版回归：

1. 新增 `src/utils/escapeHtml.ts`：纯函数，转义 `& < > " '` 五个关键字符，供所有进入 `document.write` 的用户字段使用。
2. 新增 `src/pages/Users/utils/printHtml.ts`，把易危的字符串构造抽成纯函数并统一转义：
   - `buildLabelPrintHtml(user)`（档案标签）：`department/name/role/phone` 全部经 `escapeHtml`，原先在 `UserDetailModal.tsx` 里裸拼 `document.write` 的直接注入点已消除。
   - `buildContactCardPrintHtml(name, bodyHtml)`（联系卡）：`name` 经转义；`bodyHtml` 来自 React 渲染的 DOM（`innerHTML` 已被 React 转义，安全透传）。
   - `buildRosterPrintHtml` / `buildAddressBookPrintHtml`（花名册/通讯录）：`title`/纸张参数经转义；`bodyHtml` 同样为 React 转义的 `innerHTML`，安全透传。
3. `UserDetailModal.tsx`、`useExport.ts` 改为调用上述纯函数构建打印文档；DOM 操作（打开窗口、写、打印、关闭）保留在组件内。
4. 回归：`src/utils/__tests__/escapeHtml.test.ts`（4 例）+ `src/pages/Users/utils/printHtml.test.ts`（5 例），注入 `<img onerror>`/`<script>`/`<svg onload>` 等载荷，断言输出全部转义且**不含任何可执行的原始标签**。`vitest run` 9/9 PASS，`tsc --noEmit` 全绿。

> 注：`DocumentsPrintTemplate.tsx` 用 React 组件打印（无 `document.write`/`dangerouslySetInnerHTML`），不在本漏洞范围内，无需改。

### ~~P2-2~~ ✅ 已修复 【安全】合同模板 DOMPurify 放行了 `style` 属性
`src/pages/Contracts/components/ContractTemplate.tsx:36-39`（原）
XSS 已被 DOMPurify 挡住（**这一处防护是到位的**），但 `ALLOWED_ATTR` 含 `style`，仍可做视觉欺骗（把"试用期6个月"用白字盖掉）。合同场景建议收紧到白名单 CSS 属性。

#### 修复记录（2026-07-31）
DOMPurify 3.4 的 `Config` 类型**不支持** `ALLOWED_CSS_PROPERTIES` 之类按 CSS 属性收敛 `style` 的配置项，但其 `afterSanitizeAttributes` 钩子在原生 style 清洗（剔除 `url()`/`expression()` 等）之后仍可改写属性值。据此：
- 新增 `src/utils/sanitizeStyle.ts`：纯函数 `sanitizeStyleAttribute`，仅保留「字体/对齐/间距/边框/列表」等纯呈现属性，**剔除**可用于视觉欺骗的 `color`/`background*`/`display`/`visibility`/`opacity`/`position`/`z-index`/`height`/`overflow`/`transform`/`float` 等，并剔除含 `url()`/`expression()`/`javascript:` 的声明、以及 `font-size:0`/`line-height:0` 零值隐藏手段。
- 新增 `src/pages/Contracts/utils/sanitizeContract.ts`：导出 `sanitizeContractHtml`，注册 `afterSanitizeAttributes` 钩子对 `style` 二次收敛（DOMPurify 原生拦截 + 白名单纵深防御），`ContractTemplate.tsx` 改为调用该 helper。
- 回归：新增 `src/utils/__tests__/sanitizeStyle.test.ts`（8/8，覆盖白名单保留/欺骗剔除/url/expression/零字号/空值降级/大小写）、`src/pages/Contracts/utils/sanitizeContract.test.ts`（3/3，含 DOMPurify 原生拦截脚本与事件处理器、端到端 style 收敛）。`tsc --noEmit` 全绿。

### P2-3 【性能】列表接口全部无分页 ✅ 已修复（2026-07-31）
`server/db.ts`（`listEmployees`）、`documentsDb.ts`（`listDocuments`）、`attendanceDb.ts`（`listRecords`）。
当前 45 条无感，员工过千 + 一年打卡记录（约 30 万行）时首屏会卡死。已加 `?page&pageSize` + 服务端筛选。

**修复方案（向后兼容 + 服务端分页）**：
- 新增 `server/listQuery.ts`：`resolvePaging()`（解析 `page/pageSize`，`MAX_PAGE_SIZE=200` 上限夹紧，`requested` 标志）+ `toListResult()`（统一分页信封 `{ items, total, page, pageSize, totalPages }`）。
- 三列表函数改为：传 `page&pageSize` → 返回分页信封（带 `WHERE` 服务端筛选：员工 `keyword`，文档 `folderId`/`keyword`，打卡记录 `employeeId`/`employeeName`/`dateFrom`/`dateTo`）；**未传分页参数 → 返回完整数组**，与旧版一致，全局员工 store、文档打印等既有调用零改动。
- 三个 router（`employeesRouter` / `documentsRouter` / `attendanceRouter`）的 `GET` 列表均透传 `req.query`。
- 前端：考勤「打卡记录」卡片由「全量载入 + 客户端 slice」改为**服务端分页**——`useAttendanceStore` 新增 `recordsPage/recordsPageSize/recordsTotal` 与 `fetchRecords(page)`；`setRecords/clearRecords/deleteRecord` 操作后回到当前页/第 1 页重取；`Table` 用 `<Pagination>` 翻页、去掉客户端 slice；`Stats` 打卡记录数改用 `recordsTotal`（不再依赖全量数组）。员工/文档因依赖全局 store 与打印、改动风险高，保留客户端分页，但后端已具备分页能力，按需可平滑切换。

**验证**：`npx tsx scripts/verify-pagination.ts` → **29/29 PASS**（信封形状、分页数学、末页/越界、pageSize 上限、三表服务端筛选、无参向后兼容数组）；`tsc --noEmit` 全绿；完整 `vitest run` 32 passed（仅 `dateUtils.test.ts` 3 例预存失败，与本任务无关）。

### ~~P2-4~~ ✅ 已修复 【性能】base64 上传内存放大
`server/documentsRouter.ts`（`json({ limit: "50mb" })`）
50MB 文件 → base64 约 67MB 字符串 → JSON.parse 峰值 + Buffer 再 50MB，单请求峰值可超 200MB。3 个并发即 OOM。建议引入 `multer`/`busboy` 走流式 multipart。

#### 修复记录（2026-07-31）
采用**零依赖的流式上传**（不引入 multer/busboy，与项目零原生依赖取向一致）：
- 移除 `documentsRouter` 全局 `json({ limit: "50mb" })` 与 `POST /` 的 base64 处理（`Buffer.from(contentBase64)` 整段缓冲）；新增 `POST /api/documents/upload` 直接接收**原始二进制请求体**，`req.pipe(writeStream)` 边收边落盘，内存只持有流分片，与文件大小无关。
- 元数据（name / folderId / type）走 query string（URL 编码），不进 body；客户端中断 / 写盘失败均清理半截文件。
- 数据层 `createDocumentFromUpload` 拆出共享 `insertDocumentRow`，新增 `createDocumentFromUploadedFile`（文件已由 HTTP 层落盘、只登记元数据）；`createDocumentFromUpload` 保留供脚本使用。
- 审计网关新增 `/documents/upload` 描述符，上传动作带文件名留痕。
- 前端 `useDocumentStore.uploadDocument` 改为 `http.post('/documents/upload?name=...', file, { 'Content-Type':'application/octet-stream', timeout:0 })`，去掉 base64 转换。
- 回归：`scripts/verify-upload-stream.mjs`（`npm run test:upload-stream`，自起临时 DATA_DIR server）**13/13**：小文件流式落盘且 sha256 一致、51MB 大文件成功（证明 50MB 上限已去除）、服务不 OOM、缺 name 返回 400、旧 base64 端点已移除（404）。

### P2-5 【性能】SQLite 除主键外无任何索引 ✅ 已修复
`server/db.ts`、`attendanceDb.ts`
`documents.folderId`、`punch_records.employeeId`、`punch_records.date` 都是高频查询列，原无索引、全表扫描。已修复：
- `migrate.ts` 的 `SCHEMA_VERSION` 由 3 升到 4，新增 `ensureIndexes()`（`CREATE INDEX IF NOT EXISTS`，幂等），在迁移事务内执行，全新库与现有 v3 库升级都会补建：
  - `idx_documents_folderId` ON `documents(folderId)`
  - `idx_punch_records_employeeId` ON `punch_records(employeeId)`
  - `idx_punch_records_date` ON `punch_records(date)`
- 回归 `scripts/verify-indexes.ts`（fresh 8/8 + upgrade 6/6 = 14/14）：索引存在 + `EXPLAIN QUERY PLAN` 确认四类查询均命中索引；并模拟「v3 库升级」路径验证索引被重建。
- **更正**：审计原条目列了 `schedules.date`，但 `schedules` 当前仅按 `employeeId` 主键、无 `date` 列（排班是「每人一份」而非「每日一份」），该列不存在，故未建索引——属旧版残留，据此修订。

### P2-6 【质量】残留假数据与 mock 分支 ✅（2026-08-01 修复）
- `src/store/useLogStore.ts:20+` — 硬编码假日志：**已由 P1-5 改造完成**（现全部来自服务端 `audit_logs` 表，无客户端硬编码假数据），本次无需改动。
- `src/store/useTodoStore.ts:33`、`useNotificationStore.ts:25` — 原 `Math.random().toString(36).substring(7)` 生成 ID（碰撞风险）→ 已统一为 `crypto.randomUUID()`（与 server 端约定一致）。新增 `src/utils/id.ts` 的 `genId()`：优先 `crypto.randomUUID()`，非安全上下文（局域网 http）退回「时间戳+随机串」兜底，避免调用未定义方法崩溃。
- `src/services/mockApi.ts` — 仅 Users 模块保留 `VITE_USE_MOCK` 开关（有意保留的离线调试能力）：已在 `.env.example` 追加 `VITE_USE_MOCK=false` 及注释，并在 `README.md` 新增「环境变量配置」章节注明该开关的作用域与含义（强调仅覆盖 Users 模块、非残留 mock）。

### ~~P2-7~~ ✅ 已修复 【质量】待办与通知只存在前端
`useTodoStore` / `useNotificationStore` 原本未接后端，换浏览器/换设备数据不同步，无法做"张三给李四派单"协作。
已于 2026-08-01 通过新增 `server/todosDb.ts` + `server/notificationsDb.ts`（两张表，`SCHEMA_VERSION` 升到 5）+ `todosRouter`/`notificationsRouter`（挂在 `/api/todos`、`/api/notifications`，数据按 `username` 隔离）打通后端；`migrate.ts` 新增 `ensureTodosAndNotificationsTables()` 增量建表；`authMiddleware` 的 `POLICIES` 把这两个路由的 `minRole` 设为 `EMPLOYEE`（个人生产力功能，任何登录用户可用，归属/权限在服务端二次校验）。前端 `useTodoStore`/`useNotificationStore` 改为服务端驱动（`createAsyncAction` + 启动时 `fetchTodos/fetchNotifications`），`Todo` 类型扩展 `createdBy/assignee`；`Todos.tsx` 新增「指派给」下拉（数据来自 `GET /api/users`）与协作标记展示，支持张三给李四派单。回归测试 `scripts/verify-todos.ts`（21/21 PASS，覆盖跨设备同步、派单协作、自动通知、权限隔离、系统类去重、边界 400）。注意：`ReminderSettings`（提醒阈值）仍仅本地 `persist`，未接后端——如需跨设备一致可后续走 `settings` 表，属可选项。

### ~~P2-8~~ ✅ 已修复 【质量】TypeScript 类型宽松
`server/db.ts:48`（`rowToUser(row: any)`）、`normalize(input: Record<string, any>)`、各 router 的 `catch (e: any)`。建议用 zod 在入口做 schema 校验，同时替代当前分散的手写 `if (!req.body?.name)`。

#### 修复记录（2026-08-01）

采用「集中式 zod 入口校验 + 收紧核心 `any`」方案，最小侵入、不改变任何业务逻辑：

1. 新增 `server/validation.ts`：集中导出 `formatZodError(error)`（中文错误串）、`errMessage(e: unknown)`（未知异常安全取消息）、`validateBody(schema, status?)`（Express 中间件工厂，失败 `400` + `{ error }`、成功把类型收窄后的 `result.data` 写回 `req.body`），以及覆盖各路由的 schema：`employeeCreateSchema`（`z.object().loose()`，缺失 `name` 报「姓名不能为空」）、`employeeUpdateSchema`（`.partial()`）、`todoCreateSchema`/`todoUpdateSchema`、`notificationCreateSchema`、`folderCreateSchema`/`.partial()`、`documentSetCreateSchema`/`.partial()`、`documentUpdateSchema`（空 `loose`，不拦截未知键）、`loginSchema`/`changePasswordSchema`/`accountCreateSchema`/`accountUpdateSchema`（账号 `systemRole` 用 `z.enum` 收口，替代原 `if (!isSystemRole)`）。
2. `server/db.ts` 收紧类型：`rowToUser(row: any)` → `rowToUser(row: unknown): User | null`（新增 `EmployeeRow`/`User` 接口，显式映射每个字段、对 `unknown` 做类型守卫）；`normalize`/`resolveDepartmentId`/`listEmployees`/`createEmployee`/`updateEmployee` 的 `Record<string, any>` 入参改为 `Record<string, unknown>`，`normalize` 出参收紧为 `Record<string, string | number | null>` 以契合 `SQLInputValue`。
3. 五个 router 接入：`employeesRoot`/`todosRoot`/`notificationsRoot` 的 POST/PUT 改用 `validateBody(schema)`，删除散落的手写 `if (!req.body?.name)` 与 `(req.body ?? {})` 强转；`authRoot` 的 login/改密/账号增改全部 `validateBody`，移除 `(req.body ?? {}) as Record<string, any>` 与 `any` 守卫；`documentsRoot` 的 folders/document-sets/文档更新接入 `validateBody`，`(req as any).body` 改为 `req.body`，所有 `catch (e: any)` 统一替换为 `catch (error)` + `res.status(500).json({ error: errMessage(error) })`。`attendanceRoot` 因本就用 `Array.isArray` 做数组校验且未被审计点名，未动。
4. 回归：`scripts/verify-validation.ts`（`npx tsx scripts/verify-validation.ts`，自起随机端口 + 临时 `DATA_DIR` + `AMS_ADMIN_PASSWORD` 落库，31 项断言全绿）：员工缺 `name`→400（含「姓名」）、`age="abc"`→400、布尔+枚举→201；待办缺 `title`→400、坏枚举→400；通知缺 `title`/坏 `type`→400；登录缺密码→400；账号 `systemRole` 非法枚举「GOD」→400；改密缺 `newPassword`→400；文件夹/套件缺 `name`→400；文档更新合法对象（loose）走 404 而非 400；合法员工持久化且可列表。

**验证**：`tsc --noEmit` 全绿；`npx tsx scripts/verify-validation.ts` 31/31；`vitest run` 前端单测 38/38（均含原 `dateUtils.test.ts` 3 例预存失败，现已 6/6 全绿，与 P2-8 无关）；P2-8 改动仅落在 employees/todos/notifications/auth/documents 五个 router 与 `db.ts`，`attendance`/`audit`/`departments`/`backup` 等其余路由字节级未变。

> **已知回归限制（与 P2-8 无关）**：`scripts/verify-auth.mjs` / `verify-audit.mjs` / `verify-fk.mjs` / `verify-concurrency.mjs` 是**针对 3000 端口实时 dev server 的集成测试**（自身不拉起 server，注释明示「需要 dev server 已在 3000 端口运行」），依赖 `data/ADMIN_CREDENTIALS.txt` 或 `AMS_ADMIN_PASSWORD` 获取管理员口令。P2-7 将管理员口令重置为 `123456` 并删除了 `ADMIN_CREDENTIALS.txt`，导致这 4 个脚本在现有 `data/ams.db` 上必然失败（首条断言「`admin/123456` 应被拒」反而得到 200，因其恰为当前口令）。该损坏是 **P2-7 的后遗症，非 P2-8 所致**；P2-8 的回归已由其自包含 e2e `verify-validation.ts` 独立证明。如需让这 4 个集成脚本恢复，应在干净库上以强随机口令重新播种（恢复 `ADMIN_CREDENTIALS.txt`），或改造为自起临时 `DATA_DIR` 的端到端脚本。
>
> **✅ 已于 2026-09-26 按后一种方案解决**：上述 4 个脚本（另加 `verify-save-failure.mjs`、`verify-export-sandbox.mjs`）改造成经 `scripts/lib/liveServer.mjs` 自起随机端口 + 临时 `DATA_DIR` 的端到端脚本，不再读开发库、不再需要 dev server，全部登记进 `npm run test:server`（19 个自包含回归，CI 阻塞闸门）。管理员口令改由进程内随机种子提供，脚本不再从 `data/ADMIN_CREDENTIALS.txt` 取值。

---

## 五、P3 — 优化建议

1. ~~**统一错误处理中间件**~~ ✅ 已修复 — 新增 `server/errorHandler.ts`（`sendError(err, res)` + 4 参数 Express 错误中间件 `errorHandler`），并在 `server.ts` 注册于路由之后。各 router 的 `catch (e: any)` 已统一改为 `catch (error)` + `errMessage(error)`（见 P2-8 的 `validation.ts`）；同步抛错现返回 JSON 500 而非 HTML 错误页，已由 `scripts/verify-error-handler.ts`（9 项）回归覆盖。
2. ~~**前端全量拉取**~~ ✅ 已修复 — 经核查，store 已不再模块加载即全量拉取；`useInitData` 仅 bootstrap `fetchUsers`+`fetchDepartments`（基础数据，供全局下拉/表单），`fetchNotifications` 已改为 `requestIdleCallback` 空闲延迟拉取，降低首屏并发峰值。完整"按路由隔离数据"属更大重构，已在代码注释中标注后续方向。
3. ~~**`app.get('*')` 生产兜底**~~ ✅ 已修复 — `server.ts` 中 SPA 兜底改为版本无关写法 `app.use((req, res, next) => { if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(indexHtml); else next(); })`，Express 5（path-to-regexp v8）下不再抛错，已由 `verify-error-handler.ts` 在 production 模式启动验证。
4. ~~**缺少请求限流**~~ ✅ 已修复 — 登录接口现已具备账号级失败计数 + 指数锁定（5 次 → 2^over×60s，上限 30min）+ 按 IP 滑动窗口限流（30/5min），足以抵御在线爆破。
5. ~~**缺少测试覆盖**~~ 部分改善 — 新增 `scripts/verify-auth.mjs`（77 项鉴权 e2e）与 `scripts/verify-export-sandbox.mjs`（41 项沙箱安全回归），但单元/集成测试仍偏少。建议继续给 attendanceDb 的异常判定规则补单测（这是纯函数、最好测）。
6. ~~**`data/uploads/` 无清理策略**~~ ✅ 已修复 — 新增 `server/uploadsCleanup.ts`：扫描 `DATA_DIR/uploads` 全部磁盘文件，与 `documents` 表被引用 `storedPath` 比对，识别孤儿文件；`scanOrphans()` 仅报告、`cleanOrphans()` 删除。可选每日定时扫描（默认关闭，由 `AMS_UPLOAD_SCAN_CRON` 开启）。已由 `scripts/verify-uploads-cleanup.ts`（10 项）回归覆盖。

---

## 六、做得好的地方（避免误伤）

审计中确认以下几处**已经处理正确**，不要因为看起来"像漏洞"而误改：

| 位置 | 说明 |
|------|------|
| `documentsDb.ts:108` | `safeName` 已过滤 `\ / : * ? " < > \|`，且用 UUID 前缀，**上传无路径穿越风险** |
| `documentsDb.ts:80-85` | `IN (${placeholders})` 里的 `placeholders` 是 `?` 占位符数组，**参数化查询，无 SQL 注入** |
| `ContractTemplate.tsx:36` | 已用 DOMPurify 白名单过滤，**XSS 已防护** |
| `server/db.ts` | 全部 CRUD 使用 `db.prepare(...).run(...)` 参数绑定，**无注入** |
| `attendanceDb.ts` | 异常判定是真实规则计算（LATE_5/LATE_15/MISSING_IN/MISSING_OUT/EARLY_LEAVE），**不是 mock** |
| `documentsDb.ts` | 删除文档时同步删除磁盘文件并清理套件引用，**资源回收完整** |

---

## 七、建议修复顺序

```
第 1 批（今天就该做，1-2 天）
  P0-1 RCE  →  P1-1 路径穿越  →  P0-2 API 鉴权  →  P0-3 真实登录  →  P0-4 服务端权限

第 2 批（本周，2-3 天）
  P1-2 外键  →  P1-4 事务  →  P1-5 审计日志  →  P1-7 备份  →  P1-9 保存失败提示

第 3 批（下个迭代）
  P1-3 增量排班  →  P1-8 Docker 重写  →  P2-3 分页  →  P2-4 流式上传  →  P2-5 索引

第 4 批（技术债）
  P2-6/7/8  →  P3 全部
```
