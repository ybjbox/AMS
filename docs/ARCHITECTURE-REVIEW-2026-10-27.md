# 系统功能模块审查报告

日期：2026-10-27 ｜ 范围：`E:\AMS` 全系统前后端 ｜ 基线：`1717052` ｜ 审查方法：`analyze-code` 技能 + 模块依赖图 + 行数/入度统计 + 单测/e2e

## 1. 方法与证据

- **技能**：`analyze-code`（代码分析：正确性、类型、可观测性、模块化与演进风险）。
- **证据**：
  - 后端 26 个 `/api` 挂载点（`server.ts:161-186`）；
  - 后端本地 import 入度统计（`db.ts` 48、`sqliteUtil` 30、`authDb`/`validation` 14、`localDate` 13、`attendanceDb` 9）；
  - 前后端文件行数（后端 20,981 行 / 前端页面 6,278 行 / 组件 3,848 行 / services 2,040 行）；
  - 单测 114 文件 / 912 例、e2e 33 例、构建与类型检查。
- **说明**：这是**模块级架构审查**，不评价视觉还原度（另有 Design QA 报告）。

## 2. 现状模块结构

```text
浏览器
├─ 公开页：Login / Claim
├─ 员工门户：MyPortal（/my 四 Tab，独立外壳）
└─ HR 后台：Layout + Header/Sidebar
   └─ 19 个页面 → 12 个 store / 14 个 hooks → 25 个 service → api.ts → /api

服务端（模块化单体）
server.ts
├─ authGate → auditGate → 26 个资源 Router
└─ 领域数据层（*Db）→ db.ts → node:sqlite
```

### 2.1 后端域清单

| 域 | 主要模块 | 职责 | 对外接口 | 主要依赖 |
| --- | --- | --- | --- | --- |
| 平台/基础设施 | `db.ts`、`migrate.ts`、`validation.ts`、`sqliteUtil.ts`、`localDate.ts`、`errorHandler.ts`、`instanceLock.ts`、`health.ts` | 建库/迁移、通用校验、错误处理、实例锁、健康检查 | `/api/health`、内部共享 | 全站（`db.ts` 入度 48） |
| 认证与身份 | `authDb`、`authRouter`、`authMiddleware`、`claimsDb`、`permissionCatalog`、`rolePermissions`、`capabilities`、`rolePermissionsRouter` | 登录/会话/账号、认领发身份、能力矩阵与鉴权 | `/api/auth/*`、`/api/role-permissions` | `db`、`validation`、`audit` |
| 组织与员工 | `employeesRouter`、`departmentsRouter`、`departmentsDb`、`employeeImportDb`、`importJobsDb`、`contractRenewalsDb` | 员工档案、部门/职位、导入任务、合同续签 | `/api/users`、`/api/departments` | `db`、`validation`、`attendance`（考勤页联查） |
| 考勤 | `attendanceDb`（1210 行）、`attendanceRouter`、`attendanceImportDb`、`attendanceDayVerdicts`、`shiftMatch`、`shiftRulesDb`、`attendanceProofSheet`、`excelReplay`、`myRouter`、`employeeCopy` | 打卡记录、班次/排班、判定装配、导入、校对表、员工自助 | `/api/attendance/*`、`/api/my/*` | `db`、`departments`、`validation`、`approvals` |
| 审批 | `approvalsDb`、`approvalsRouter`、`approvalTypes` | 请假/补卡/转正/离职/加班、台账、领域动作 | `/api/approvals/*` | `attendanceDb`、`notificationsDb`、`overtime` |
| 文档与打印 | `documentsDb`、`documentsRouter`、`foldersRouter`、`documentSetsRouter`、`filesRouter`、`documentPrint`、`businessFormsDb/Router` | 文件/套件/文件夹、A4 打印、业务单据 | `/api/documents`、`/api/folders`、`/api/files`、`/api/form` | `db`、`settings`、打印模板 |
| 通知 | `notificationsDb`（站内）、`notificationsRouter`、`notifyDb`（出站通道）、`notifyRouter`、`notifyDispatch`、`remindersDb` | 站内通知、Webhook/SMTP 出站、到期提醒 | `/api/notifications`、`/api/notify`、`/api/reminders` | `db`、`settings` |
| AI | `aiRouter`（890 行）、`aiGate`、`aiContext`、`ai_*` 表/客户端 | 对话、模型配置、配额、上下文 | `/api/ai/*` | `db`、`outbound`、`auth` |
| 备份 | `backupDb`（755 行）、`backupArchive`、`backupRopter`、`restore` | 备份/恢复、zip 归档、导出导入 | `/api/backup/*` | `db`、uploads/templates |
| 企微 | `wecomDb`、`wecomClient`、`wecomSync`、`wecomRouter` | 绑定、拉取打卡、同步游标 | `/api/wecom/*` | `attendanceDb`、`outbound` |
| 审计/系统 | `auditDb`、`auditMiddleware`、`auditRouter`、`systemRouter`、`statsRouter`、`settingsDb`、`announcementsDb/Router`、`savedItemsDb/Router`、`todosRouter` | 审计留痕、诊断、统计、设置、公告、个人条目 | `/api/audit-logs`、`/api/system`、`/api/stats`、`/api/announcements` | 全站 |

### 2.2 前端模块分层

| 层 | 模块 | 职责 | 依赖方向 |
| --- | --- | --- | --- |
| 路由/外壳 | `App`、`Layout`、`Header`、`Sidebar`、`ProtectedRoute`、`ErrorBoundary`、`Permission` | 路由、导航、权限门、错误边界 | → pages / store |
| 页面 | 19 个 page（Approvals 745、MyPortal 716、BusinessForms 598、Claim 593、WeChatNotice 513 为大头） | 业务编排与页面状态 | → hooks / store / components |
| 组件 | `components/*`、`ui/*`、`Pressable`、`Skeleton`、`BaseModal` | 可复用 UI 与交互原语 | → lib / store |
| 状态 | 12 个 store | 领域缓存与乐观更新 | → services |
| 服务 | 25 个 resource service | 一对一映射后端资源 | → `api.ts` |
| 工具/配置 | `lib/*`、`config/*`、`hooks/*` | 日期、动效、路由、设置 | 全前端 |

## 3. 合理性评估

| 维度 | 结论 | 依据 |
| --- | --- | --- |
| 职责单一性 | **中** | 资源 Router / service / store 边界清楚；但 `db.ts`、`attendanceDb.ts`、`Approvals/index.tsx`、`MyPortal/index.tsx` 是 god module |
| 职责重叠 | **低–中** | 账号新建/编辑弹窗重复（已合并）；通知“出站/站内”命名相近但职责不同；无大段重复业务 |
| 耦合度 | **中** | `db.ts` 入度 48，是全局耦合中心；`attendanceDb` 入度 9；页面直接 import 多个 store/service |
| 复用性 | **中–高** | `ui/*`、`Pressable`、`TableSkeleton`、`NotificationContent`、`employeeCopy` 复用良好；Claims/Approvals 的复用边界偏弱 |
| 边界清晰度 | **中** | 员工门户 `/my` 与服务端 `/api/my` 独立；但认领（身份发放）挂在审批页 Tab 下，领域边界模糊；`notify*` 与 `notifications*` 命名易混 |

## 4. 问题清单（按严重程度）

### HIGH

1. **`server/db.ts` 是全局耦合中心**（720 行，入度 48，`server/db.ts`）
   - 同时承担建表/迁移辅助、员工 CRUD、播种、共享连接。任何员工字段变更都会影响全站 48 个模块。
   - 建议：拆出 `employeesDb.ts`（员工 CRUD）与 `schema/seed`；保留 `db.ts` 作为连接/事务门面并 re-export，避免一次性改调用方。

2. **`server/attendanceDb.ts` 是 god module**（1210 行，入度 9）
   - 打卡记录、班次、排班、覆盖率、分析、判定刷新、播种混在一起；考勤规则改动冲突面大。
   - 建议：按 `records` / `shifts` / `analysis` / `coverage` 拆分，`attendanceDb` 作为兼容 barrel。

3. **审批页承载了身份发放域**（`src/pages/Approvals/index.tsx` 745 行）
   - 请假/补卡/转正/离职/加班、台账、待核对（认领）混在一个页面；认领属于身份域，不是审批域。
   - 建议：抽 `features/claims`（页面 + 组件 + claimApi），审批页只保留一个入口 Tab；API 不变。

4. **员工门户单文件承载四 Tab**（`src/pages/MyPortal/index.tsx` 716 行）
   - 本月/异常/公告/我的、离线缓存、异议表单、摘要卡全在一起；改动一个 Tab 会碰整页。
   - 建议：拆 `tabs/MonthTab`、`AnomaliesTab`、`NoticesTab`、`MeTab`，共享 `PortalHeader/SummaryCard`；路由与接口不变。

### MEDIUM

5. **通知名词冲突**：`notifyDb/notifyRouter/notifyApi` 是**出站通道**（Webhook/SMTP），`notificationsDb/notificationsRouter/notificationApi` 是**站内通知**。
   - 建议：出站模块统一改名 `notifyChannels*`；保留旧导出别名一版，再删。

6. **账号新建/编辑弹窗重复**（原 `AccountManager.tsx` 两个 ~140 行组件）
   - 字段、角色选项、绑定员工、提交逻辑大量重复；新建成功后一次性口令还会被立即关窗吞掉。
   - **已处理**：合并为 `AccountDialog`（create/edit 模式），一次性口令改为留在弹窗展示。

7. **通知浮层多一层纯定位壳**（原 `NotificationPanel.tsx` 24 行）
   - 只被 `NotificationTrigger` 使用；正文 `NotificationContent` 已复用于账户弹窗。
   - **已处理**：定位壳并入 `NotificationTrigger`，删除 `NotificationPanel.tsx`。

8. **业务单据页混合表单与 A4 预览**（`BusinessForms/index.tsx` 598 行）
   - 表单状态、预览缩放、打印模板、PDF 逻辑同页；建议拆 `FormEditor` 与 `PrintPreview`，页面只做编排。

9. **全局初始化钩子知道业务权限**（`useInitData.ts`）
   - 所有登录用户统一拉员工/待办；员工权限收口后曾引发 `/my` 403。
   - 已加 `users:view` 门控；建议长期改为 `useBootstrapQueries`，按能力码注册查询，避免下次新增预取再踩。

### LOW

10. `server/capabilities.ts` 是 32 行纯门面（re-export catalog + rolePermissions）。**保留**：它避免了 `authRouter`/测试/前端注释三套真相，删掉只会增加迁移面。
11. `server/backupDb` + `backupArchive` + `backupRopter` 三文件是「元数据/归档格式/HTTP」，**职责分明，不建议合并**。
12. 25 个 resource service（21–70 行）与 26 个 Router 基本一一对应，**不建议合并**；合并会形成新的 god API。
13. 33 条“疑似重复组件”是检测器对本地复合组件的保守提示，多为 Card/Table/Dialog 的领域包装，**不强制合并**。

## 5. 合并方案与已实施结果

| 组合 | 判断 | 处理 | 影响范围 |
| --- | --- | --- | --- |
| `CreateAccountDialog` + `EditAccountDialog` | 高度重复（字段/角色/绑定/提交），适合合并 | **已合并为 `AccountDialog({ account? })`**，新建成功后展示一次性口令，关闭时刷新列表 | 仅 `AccountManager.tsx` 与账号面板测试；`accountApi` 不变 |
| `NotificationPanel` → `NotificationTrigger` | 纯定位壳，单一调用方，适合合并 | **已并入 Trigger 并删除 Panel**；`NotificationContent` 继续复用于 UserMenu | Header 内部；无外部 import/接口变化 |
| `notify*` + `notifications*` | 名字像、领域不同（出站 vs 站内） | **不合并**；后续改名 `notifyChannels*` | 需 import 迁移；保留别名 |
| `capabilities` + `permissionCatalog`/`rolePermissions` | 门面 + 数据 + 策略，分层合理 | **不合并** | 合并会把数据与策略混在一起 |
| `backupDb` + `backupArchive` + `backupRopter` | 元数据/归档/HTTP 三层 | **不合并** | — |
| 25 个 service / 26 个 router | 按资源一一对应 | **不合并** | 合并会放大耦合 |
| Claims + Approvals | 领域不同，但当前 UI 混在一起 | **不合并，改为拆分**（抽 `features/claims`） | 审批页/路由；API 不变 |

**兼容性**：以上两项已实施合并都没有改 HTTP API、数据库 schema、store/service 签名；`NotificationPanel` 无外部引用；`AccountDialog` 为模块内部组件。

## 6. 目标结构

保持**模块化单体**，不为目录美观做一次性搬迁；按域逐步收敛：

```text
server/
├─ platform/        db / migrate / auth / audit / validation / settings
├─ domains/
│  ├─ identity/     auth, claims, permissions
│  ├─ people/       employees, departments, contracts
│  ├─ attendance/   records, shifts, verdicts, import, analysis
│  ├─ approvals/
│  ├─ documents/
│  ├─ notifications/ inapp, outbound
│  ├─ ai/
│  ├─ backup/
│  └─ wecom/
└─ routers/         保持现有挂载与 URL

src/
├─ features/        portal, claims, approvals, attendance, employees, documents, settings, ai
├─ shared/          ui, layout, lib, config, services, stores
└─ pages/           路由壳，只做编排
```

## 7. 实施步骤与待办

| 阶段 | 动作 | 风险 | 验证 |
| --- | --- | --- | --- |
| 已完成 | 合并账号弹窗；合并通知定位壳；修复一次性口令不可见 | 低 | 单测 912、e2e 33、typecheck/build |
| P1 | 拆 `db.ts`：新增 `employeesDb`，`db.ts` re-export 旧符号 | 中 | 全量单测 + 考勤/员工 e2e |
| P1 | 拆 `attendanceDb`：records/shifts/analysis/coverage，barrel 兼容 | 中–高 | 考勤判定黄金对比 + 导入/月报 e2e |
| P2 | 抽 `features/claims`，审批页只留 Tab 入口 | 中 | 认领 e2e + 权限矩阵 |
| P2 | `notify*` → `notifyChannels*`，保留一版别名 | 低–中 | 通知/提醒 e2e |
| P3 | 拆 `MyPortal` 四 Tab、`BusinessForms` 表单/预览 | 中 | 门户 e2e + 打印/预览 |
| P3 | 评估按域目录迁移；先加 ESLint 边界规则再搬文件 | 低（若只搬目录则高） | 全量 CI |

**不建议做**：为减少文件数合并 service/router；合并 `capabilities` 门面；合并打印/备份分层；强行合并 33 条复合组件。
