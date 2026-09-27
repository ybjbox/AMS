# AMS UI/UX 全面审查 · 2026-09-26

> **2026-09-27 更新（批次 1–5 已按本文顺序修完）**：见文末「修复结果」。
> 其中一条**取证口径的更正**必须先说：本文原写「31 视图 × 亮暗双主题」，实际那两轮都跑在亮色上
> —— 探针往 `app_settings_theme` 塞的是裸字符串 `"dark"`，而这个 key 存的是 zustand persist 的整个信封，
> `JSON.parse` 抛错后 store 回落默认值。修好注入后重跑，暗色才第一次被量到，并因此新发现一处
> `sr-only` 之外的对比度问题（已一并修掉）。下面「修复结果」的数字来自更正后的两轮。

**基准**：`design-system/ams/MASTER.md`（v4）+ `ui-ux-pro-max` 技能规则库（119 条 UX 准则中的 45 条 High/Critical，取 Platform 含 web/desktop 者）+ WCAG 2.2 AA 口径。
**取证**：31 个视图（12 顶层路由 + 打印工具 3 个标签 + 设置 16 个面板 + /403 + /login）× 亮暗双主题，生产实例 `:3001`，视口 1370×770；另在 1440/1024/768/390 四档做溢出与截图复核。
**探针**（产物在 gitignored 的 `.design-qa/`）：`probe-uiux-2026-09-26.mjs`（axe + 计算样式，→ `reports/uiux-2026-09-26.json`）、`probe-uiux-detail.mjs`（axe 节点原文 + 真截断 + 768 档，→ `actual/uiux/w768-*.png`）、`probe-error-states.mjs`（非鉴权接口全 500 时用户看到什么，→ `reports/uiux-error-states.json`）。
**规则库用法说明**：本机 `python` 是 Windows Store 占位程序，技能的 `search.py` 跑不起来，因此规则取自技能目录的 `data/ux-guidelines.csv` 与 `references/`（直接读原文，未走检索脚本）。

## 结论

**Pass with warnings。** 无障碍底盘是好的：真键盘走焦 6 个视图共 21–45 步，**0 个无焦点环、0 个焦点被吸顶层遮挡、0 个落在视口外**；四档视口**页面级横向溢出为 0**；后端 500 时**没有任何内部信息（SQL/堆栈/路径）漏到界面**。axe 在 31 个视图里只报了 4 个视图有问题。

问题集中在三处，都不是"样式不精"而是"用户会被误导或拿不到功能"：

1. **失败被说成成功，或被说成"你没有数据"** —— 4 个 blocker 全在这一类。
2. **一处用错令牌让备份列表近乎不可读**（1.1:1，双主题同时）。
3. **文档库文件夹的行内操作只有 hover 才出现**，键盘与触屏彻底拿不到（全仓 `group-focus-within` 出现 0 次）。

计数：blocker 4 · major 10 · minor 6 · debt 9 · 另有 4 条代理报告经我复核后**判为误报或降级**（见文末，避免照着改错）。

---

## Blocker

### B1 备份列表的时间与体积用「表面色」当文字色 → 1.1:1，双主题都几乎看不见

- **证据**：`src/pages/Settings/panels/BackupPanel.tsx:242` 与 `:245` 用 `text-secondary`；`src/index.css:185` `--secondary: oklch(0.96 0.005 240)`（亮=近白）、`:225` `--secondary: oklch(0.28 0.03 262)`（暗=深灰）—— 它是**背景**令牌。实测（canvas 像素读回）：`settings-backup#light` 与 `#dark` 各 4 个节点，比率 **1.1**，需要 4.5，节点文本是「2026/9/23 06:09:58」「808.0 KB」。
- **影响**：管理员判断"这份备份是不是我要的那份"全靠时间与体积两列，而这两列在两个主题下都不可读。
- **修法**：改 `text-muted-foreground`（契约里唯一双主题达标的辅助文字档）。
- **验证**：复跑 `probe-uiux-2026-09-26.mjs`，`settings-backup` 的 `contrastFailCount` 应为 0；并给 `design-contract.test.ts` 加一条规则：**禁止 `text-` 前缀接表面类令牌**（`text-secondary`/`text-background`/`text-card`/`text-muted`）。

### B2 文档库文件夹的行操作只在 hover 出现，行本身不是可聚焦元素

- **证据**：`src/pages/Documents/components/FolderTree.tsx:46-48` 行是 `<div ... onClick>`（无 `tabIndex`、无 `role`、无 `onKeyDown`）；`:73` 操作容器是 `className="hidden group-hover:flex ..."`；全仓检索 `group-focus-within` **命中 0 次**（`grep -rn "group-focus-within" src | wc -l` → 0）。新建子文件夹/重命名/删除三个按钮都在这个 hover-only 容器里。
- **影响**：键盘用户既不能进入文件夹，也不能做文件夹的任何管理操作；触屏设备（含 Windows 触控板轻点）同样拿不到。违反规则 117（不得把唯一操作藏在 hover 后）与 103（不得只有拖/悬停路径）。
- **修法**：行改 `role="treeitem"` + `tabIndex` + Enter/Space 处理；操作容器改 `hidden group-hover:flex group-focus-within:flex`，并在行内放一个"更多操作"按钮作为键盘入口。
- **验证**：e2e 用真键盘 Tab 到该文件夹行后断言三个按钮可见（`toBeVisible`），并断言 Enter 能切换当前文件夹。

### B3 排班与班次的写入把失败返回值丢掉，还照常清空选择/关闭编辑器

- **证据**：`src/store/utils.ts:13-31` 明确把错误串**返回给调用方**（注释点名"以前只写进 state.error，于是点删除→后端 403→界面什么都没发生"）；`useAttendanceStore` 的 `addShift/updateShift/setSchedules` 签名都是 `Promise<string | null>`（`:53-57`）。但 `src/pages/Attendance/components/Filter.tsx:100-108`（`handleAddManualSchedule`）不 await、不看返回值，随后无条件 `setSelectedEmployeeId('')` + `setSelectedShiftIds([])`；`:178-189`（`onSaveShiftClick`）同样不看结果就 `setEditingShift(null)`。同文件 `:119-122` 的异常分析**是**正确写法（`if (failure) toast.error(failure)`），说明这是漏改而非设计。
- **影响**：后端拒绝时界面表现为"已排好/已保存"（行消失、弹窗关闭），用户以为写进去了 —— 这是最容易造成实际损失的一类：他会继续往下走，直到打印或导出才发现排班是空的。
- **修法**：三处统一改成 `const failure = await ...; if (failure) { toast.error(failure); return; }` 再清理选择/关闭编辑器；失败时保留用户输入。
- **验证**：单测（store 动作 mock 成 reject）断言"失败时选择未被清空、编辑器未关闭、有 error toast"；`probe-error-states.mjs` 的变体可对 `POST /attendance/schedules` 返 403 后检查界面是否仍显示旧选择。

### B4 恢复备份后只刷新备份列表，其余业务数据仍是恢复前的，却提示"已恢复"

- **证据**：`src/pages/Settings/panels/BackupPanel.tsx:88-101` 成功分支只有 `await load()`（备份列表）；全仓检索 `location.reload` **命中 0 次**（`grep -rn "location.reload" src/pages src/store` → 空）；员工/部门/合同等 store 首次加载后由 `initialized` 短路（批次 2 只给 `fetchUsers` 加了 `{force}` 选项，调用方仍是默认懒加载）。
- **影响**：回滚完成后界面继续显示旧数据，用户据此再点一次保存，就会把**恢复前的状态写回刚回滚好的库** —— 从"显示不一致"升级成真实数据回退。
- **修法**：恢复成功后强制刷新业务真值。最小做法：`res` 回来后清各 store 的 `initialized` 并重新拉取，或直接 `window.location.reload()`（恢复本就是低频、可接受的重载动作）；同时把 toast 文案改成"已恢复，页面将重新载入"。
- **验证**：e2e 或 scratch 实例：改一条部门名 → 备份 → 改回 → 恢复 → 断言部门树显示的是备份里的名字（当前实现会显示改后的名字）。

---

## Major

### M1 后端失败被呈现为"你没有数据，去创建吧"

- **证据**：`probe-error-states.mjs` 把所有非鉴权接口固定返 500，逐视图取正文：`/users` → 「未找到员工 请尝试调整搜索条件或添加新员工」；`/departments` → 「暂无部门数据 开始添加您的第一个公司部门吧 立即创建」；`/contracts` → 「没有找到符合条件的员工记录」；`/documents` → 「暂无文件套件…立即创建」；`/todos`、`/approvals` 同类。全局 toast 只有 4 秒的「服务器内部错误」，消失后页面只剩错误的空态。
- **影响**：数据库/服务临时不可用时，用户读到的是"数据没了"，最自然的反应是重新录入 —— 与 B4 叠加就是重复数据。
- **修法**：数据层区分 `absent` 与 `error`（`loadSingle` 已有三态的先例，见 `src/hooks/useServerPrefs.ts` 的 `degraded`），error 时渲染"加载失败 + 重试"而不是空态；`EmptyState` 增加 `error` 变体。
- **验证**：把 `probe-error-states.mjs` 的断言从"记录看到什么"升级成"必须出现'失败/重试'且不得出现'立即创建'"，纳入 `npm run test:e2e` 之外的一次性取证脚本。

### M2 合同打印有两处静默 return：点了「打印」可以什么都不发生

- **证据**：`src/pages/Contracts/hooks/useContractPrint.ts:9` `if (!printArea) return;`、`:16-20` `if (!doc) { removeChild; return; }`，两条路径零提示。对照正确写法：`src/pages/Seating/index.tsx:167-171` 打印失败会 `toast.error('还没有生成座次卡，请先「自动排座」')`。
- **修法**：两处各补一条可读 toast（说明缺什么、下一步做什么），与排座口径一致。
- **验证**：单测/探针：在未生成合同正文的状态下点打印，断言出现提示而非静默。

### M3 导出成功的 toast 报「筛选条数」，实际发出去的是全量名册

- **证据**：`src/pages/Users/hooks/useExport.ts:151` 收 `filteredUsersLength`，`:171-173` 注释「前端传全量数据」并 `downloadEmployeeExport(users, config)`，随后 `toast.success('成功导出 ${filteredUsersLength} 条员工数据')`；而弹窗自己的计数（`src/pages/Users/components/ExportModal.tsx:457-460`）按 `includeResigned` 从 `users` 算。页面筛选（部门/搜索/状态）既不参与导出也不参与弹窗计数。
- **影响**：开着"市场部"筛选导出 48 人的全量文件，toast 却说导出了 12 条；两个数字互相矛盾，用户无法判断文件里到底是谁。
- **修法**：二选一并统一 —— 要么把当前筛选带进导出（服务端按条件过滤），要么 toast 与弹窗都用"导出 N 条（当前筛选不参与导出）"。
- **验证**：单测：`filteredUsers.length !== users.length` 时断言 toast 数字等于实际发出的行数。

### M4 AI 管理配置里三个数字输入没有可访问名称（axe critical）

- **证据**：axe `label` critical ×3，节点原文 `<input id="base-ui-_r_6_" data-slot="input" min="0" max="100000" type="number" value="20">`（另两个 `max=100000`、`max=3650`），无 `<label for>`、无 `aria-label`。
- **影响**：读屏用户听到的是"编辑，20"，不知道那是每日额度、单价还是保留天数。
- **修法**：走契约已有的 `<label htmlFor>` 关联（MASTER · Form fields），或补 `aria-label`。
- **验证**：axe 该视图 `label` 违规数归零（探针已能直接输出）。

### M5 导出脚本面板两个图标按钮没有可访问名称（axe critical，且违反契约硬规则）

- **证据**：axe `button-name` critical ×2：`<button type="button" data-slot="button" class="group/button inline-...">` 内部无文本。契约 `MASTER.md:279` 明写"图标按钮一律 `size=icon-xs|icon-sm` 且**必须带中文 aria-label**"。
- **修法**：补 `aria-label`（动作 + 作用对象写全）。
- **验证**：axe 归零 + 给 `design-contract.test.ts` 增一条静态规则：`<Button ... />` 无 children 文本时必须出现 `aria-label`。

### M6 带必填星号的字段其实可以空着提交，错误提示永远不会出现

- **证据**：`src/pages/Users/components/UserFormModal.tsx:229`（户口地址）、`:240`（现住址）、`:269`、`:358` 渲染 `<span className="text-red-500">*</span>`，但 zod 里 `registeredAddress`/`currentAddress`/`role`/`changeStatus` 都是 `.optional()`（`:19-28`），且这些字段都配了 `errors.xxx && <p role="alert">` —— 永不触发。
- **影响**：用户被迫填四栏（或困惑于星号）；而 HR 真正需要的地址/职位反而可以空着，落库后在通讯录、花名册里成空列。
- **修法**：要么把 zod 改成 `.min(1, '请填写户口地址')`，要么去掉星号 —— 先定业务口径，别两边各留一半。
- **验证**：单测：空值提交应被拦下并在字段下方出错误；星号集合与 zod 必填集合一致性可写成一条静态测试。

### M7 部门空态向没有管理权限的角色递上「立即创建」

- **证据**：`src/pages/Departments/index.tsx:64-79` 空态里的 `<button onClick={logic.handleAddRoot}>立即创建` 未被 `canManage` 包住（同文件 `:22` 已算出 `canManage = hasPermission('departments:manage')` 并传给左树 `:62`）。
- **修法**：`{canManage && <button …>}`，无权限时文案改"当前部门数据为空，请联系管理员"。
- **验证**：以 HR 身份渲染空态，断言无「立即创建」。

### M8 导出弹窗让 HR「前往系统设置创建」他根本看不到的面板

- **证据**：`src/pages/Users/components/ExportModal.tsx:372` 「暂无脚本，请前往系统设置创建」；而 `src/pages/Settings/index.tsx:87` 的 `scripts` 与 `:86` 的 `themes` 面板 `minRole: ADMIN`。
- **影响**：指令不可执行，用户会在设置页里找不到入口 —— 契约已明确禁止"承诺了做不到的事"的空态文案（`MASTER.md:341`）。
- **修法**：按能力码切换文案（无权限 → "请联系管理员在「导出脚本模板」中创建"）。
- **验证**：以 HR 身份渲染，断言文案不含"前往系统设置"。

### M9 768px 档：考勤六个标签被裁掉两个半，且滚动条被刻意隐藏，界面上没有任何"还能滚"的暗示

- **证据**：实测 `.tab-group` 在 768 宽时 `clientW=311 / scrollW=536`（225px 内容在视口外），`src/index.css:344-351` 同时 `scrollbar-width: none` + `::-webkit-scrollbar{display:none}`；截图 `actual/uiux/w768-attendance.png` 里第 4 个标签"部门时段"被**从字中间切断**，"异常分析/月度报表"完全看不见。对照：侧栏导航那条隐藏滚动条是有"渐隐 + 箭头"示意的（`index.css:353` 注释），tab-group 没有。
- **修法**：`.tab-group` 在窄档补可滚动示意（右缘渐隐 + 到边自动滚入 view），或 ≤768 时换行/收成下拉。
- **验证**：768 档截图 + 断言 `.tab-group` 存在 `mask-image` 渐隐或箭头元素。

### M10 768px 档：控制台「快捷操作」把中文标签压成一字一行

- **证据**：截图 `actual/uiux/w768-dashboard.png`：「添加员工」「待办事项」「部门调整」「系统设置」四块全部竖排换行（4 字占 4 行）。
- **修法**：快捷操作容器 `md:grid-cols-2` 降到单列或让标签 `whitespace-nowrap` + 允许容器变宽；这是规则 111/116（长 token 换行 / 紧凑标签溢出）的典型形态。
- **验证**：768 档断言每个快捷项的 `clientHeight` 不超过单行高度 ×1.5。

---

## Minor

| # | 现象 | 证据 | 修法 |
|---|---|---|---|
| m1 | `/403` 页缺 `main` landmark、无 `h1`、正文不在任何 landmark 内 | axe `landmark-one-main`/`page-has-heading-one`/`region` 各 1 | 包一层 `PageContainer`（或 `<main>`），标题降为 `h1` |
| m2 | 工作餐券页标题层级跳档（`h2` 直接到 `h3`）+ 两个同名 `aside` landmark | axe `heading-order`、`landmark-unique`，节点 `<h3 class="mb-3 …">券面信息</h3>`、`<aside class="relative z-30 bg-white/80 …">` | 层级补 `h2`；两个 `aside` 各给中文 `aria-label` |
| m3 | AI 会话记录「清空全部」按钮文字 4.35:1（需 4.5） | 探针 `settings-ai-history#light/#dark` 各 1 节点 | 状态/危险文字按契约配成 `text-{c}-700 dark:text-{c}-400` |
| m4 | 一次进页面若 5 个接口都失败，会叠 4–6 条内容相同的「服务器内部错误」toast | `reports/uiux-error-states.json` 每视图 `toast` 长度 4–6 | 同类错误 1.5s 内合并成一条（sonner `id` 去重） |
| m5 | 复选框本体 16×16、登录页「忘记密码？」文字按钮 70×20，低于 WCAG 2.5.8 的 24×24 | 探针 `smallTargets`：`span.peer size-4`(16×16)、`button 70×20`；`login#dark` 共 10 条（含 `<label>` 类误报，见文末） | 复选框点击区用 `label` 撑到 ≥24 高；行内文字按钮补 `py-1` 或改 `size="xs"` + 间距等效 |
| m6 | 同一工具条里按钮高度三种：`.btn-primary` 36px、`.btn-secondary` 38px、`ui/Button` 42px | `/users` 页 `getBoundingClientRect` 实测（36/38/42） | 全局 `.btn-*` 与 `ui/Button` 收敛到同一高度档（契约已写 36px） |

---

## 设计债（会持续扩散，但不改变当前可用性）

| # | 债 | 实测规模 | 建议下沉位置 |
|---|---|---|---|
| D1 | 辅助文字未走唯一档 `text-muted-foreground`，而是 `text-zinc-500 dark:text-zinc-400`（亮色 4.46–4.83 临界） | `grep` 命中 **229** 处（`text-muted-foreground` 236 处） | 批量 codemod（`.design-qa/codemod-muted-text.cjs` 已有先例）+ 扩契约测试覆盖"正向错配" |
| D2 | 契约明令禁用的第三套暗色表面 `bg-card`/`bg-background`/`bg-muted`/`border-border` | **83** 处（集中在 BackupPanel、AiAssistant、AiConfigPanel、AiHistoryPanel、WeChatNotice） | 改 zinc 工具类或 `.card-base`；契约测试加一条禁止清单 |
| D3 | `ui/Badge` 的 `success` 变体亮色是品牌蓝、暗色是绿；`info` 与 `primary` 完全同色 → 同一个"在职"在列表里蓝、在档案弹窗里绿 | `src/components/ui/Badge.tsx:14-18`（`success: 'bg-brand-50 text-brand-700 dark:bg-success/10 dark:text-success'`）vs `UserDetailModal` 的 `bg-emerald-100 text-emerald-800` | 改原语：success 一律 emerald 家族；`info` 与 `primary` 要么合并要么区分语义 |
| D4 | 表格没有原语：18 个裸 `<table>`，sticky 表头底色 5 种配方，`min-w-[720/800/860px]` 13 处 | 代理清点 + 抽查 `AccountManager:322`、`SystemLogs:291`、`FileList:106`、`ShiftRules:240`、`BackupPanel:206` | 新增 `ui/DataTable`（表头/冻结列/分隔线/空态一套） |
| D5 | 表单两套真相：`.input-base`（index.css）与 `ui/Input` 配方重复；8 处走全局类、122 处走原语 | 代理清点，`.input-base` 调用点实测 7 处 | 保留原语，删全局类或让它 `@apply` 到同一处定义 |
| D6 | `ui/` 目录自身旁路：`Pagination.tsx` 内 4 个裸 `<button>` + 1 个裸 `<input type=number className="input-base">` | `src/components/ui/Pagination.tsx:88,99,114,134,144`；契约 `MASTER.md:263` 点名的正是这类盲区 | 原语内改用 `ui/Button`/`ui/Input`；扫描器取消对 `ui/*` 的整体豁免 |
| D7 | z-index 无体系：39 处 / 22 文件 / 8 档，含 `z-[9999]` ×3；同一文件里冻结列 z-30 与 z-10 并存 | 代理清点（`UserTable.tsx:366` vs `:416`，路径实为 `src/components/users/UserTable.tsx`） | 定义 `--z-nav/--z-sticky/--z-overlay/--z-modal/--z-toast` 并全部走 token |
| D8 | 状态保持口径不一：设置页每次换面板**重挂载**（`Settings/index.tsx:257` `key={activeTab}`），与刚修的打印工具 keep-alive 相反 → 日志/账号页的搜索 + 6 个筛选 + 页码每次切面板全清；另外无 `ScrollRestoration`、无 404 页（`App.tsx:87` `*` 直接 `replace` 回控制台）、深链穿登录会丢目标（`ProtectedRoute.tsx:20` 不带 `from`） | 源码 + `grep` | 设置页沿用 keep-alive 或把筛选写进 URL（已有 `useUrlState`）；补 404 与登录后回跳 |
| D9 | 手写 focus 样式 32 处 / 11 文件（契约说交给全局 base 规则），其中 `Login.tsx:209` 用 `focus:` 而非 `focus-visible:` | 代理清点 | 删手写样式，统一交给 `index.css` @layer base |

---

## 复核后剔除或降级的条目（别照着这些去改）

1. **「合同模板的保存是假功能」被判 blocker → 降为 debt**。`ContractTemplateEditor.tsx:43` 的文案是「已载入 X（N 字符），确认后点保存生效」，并没有承诺跨设备/服务端保存；`useContractStore.ts:11-21` 走 zustand persist 到 localStorage 是**可解释的本机偏好**。真实缺口只是"没说明只存本机"。改文案即可，不必动存储层。
2. **「4xx/500 没有全局 toast」→ 实测不成立**。`probe-error-states.mjs` 显示每个视图在接口 500 时都收到 4–6 条「服务器内部错误」toast（问题反而是 m4 的重复叠加）。真正缺的是"错误态 ≠ 空态"，见 M1。
3. **「多处文字被裁切」→ 全是 `sr-only` 误报**。第一版探针报 users/contracts 有 4–6 处截断，逐条看 className 全是 `sr-only`（视觉隐藏本就该被裁）；排除 `sr-only` 后重扫 13 个视图，**真截断 0 处**。
4. **「小点击目标 24 处」需要打折**。明细里多数是 `<label>`（14–20px 高的字段标签，不是指针目标）。真实的只有 16×16 复选框与 20px 高的行内文字按钮，已收敛进 m5。

另需点名一处**代理报告里的路径错误**：`UserTable.tsx` 实际在 `src/components/users/UserTable.tsx`，不是 `src/pages/Users/components/UserTable.tsx`；引用它的结论我都按真实文件复核过。

## 做得好的（值得当模板复用）

- 焦点可见性：全局 base 一条规则兜底，实测 6 视图 0 缺环、0 被吸顶条遮挡（`MASTER.md:281-293` 的长手写法是对的）。
- 具名失败文案已有先例：`BackupPanel`「读取备份列表失败：…操作未生效，请检查后重试。」、`useSeatingPlans`「方案列表加载失败」、餐券「打印记录读取失败」、以及批次 2 的 `degraded` 提示「未能读取已保存的参数…本次改动不会自动保存」——M1/B3 的修法直接照这套抄即可。
- 破坏性操作的确认与后果披露在备份、考勤清空、企微三条链路上是完整的（含安全备份、uploads/模板/schema 三类回滚警告）。
- 5xx 一律通用文案，界面上量不到 SQL 名、堆栈或绝对路径。

## 未验证 / 需要人定的

- **未逐条复核的代理结论**：`m6` 之外的表单细节（名称无 trim、保存按钮无进行态、`[object Object]` 错误文案、审批裸 `return`、台卡数字 `x || 默认`）、术语不统一清单（座次卡 vs 台卡、粘贴名单 vs 手动输入名单、系统偏好面板露"鉴权策略表"口径）。这些**我只看到 file:line 未打开原文**，动手前先按条复核。
- **未覆盖的取证面**：弹窗/抽屉内部没有逐个跑 axe 与对比度（本轮是 31 个"视图"，不含 ~25 个模态）；`prefers-reduced-motion` 只确认了全局兜底存在，没有实开系统设置复测；虚拟表格在极端行数下的可读性；打印产物（`emulateMedia('print')`）本轮未量。
- **产品口径待定**：① M3 是"导出跟随筛选"还是"导出永远全量"；② M6 四栏到底是不是必填；③ M1 的失败态要不要给"重试"按钮（会引入自动重试策略）；④ D8 里设置页是否值得 keep-alive（面板多、常驻内存与并发请求的代价比打印工具高）。

## 建议的修复批次（按性价比排序）

1. **一批小改、当天可完**：B1 + M4 + M5 + m1 + m2 + m3 + m6 + D3 —— 全是局部改类名/补 `aria-label`/改变体，一次跑完探针即可看到 axe critical 归零、对比度失败归零。
2. **假反馈收口**（价值最高）：B3 + B4 + M1 + M2 + M7 + M8 —— 统一"失败 ≠ 空态"，并把 `createAsyncAction` 的返回值在所有调用点接上（可用一条静态规则扫"调用了返回 `Promise<string|null>` 的 store 动作却没处理返回值"）。
3. **键盘与触屏可达**：B2 + m5 + 部门树/员工表里 `div onClick` 的行（`UserTable.tsx:286,406`、`Filter.tsx:245` 同类）—— 这一批需要 e2e 键盘用例配合。
4. **窄档适配**：M9 + M10（+ 表格内滚的可视提示）。
5. **债务下沉**：D1 D2 D4 D5 D6 D7 D9，每清一条就往 `design-contract.test.ts` 加一条对应规则，避免再次漂移；D8 与 M3/M6 需要先定产品口径。

---

## 修复结果（2026-09-27，批次 1–5）

复验一律用同一支探针、同一台生产实例（`:3001`）、更正后的双主题注入（每轮打印 `documentElement.className` 自证主题生效），62 个视图×主题轮次。

| 指标 | 修前 | 修后 |
|---|---|---|
| axe 违规节点 | 14（4 个视图） | **0** |
| 真对比度失败（排除 `sr-only`） | 备份列表 8 节点 **1.1:1**、AI 会话 4.35:1 | **0** |
| 无名表单控件 | 6 | **0** |
| 标题层级跳档 | 2 | **0** |
| 键盘走焦：无焦点环 / 焦点被遮挡 | 0 / 0（本来就好） | 0 / 0（6 视图 ×19–45 步） |
| 四档视口页面级横向溢出 | 0 | 0 |
| 768 档考勤标签条藏在视口外 | 225px（6 个里 2 个半看不见） | **0**（换行，`clientW==scrollW==311`） |
| 768 档快捷操作 | 中文一字一行 | 全部单行、零溢出 |
| 同一工具条按钮高度 | 36 / 38 | 38 / 38 |
| `text-zinc-500 dark:text-zinc-400` | 229 处 | 20 处（其余全是图标行或纸张预览文件） |

**批次 1（令牌与 axe critical）**：B1 `text-secondary`→`text-muted-foreground`；M4 AI 配置三个数字输入补 `htmlFor`/`aria-label`；M5 脚本面板两个图标按钮补带作用对象的中文名，并顺手把它们从"只有 hover 才现形"改成 `group-focus-within` 也算；m1 `/403` 改 `<main>` + `h1`；m2 餐券 `h3`→`h2` 并给两个 `aside` 各起名（侧栏「侧边导航」/参数区「餐券参数」）；m3 `ui/Button` 的 destructive 文字改 `text-red-700 dark:text-red-400`（原 `text-destructive` 压在 `bg-destructive/10` 上实测 4.35）；m6 `.btn-primary`/`.btn-primary-danger` 补 `border border-transparent` 与带边框的次级按钮同高；D3 `Badge` 的 success 改 emerald 家族（原来亮色是品牌蓝、暗色是绿），删掉与 `primary` 完全同色且零调用的 `info`，并把员工档案弹窗里手写的那枚 emerald pill 换成 `Badge`。另修 2 个只有 placeholder 的控件（微信通知原文 textarea、AI 会话筛选框）。

**批次 2（假反馈）**：B3 `reportWrite` 提到 `src/store/saveFailure.ts` 成为共享出口，接上 `Filter.tsx` 的排班/班次保存与 `Table.tsx` 的班次删除共 5 处（失败时不再清空选择、不再关编辑器）；顺带发现 `useAttendance.ts` 把 `setSchedules`/`setRecords` 的返回类型写成 `=> void` —— **接口把 store 真实的失败返回值抹掉了，所以调用点连"忘了看"都不会被类型系统提示**，已改回 `Promise<string|null>`。B4 新增 `src/utils/reloadApp.ts`，恢复备份成功后重载界面（其它 store 仍持旧内存态，用户据此再保存会把恢复前的数据写回去）。M1 新增 `ui/FailedState`，员工/部门/合同/文档四个视图在"拉取失败且无数据"时显示「××加载失败 + 原因 + 重试」而不是"暂无数据，立即创建"；`useDepartmentStore` 补 `loadError`。M2 合同打印两处静默 `return` 各补一条可读提示。M7 部门空态的「立即创建」按 `canManage` 收口。M8 新增能力码 `export-templates:manage`，导出弹窗对无权限角色改说"需要由管理员在「导出脚本模板」中创建"。

**批次 3（键盘与触屏）**：B2 文档库文件夹 —— 名称改成真 `<button>`（Enter 即进入），三个行内操作从 `hidden group-hover:flex` 改成 `opacity-0 + group-hover/group-focus-within`。这里更正一句：**`display:none` 的元素根本不在 Tab 序里，所以只补 `group-focus-within:flex` 是无效的**，必须让它一直占位、只改透明度（顺带消掉 hover 才出现导致的行内跳动）。同类修法推广到部门树、职位列表、待办删除按钮、AI 助手清空按钮。员工表的 4 个排序表头 `<div onClick>` 改成 `<button>`，整行补 `tabIndex` + Enter/Space。
**批次 4（768）**：`.tab-group` 在 <1024 换行；快捷操作磁贴 `px-2 py-4` + 标签 `whitespace-nowrap`。
**批次 5（债务）**：D1 受限 codemod 改了 55 个文件 209 行（图标行与纸张预览整文件跳过，逐条抽查过）；契约测试从 6 条加到 8 条（新增"表面令牌不得当文字色""辅助文字唯一档"）。

**新增守卫**：`src/store/__tests__/write-feedback-batch2.test.ts`（6 例）、`src/pages/PrintTools/__tests__/print-tools.test.tsx` 扩 1 例、契约测试 +2 条；e2e 新增 `failure-states.spec.ts`（3）、`folder-keyboard.spec.ts`（2）、`keyboard-access.spec.ts`（2）。三条 e2e 都验过"回到修前代码会红"（分别报 aria/alert 缺失、按钮 locator 找不到、`toBeVisible` 失败）。

**刻意留下、没有顺手改的**：
- **M1 还剩 3 个视图**（考勤、待办、审批）—— 它们的 store 只 toast 不落 `error`，要按部门那样各加一份状态，留作单独一批。
- **D2（83 处 `bg-card`/`bg-muted`/`border-border`）**：不是机械替换能了结的 —— `bg-muted` 当表面用时该落到哪一档 zinc 需要逐处判断，改错就是"第三套暗色底"。
- **D4（18 个裸 `<table>` 下沉 `ui/DataTable`）**：真正的重构，需要单独一轮带截图的验收。
- **D5 / D6 / D7 / D9**：`.input-base` 与 `ui/Input` 双份、`ui/Pagination` 内部 4 裸按钮 + 1 裸输入（其无障碍本身没问题，是内部一致性问题；已补 `aria-label`）、z-index 8 档无体系、32 处手写 focus。
- **m5 复判为扫描假阳性**：`ui/Checkbox` 根元素带 `after:-inset-x-3 after:-inset-y-2`，实际命中区 40×32 ≥ 24×24；我第一版扫描只量了元素的 border box。剩下的只有 20px 高的行内文字按钮，已单独加高。
- **需要产品口径才能动的**：M3（导出到底跟不跟筛选）、M6（户口地址等四栏是不是真必填）、D8（设置页是否值得 keep-alive、要不要 404 页与登录后回跳）。

### 2026-09-27 追加：业务单据的左列跟着预览滚走

用户反馈「业务单据左边的设置区域跟随预览画面滚动了」。定位：这一页是 `grid lg:grid-cols-[26rem_1fr]` 的两列，右侧 A4 预览框只有 `overflow-auto` 却**没有高度上限**，纸面按 `1122.5px × fit` 撑开整页 —— 1370×770 下 100% 时页面已经 1200+px，放大到 150% 实测 `main.scrollHeight = 2004`（视口 770），于是整页要滚 1200 多像素，左边那叠字段自然跟着滚出画面。这不是本轮改出来的回归（`git diff` 显示该文件此前未被批次触碰），是这页从一开始就有的布局缺口。

修法两条：预览框加 `max-h-[70vh]`（超出部分由它自己滚）+ 左列 `self-start lg:sticky lg:top-6`（字段变长时也不跑）。复验（1370×770，zoom 100%/150%/200%）：`main.scrollHeight == clientHeight == 770`，预览框 `537 可见 / 933–1858 内容`，左列高 556px 且 `position: sticky` 生效。守卫：`preview-zoom.spec.ts` 新增一例（修前该例红 —— 实测 `mainScrollH 2004 > clientH 770`）。顺带把预览框标成 `role="region" aria-label="业务单预览区"`，既是可滚区域该有的语义，也给这条断言一个稳定锚点。

同轮还修掉一处我自己引入的问题：给 `ui/Pagination` 的跳页输入补 `aria-label` 时没发现它**本来就有**一个，重复属性被 `tsc` 判 TS17001 —— vite build 不做类型检查所以没拦下，是全梯里的 typecheck 步骤抓到的（该输入并非无名控件，探针的 `unnamedControls` 一开始也没报它）。


### 2026-09-27 追加二：业务单的纸面居中与「一张纸两份」

用户先要求「内容居中到纸张中间」，随后追加「横向也要居中，并且一张纸可以设置打印几份，默认两份，但内容不要重复，空白的业务单多出来手写」。两条都落在同一处版面几何上，所以一起改。

**竖向**：`.ywd-page` 收成 flex column，内容块首尾各一条 auto 外边距。用 auto margin 而不是 `justify-content:center` —— 正文很长时 auto margin 归零、内容从 8mm 上边距往下排；flex 居中会把超出部分同时推到上边界之外，打印时第一行直接被裁掉。上下内边距改成对称（原来只有 `padding-top`），否则"居中"比几何中心低半个上边距。`.docx` 侧对应 `<w:vAlign w:val="center"/>`。

**横向**：原件表格实测偏右 4.8mm（左 20.90 / 右 11.36），所以"看着没居中"是真的。把「标题+日期+表格」收成一个与表格等宽（177.80mm）的块，块在槽位里 `align-items:center` 居中，于是左右各留 16.10mm。日期不再用"居中段落 + 前导空格"那套推位（位置取决于对字宽的估算，字体度量一变就飘），改成右对齐到「表格右边往里缩 575 twips = 10.14mm」这条几何基线，`.docx` 用 `w:jc=right` + `w:ind right="-309"` 还原同一条线。

**一张纸两份**：A4 竖版放不下两张并排（两张宽 355.6mm > 210mm），只能上下叠 —— 单据骨架 122.04mm，两份 244.08mm ≤ 纸张内框 281.0mm，原尺寸不缩放。每份占一个 `flex:1 0 auto` 槽位（可长高、不缩），第二份是同一副骨架但值全空（`BLANK_FORM`），栏目名照旧、日期行留空，供手写另一笔业务。份数是业务单页内的打印选项，按账号存 saved-items（新 kind `business-forms-print`）；`.docx` 按用户口径保持一页一份、不打空白单。正文长到一格装不下时（>6 行）回落成一张一份并在界面上说明原因 —— 原尺寸不缩放，挤不下就不硬塞，否则打印时凭空多一张纸。

**证据**（`.design-qa/shot-form-print.mjs` 把 `buildFormPrintHtml(form, 2)` 在无头 Chromium 里真渲染）：文档 210×296.99mm、`body.scrollHeight = 1123px`（正好一张 A4，不多出第二页）；两份块顶/底对称 16.46mm，左右留白 16.10 / 15.84mm（差 0.26mm = 1 设备像素的取整，非版面误差）；第二份文本只剩「业务单部门姓名需办理的业务部门主管签名财务主管签名总经理批示董事长批示」，无姓名/部门/正文/日期。图见 `.design-qa/actual/businessforms-print-2up.png`。

**守卫**：`sheetLayout.ts`（份数判定与行数估算，纯函数）+ 单测 6 例、`printHtml.test.ts` +3 例（两份结构、非法份数、居中与日期基线的 CSS 口径，并钉住"旧的绝对左偏移/前导空格不能回来"）、`templates.test.ts` 把原来的"前导空格 55 格"换成几何断言（`TABLE_LEFT == (pageW-tableW)/2`、左右留白相等、`DATE_RIGHT == TABLE_RIGHT - 575`、docx 侧同一条线）、`docxFile.test.ts` +2 例（右对齐 + `w:ind`、整份文档只有一个 `<w:tbl>`）、`saved-item-kinds.test.ts`（前后端 kind 清单逐名相等，少一边即红）、e2e `preview-zoom.spec.ts` 原「居中于纸张」一例升级为「整块水平居中 + 上下两份 + 第二份空白 + 刷新后份数还在」，另加超长正文回落一例。全梯：typecheck 干净、eslint 0 error / 78 warning（基线不变）、单测 81 文件 591 例、19/19 服务端脚本、build 通过、e2e 69/69。

**没有验证到的**：真机打印。纸面几何与文档总高是按渲染量出来的，但"送进打印机是不是恰好一张、有没有被驱动缩边打掉的边框"仍需一次实机确认（表格左右边框距纸边 16.1mm，比原来的 11.3mm 更安全）。


### 2026-09-27 追加三：业务单可以一次开多条

需求：「加入添加一条业务单内容的按钮，添加了多少条就打印多少张业务单，并相应生成预览画面。」确认后的口径是：连续排版两条一张、每条字段完全独立、左列做卡片列表、docx 一个文件多页且每条各归档。

版面侧把"一张纸两份"改成"一张纸最多 N 条"（`planSheets`）：第 1、2 条同纸，第 3、4 条下一张，凑不满的尾格仍补一张空白单。正文长到一格装不下的那条**独占一张且不补空白单**（补了就溢出成第二页，凭空多一张纸），并在界面上点名是第几条、约几行。多张纸连成一份文档时第二页起 `break-before: page`，不靠"正好 297mm"去猜分页边界。条目模型与"正文跟模板走、被手打过就不再覆盖"的规则收进 `lib/items.ts`（四个入口共用，避免组件里写四份略有出入的版本）。

实测（`.design-qa/shot-form-print.mjs` 无头渲染三条）：排布 = 第 1 张「杨新宇 + 林思婷」、第 2 张「王大力 + 空白单」；两张纸各 210×296.99mm，`body.scrollHeight=2245px` 正好两页；四张单据的槽位 y 一致（16.46–140.04 / 156.95–280.53mm），互不叠压。图见 `.design-qa/actual/businessforms-print-3items.png`。左列改成自己滚（`lg:max-h-[calc(100vh-9rem)]`）—— 第一版按 `100vh-3rem` 给上限，加到三条时整页又出现 52px 滚动条，被"放大预览只撑自己的框"那条 e2e 当场抓到，改成按标题区扣高度后回到 `mainScrollH == clientH`。

守卫：`items.test.ts`（8 例：id 不撞、正文跟模板 / 定稿后不再覆盖、换类型跟标准金额、沿用新增清空申领人、seed 正文视为定稿、formOf 只留版面字段）、`sheetLayout.test.ts` 重写为按张排布断言（含"独占一张不补空白单"）、`printHtml.test.ts` 覆盖多页分页与槽位数量、`docxFile.test.ts` 钉住"几条几节几页、不打空白单"；e2e 从 2 例扩到 4 例（居中与空白单、加到三条换纸与删除收回、沿用新增 + 空正文不许打印、超长独占一张）。全梯复跑：typecheck 干净、eslint 0 error / 78 warning、单测 82 文件 604 例、build 通过、e2e 71/71。

**仍未验证**：真机打印多页（纸数与分页是按渲染几何量的，打印机驱动行为没测）。条目内容本身不跨刷新保存（只有"一张纸几条"这个参数跟账号走），要做草稿持久化是另一件事。


### 2026-09-27 追加四：去掉份数开关，两格定高对齐 A4 对折线

用户看着「一张纸打印 2 条 / 1 条」问：多条之后这个开关是不是多余了？而且单条时业务单要像两条那样分上下排列，"方便我对折就可以裁剪"。两条都成立：

- **开关确实多余**。「一张纸 1 条」唯一的语义是"每条独占一张、整页居中"，而那正好是要被裁掉的行为；去掉之后 1 条 = 上半格内容 + 下半格空白单，与多条时的排布完全一致。连带删掉按账号存的 `business-forms-print` 参数（saved-items 前后端两份清单同步回退，`saved-item-kinds.test.ts` 的逐名相等规则保留，另加一条"清单真的读到了"防空转）。
- **两格改成定高半页**。原来槽位是 `flex:1 0 auto`（可长高、不缩），两条内容一高一矮时余量按格分摊，分界线就会漂离对折线；现在两张纸固定各 140.49mm、分界线锁在 148.50mm = 297/2，正好是 A4 对折线。单据只在格内居中，跨不过折线，所以"对折一刀"必然裁在两张单据之间。超过半页的那条仍然独占一张（本来就折不裁），且不给它补空白单。

实测（`.design-qa/shot-form-print.mjs` 无头渲染打印文档，量的是排版结果不是样式）：三条 = 两张纸（第 1 张「杨新宇 + 林思婷」、第 2 张「王大力 + 空白单」），`body.scrollHeight=2245px`；两格边界 `[8.01, 148.49]` 与 `[148.49, 288.97]`，单据落在 16.46–140.04 与 156.95–280.53 —— 距折线两侧各留 8.5mm。**只有一条时用的是同一组坐标**（16.46–140.04 + 下半格空白单），图见 `.design-qa/actual/businessforms-print-1item.png`。

守卫：`sheetLayout.test.ts` 新增"格底 = 页高一半"的几何断言（`marginTop + SLOT_H === pageH / 2`）与"单条也用上半格"；`printHtml.test.ts` 钉住 `data-slots` 与定高 140.49mm 的规则；e2e 在真实渲染里量 `slotBottom_mm ≈ 148.5` 并断言单据上下边都不跨过折线（`blockBottom < 148.5 < 下一格 blockTop`），另加"只有一条时下半格是空白单"。全梯：typecheck 干净、eslint 0/78、单测 82 文件 606 例、build 通过、e2e 71/71。

**过程中的一次抖动要记着**：`server/tests/ops-reliability.test.ts` 的"库可用 200 / 不可用 503"在全量并行里红过一次（605/606），单独跑 6/6 绿、再全量跑 606/606 绿。这条用例要起真进程 + 真库，和 :3000 的 dev server 撞在一起时最容易超时 —— 与本轮改动无关（服务端只回退了一个 kind 名），但它值得单独收一收（串行跑或放宽超时），别让它把"全梯绿"变成看运气。
