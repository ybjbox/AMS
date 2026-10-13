# 全站数字与统计整改清单（2026-10-12）

> 起因：考勤页那条统计带（打卡记录 1897 / 出勤人次 686 / 部门时段 11 / 异常考勤 70）被指出
> 「随数据变多就没有参考意义」。查下去发现这不是考勤一处 —— 全站没有共享统计组件
> （`Stats.tsx` 只服务考勤、`Dashboard/StatCards.tsx` 只服务首页），每个数字都是各页各自
> `Array.length` 现算，于是同一个数在 2~4 处各算一遍，且几乎全是**全历史累计**。
>
> 本清单每条都带 `file:line` 证据（2026-10-12 逐条读过源码），可直接照条施工。

## 0. 先立规矩（否则逐页改完还会再长出来）

页面上任何**给人看的数字**，必须同时满足三条：

1. **收窄**：按期间（本月 / 当前筛选）或按动作（待我处理 / 超期 / 剩 N 天）算，
   不接受"全历史累计"当头条数字 —— 它只会单调变大，不指向任何动作。
2. **唯一**：同一个数字一屏只出现一次。要重复展示就只保留**有动作**的那处。
3. **可动**：数字旁边要么能点进去（筛选 / 弹窗 / 跳转），要么说清为什么不能点。
   纯装饰的数字（涨跌徽章、配置条数）一律删。

**正例模板**（这两处的写法就是标准答案，改别的页时照抄）：
- `src/pages/Settings/panels/BackupPanel.tsx:157` —— 「已有备份 X / Y 份」+「最近一次备份 成功/失败 + 时间」+「磁盘剩余」，全部窗口化且每一项都对应一个动作。
- `src/components/SystemLogs.tsx:383` —— 「共 N 条，显示第 a–b 条」，随筛选变化，头部与列表永不打架。

**明确不算问题、不要动**：
- `src/pages/Settings/panels/DiagnosticsPanel.tsx:72` 的「请求异常」是内存环形窗口，
  但副标题已写明「内存窗口，最近 200 条；重启后清空属预期」—— 已披露，不是误导。
- 台卡 / 座位打印相关的数字基本干净。

---

## 1. P0 · 会误导删库（单独先走，别混在批量改动里）

### A1 清空打卡记录：确认框拿筛选后条数为全库背书

- 现状：`src/pages/Attendance/components/EmployeeRollupTable.tsx:85`
  写 `` `确定要清空全部 ${records.length} 条打卡记录吗？` ``，而 `records` 传进来的是
  `filteredRecords`（`src/pages/Attendance/index.tsx:184`）；服务端
  `server/attendanceDb.ts:478` 执行的是 `DELETE FROM punch_records`（无 WHERE）。
- 危害：筛到本月时确认框显示「63 条」，点下去删掉 **1897 条**。这个对话框是唯一的防线，
  而它给的数字是错的。
- 改法：确认文案改用全库真实条数（`a.records.length`），并补一句
  「（当前筛选下是 63 条，清空不受筛选影响）」。
- 验收：带筛选（命中数 ≠ 全量）时截图确认框，两个数字都出现且全量数与
  `GET /api/attendance/records?page=1&pageSize=1` 的 `total` 相同。
- 规模：S（一处文案 + 一个 prop）。

---

## 2. P1 · 数字与事实不符

### S1 排座「总座位数」算的是配置行，不是画布上的桌数

- 现状：`src/pages/Seating/components/TableConfig.tsx:93` = `tableCapacities.reduce((a,b)=>a+b.capacity,0)`；
  而删桌只动 `tables`，不删容量行（`src/pages/Seating/hooks/useSeatingArrange.ts:153-162`）。
- 危害：删过桌之后，屏幕上的「总座位数」比实际可坐人数大 —— 按 40 席订餐、现场只排 32 桌。
  同屏的「打印预览 (N桌)」（`PrintSettingsModal.tsx:411`）与每桌「N / cap 人」（`TableCard.tsx:128`）
  都会与它不一致。
- 改法：以画布为准（`tables` 求和，或 `tables.length 桌 / 已排人数`），容量配置行只作为"可添加的模板"。
- 验收：建 5 桌 → 删 2 桌 → 总座位数应等于剩下 3 桌之和；与打印预览的桌数一致。
- 规模：S。

### A2 考勤同一批数字三个口径并存

- 现状：统计带 `src/pages/Attendance/index.tsx:150` 传 `a.anomalies.length`（全历史 70）；
  工作流条第三份（`src/pages/Attendance/lib/workflow.ts:81,97` → 「1897 条已导入」「70 条异常待处理」）；
  表脚合计取筛选后（`EmployeeRollupTable.tsx:205-209`，数据来自 `index.tsx:86` 的 `anomaliesInRange`）。
  1897 一屏出现 4 次：`Stats.tsx:28`、`workflow.ts:81`、`FilterBar.tsx:191`、`EmployeeRollupTable.tsx:111`。
- 危害：筛「本月」时同一屏并存 70 与区间内的小数字，标签又都叫「异常考勤」，
  读的人会以为筛选没生效。
- 改法：**删掉整条 `Stats.tsx`**（四个数全在工作流条里有更合适的落点），
  工作流条各步的 detail 改为按当前期间收窄；表头合计保留（它是唯一随筛选变的）。
- 验收：同一屏内每个数字只出现一次；切「本月」后所有数字都跟着变。
- 规模：M（含 §2.6 接手判据同步改，见 §6）。

### A3 工作流第②步永远"已完成"，全页没有数据新鲜度

- 现状：`workflow.ts:81` 只要 `recordCount > 0` 就输出「N 条已导入」并给 emerald 勾
  （`WorkflowBar.tsx:31` 的 done 态）。全页无「最新打卡日距今 X 天」；该信息只在
  `src/pages/Dashboard/components/AttendanceHeatmap.tsx:79` 的灰格脚注里。
- 危害：实测最新打卡日是 **2026-10-01，距今 11 天**，而页面第②步仍显示绿色"已完成"。
  这是考勤模块最该催人的信号，现在完全没有。
- 改法：第②步 detail 带上最新打卡日与距今天数，超过阈值（如 >7 天）降级为 todo/amber；
  异常表默认排序从 `date asc` 改为**倒序**（`AnomaliesTable.tsx` 的 sort 初值），本月异常不再沉在长列表最底。
- 验收：以当前数据，第②步应显示「最新 2026-10-01 · 11 天前」且非绿色。
- 规模：S~M（`deriveWorkflowSteps` 需多一个入参，配套补 `lib/__tests__/workflow.test.ts`）。

---

## 3. P2 · 该出现的数字没出现

### C1 合同管理没有到期量级

- 现状：只有逐行徽章 `已过期 / 即将到期 / 正常 / 未登记`
  （`src/pages/Contracts/components/ContractTable.tsx:109`），且「(N天后)」仅在
  `isExpiringSoon`（`同文件:91` = `daysToExpiry <= 30 && > 0`）时出现；已过期**没有量级汇总**。
  页脚只有 `Pagination totalItems = filteredUsers.length`（`Contracts/index.tsx:152-156`）。
  真正带动作的「剩 N 天」清单只存在于 `Settings/panels/RemindersPanel.tsx:183`。
- 改法：合同页顶部给一行「已过期 N · 30 天内 M · 未登记 K」，点击即筛选；
  「已过期」必须与"即将到期"同等可见（现在它只把单行涂红，量级看不见）。
- 验收：三个数与逐行数出来的条数一致；点数字能跳到对应筛选。
- 规模：M。

### T1 待办与审批缺"逾期 / 已等 N 天"

- 现状：侧栏角标 `src/components/layout/Sidebar.tsx:40` 与首页卡
  `src/pages/Dashboard/hooks/useDashboard.ts:112` 各自写了一遍
  `todos.filter(t => !t.completed).length`（全历史，>99 显示 99+）；
  `src/pages/Todos.tsx` 页内**没有任何**「逾期 N / 今日到期 N」计数（grep 命中 0）。
  审批中心同样只有页签红点 `pending.length`（`src/pages/Approvals/index.tsx:560`），
  台账取数 `limit: 300` 静默截断且不显示总数（同文件 `:91`）。
- 改法：两处 filter 表达式收进 store 的一个 selector（消除各算一份）；
  待办页加「逾期 N · 今日到期 M」；审批台账在 `list.length === limit` 时明说"仅显示前 300 条"。
- 验收：逾期数 = 逐行数出的过期条数；侧栏与首页数字来自同一个 selector（grep 只有一处表达式）。
- 规模：M。

### D1 控制台的假新鲜度与死 UI

- 现状：`useDashboard.ts:193` 的 `lastUpdated: formatDateTime(new Date())` —— 是**取数时刻**，
  与库里数据新旧无关，长得却像"数据最后更新"；四张统计卡的涨跌徽章永不渲染
  （`useDashboard.ts:211-214` 的 `trend` 全写死 `'neutral'`、`change: '—'`，
  渲染分支在 `Dashboard/components/StatCards.tsx:47-62`）。
  同屏还有两个"员工总数"口径：`useDashboard.ts:211` 的 `totalEmployees` 与
  `DepartmentDistribution.tsx:16,61` 的「共 N 名在册员工（不含离职）」。
- 改法：`lastUpdated` 改名「本次刷新时间」或直接删；删掉永不渲染的涨跌槽位（连同 `StatCards` 的分支）；
  两个员工数并成一个并写清口径。
- 验收：控制台不存在无来源的"最后更新"字样；`StatCards` 里没有死分支。
- 规模：S~M。

---

## 4. P3 · 同源数字重复展示（低危，清理即可）

| 编号 | 页面 | 重复处 | 证据 |
|---|---|---|---|
| M1 | 餐券 | 「共 N 张」+「每页 N 张 × N 页」与「打印预览 (N页)」；「打印记录 N 批」是台账全历史、无动作 | `MealVouchers/index.tsx:218-220`、`:302`、`:251` |
| B1 | 业务单 | 同一个 `plan.sheets.length` 一屏三次（「N 张纸」/「打印 N 张」/「A4 预览（N 张）」）；「已存档 N 条」是 `useState(0)` 会话内累加，刷新归零 | `BusinessForms/index.tsx:508`、`:518`、`:560`、`:81`+`:547` |
| F1 | 常用文件 | 同卡两处「包含文件 (N)」与「…等共 N 份文件」都取 `documentIds.length`，而列表对已删文件 `if (!doc) return null` 静默跳过 → **数字比列出的行多** | `Documents/components/DocumentSetGrid.tsx:96`、`:101`、`:111` |
| W1 | 企业微信 | 提示行「已处理 / 新增 / 补正 / 跳过」与两张 `ReportTable`（本次预览、上次同步）三份同数；成员映射区无「待认领 N 个」 | `Settings/panels/WeComPanel.tsx:466`、`:477-478` |
| AC1 | 账号管理 | 头部 `共 {stats.total} 个账号 · 未绑定 …` 是全量口径，下方 `rows` 被 4 个筛选器收窄却从不显示筛选后条数 | `components/AccountManager.tsx:253`、`:420` |
| MR1 | 月度报表 | 「{rows.length} 名员工」与表脚「合计（{rows.length} 人）」同屏重复 | `Attendance/components/MonthlyReport.tsx:169`、`:284` |
| 其他 | AI 配置 / 座位方案 | 「已填写 N 字」两处；同一方案「N 桌」两处 | `AiConfigPanel.tsx:638,651`；`Seating/index.tsx:252` + `PlansModal.tsx:92` |

F1 与 AC1 不只是重复：F1 的计数**含已删文件**（数字会比可见行大），AC1 的头部数字与筛选后可见行数必然不符 —— 这两条按 §0 的第 1、3 条规矩处理（计数改为按可见集合、或标注"含 K 个已删除"）。

---

## 5. 建议执行顺序

1. **A1 单独一次提交**（P0，改动最小、风险最高，先止血）。
2. A2 + A3 一起做（同一页、同一批数字，一次改完再截图核对）。
3. S1、F1、AC1（数字与事实不符类）。
4. C1、T1、D1（缺数字类，各页独立，可并行）。
5. §4 那批重复展示，攒成一次清理提交。

每步都要：`npm run typecheck` / `npm run lint`（0 error）/ `npm run test:run` 全绿，
并在真实数据（1897 条打卡 / 28 人）下用浏览器点到，附截图或 `.design-qa` 脚本输出。

## 6. 连带要改的文档

`docs/HANDOVER-2026-10-11.md` §2.6 拿「打卡记录 1897 / 出勤人次 686 / 部门时段 11 / 异常考勤 70」
当恢复核对判据。A2 把统计带删掉后，判据要换成：工作流条的「N 条已导入 / N 条已配置」+
`GET /api/attendance/day-verdicts?month=2026-09` 的行数（实测 840）+
`.design-qa/check-live-3000.mts` 的输出。数字本身不变，变的是在哪儿读。
**（已随 A2 一并改掉，接手文档 §2.6 现读工作流条与表脚合计。）**

---

## 7. 执行状态（2026-10-12 上午）

**已改完并验证**：A1、A2、A3、S1。

| 项 | 落点 | 实测 |
|---|---|---|
| A1 | `EmployeeRollupTable` 新增 `totalCount`，确认框报全库数并写明筛选下是多少；按钮可见性也改用全库数 | 新测试 `src/pages/Attendance/__tests__/clear-records-confirm.test.tsx` 3 例 |
| A2 | 删掉整条 `Stats.tsx` 统计带（连带删掉只有它在用的 `countPunchDays` 与其 2 例测试）；`useAttendance` 不再输出 `punchDays/totalPunchDays` | 界面核对：`出勤人次`/`异常考勤` 两个标签 0 命中 |
| A3 | 工作流第②步改报「最新 YYYY-MM-DD · N 天前」，超 `STALE_PUNCH_DAYS=7` 天从 done 降级为 todo；第④步异常数收窄到最近一个考勤月并带月份；异常表默认按日期倒序 | 真实库：第②步显示「最新 2026-10-01 · 11 天前」且不再是绿色已完成；第④步「6 条异常待处理 · 2026-10」（原先报全历史 70）；异常表首行 2026-10-01、末行 2026-08-31 |
| S1 | `TableConfig` 的「总座位数」→「座位」按画布现有桌次求和（每桌取 `max(容量, 已坐人数)`），并新增「已入座」 | 新测试 `src/pages/Seating/__tests__/table-config.test.tsx` 4 例（5 桌计划/画布 3 桌 → 30 席而非 50） |

验证：`npm run typecheck` 干净、`npm run lint` 0 error、`npm run test:run` 98 文件 / 803 例全绿、
`.design-qa/verify-metrics-fixes.mts` 11 项界面核对全过、
`.design-qa/check-day-verdicts.mts` 仍是 840 行三方逐字一致（本轮没碰判定装配）。

### 7.1 §4 那批重复计数 + 试用期逾期（2026-10-13 上午）

| 项 | 改法 | 落点 |
|---|---|---|
| F1 | 计数改按**解析得到的**文件（`found`），并列出"另有 K 个已被删除"；`… 等共 N 份文件` 改成 `还有 N 份未列出`（不再重复总数）；全删空的套件禁用「一键打印」 | `DocumentSetGrid.tsx` |
| AC1 | 头部改成 `筛选后 X / 共 Y 个账号`（有筛选时），其余五项加 `title` 说明它们恒为全量口径 | `AccountManager.tsx` |
| MR1 | 表脚 `合计（N 人）` → `合计`（人数只在表头汇总说一次） | `MonthlyReport.tsx` |
| M1 | 预览面板标题去掉 `（N页）`；`打印记录 N 批` → `全部历史 N 批` + `title` 说明不受期间筛选影响 | `MealVouchers/index.tsx` |
| B1 | `A4 预览（N 张）` → `A4 预览`（张数在「打印 N 张」按钮上）；`已存档 N 条` → `本次已存档 N 条`（它是会话内累加、刷新归零，不写"本次"就是假累计） | `BusinessForms/index.tsx` |
| W1 | 同步提示行不再抄一遍四个数：进行中只报 `已处理 X 条`，跑完指路到下方「上次同步」表；成员映射区补 `N 个账号 · 待认领 K 个` | `WeComPanel.tsx` |
| 其他 | AI 配置折叠徽章 `已填写 N 字` → `已自定义`（字数只在编辑器下方那处保留） | `AiConfigPanel.tsx` |
| 试用期 | 去掉 `days > 0` 下界：届满未转正会一直提醒；标题分 `试用期已届满`、级别从 info 升 warning；两类提醒的文案合并成一张 `COPY` 表 + 一个 `reminderMessage()`（逾期/今天/将至三种句式共用） | `remindersDb.ts`、`RemindersPanel.tsx` |

**看过但判定不改**：座位方案「N 桌」在两处出现（`Seating/index.tsx` 的恢复横幅 与
`PlansModal.tsx` 的方案列表行）—— 二者不在同一屏（横幅在画布页、行在弹窗里），
且各自承担"这是哪个方案"的识别作用，删掉任一处都会让那一屏变成只有一句没有指代的话。

验证：typecheck 干净、`npm run test:run` 102 文件 / 838 例全绿；
`reminders-scan.test.ts` 新增"试用期满未转正"用例（断言被收进、daysLeft<0、标题与级别、
以及**排序断言收窄到本组自造数据** —— data-test 是共享库，断言全局 `items[0]` 会随别的
用例写入的演示种子漂移，这次就是这么红的）。

### 过程中挖出来的两件事

1. **`attendance-verdicts-parity.test.ts` 偶发红的根因不是并发写库本身**，而是测试把装配算了两次
   （一次给断言、一次给导出），两次之间别的测试文件改了共享的 data-test。
   修法：`buildAttendanceProofSheet(month, pre?)` 增加可选的"已算好的装配"入参，
   测试把同一份快照同时喂给两边 —— 既消除竞态，也让"表格与接口出自同一次装配"这句话
   在测试里字面成立。生产调用方不传第二个参数，行为不变。
2. **`monthEdge` 用的是全库最晚打卡日，不是该员工自己的**（`attendanceDayVerdicts.ts` 里
   `date >= dbMaxDate`，而 `VerdictEmployee.lastPunchDate` 已经算好了每个人自己的最后一天）。
   代码注释写的是「该员工的记录就停在这一天」，实现却是全局口径 —— 两者不等价：
   某人 9-20 之后再没打过卡，而库里别人一直打到 10-01，那 9-20 到底是"缺下班卡"还是"记录没覆盖次日"，
   全局口径会判成后者（不标 ★），个人口径会标出来。
   本轮**没有改**：这会改变真实数据的输出（2026-09 的 ★ 数可能从 0 变成若干），
   属于判定口径，得先和使用者确认按哪个语义。留作下一个决定。

### P2 三项（D1 / C1 / T1）也已改完

| 项 | 落点 | 实测 |
|---|---|---|
| D1 | 控制台「最后更新时间」→「本次刷新」（它本来就是取数时刻）；删掉永不渲染的涨跌徽章分支与 `StatItem.change/trend`；员工数并成一张「在册员工」卡（原 `/users` 全量请求一并去掉），部门分布不再重复总数 | 界面：`最后更新时间` 0 命中、`本次刷新` 1 处、卡片显示 28、`名在册员工` 0 命中 |
| C1 | 分档判断收进 `Contracts/utils/expiryBucket.ts`（徽章与量级同一份），页顶加「已过期 / 30 天内到期 / 未登记到期日 / 正常」四个可点数字，0 的档位禁用；筛选走 URL 态 | 界面：四个数合计 28；点「未登记到期日 28」→ 分页「共 28 条记录」；三个 0 档均不可点 |
| T1 | 待办口径收进 `store/useTodoStore.ts` 的 `todoUrgency()`（侧栏角标、首页卡、待办页三处共读）；待办页顶部加「全部 / 已逾期 / 今天到期 / 未完成」点即筛选；审批记录取满 300 条时明说截断 | 新测试 `store/__tests__/todo-urgency.test.ts` 4 例（含边界与无截止日）；界面待办四个数渲染正常（真实库 0 条，见下） |

验证：`typecheck` 干净、`lint` 0 error、`test:run` **100 文件 / 810 例全绿**、
`.design-qa/verify-p2-fixes.mts` 12 项界面核对全过（截图 `p2-dashboard/p2-contracts/p2-todos.png`）。
仓库整体不是 prettier-clean（未改动的文件同样报 warn），所以**没有跑** `npm run format`，避免一大片无关 diff。

## 8. 改数字时撞出来的更大一件事：合同到期这条链在真实数据上是空的

C1 做完，页顶四个数长这样：**已过期 0 · 30 天内到期 0 · 未登记到期日 28 · 正常 0**。
查了接口才确认不是筛选坏了：

| 字段 | 28 名员工里有值的 |
|---|---|
| `contractExpiry`（到期日） | **0** |
| `contractSignDate`（签订日） | **0** |
| `contractYears`（年限） | 28（看着像默认值） |

连带后果，都不需要改代码就能推断、但值得当面确认：

- 「即将到期」提醒（`RemindersPanel` 的「剩 N 天」）在真实库里永远为空；
- 合同驱动的自动待办也不会产生 —— 实测 `/api/todos` 返回 **0 条**，所以 T1 那些催办数字现在必然是 0；
- 合同管理页的红色「已过期」徽章永远不出现。

也就是说：**合同模块现在能做的只有"生成与打印"，"到期管理"整条链在等一个从没登记过的字段。**
这与接手文档 §8 里「`employees` 缺身份证号/电话/入职日期」是同一类问题，但影响面更大 ——
那三个字段只是信息不全，这两个字段决定一整个功能是否活着。
下一步要么补数据（有 28 份合同的纸质/扫描件就能批量录），要么明确"这库不做到期提醒"，
把那几处入口摘掉，免得让人以为提醒在工作。

### 8.1 已补 mock 数据（2026-10-12，用户选择写真实库）

`scripts/seed-contract-mock.ts`（默认干跑，`--apply` 才写库）：

```
node --import tsx scripts/seed-contract-mock.ts                 # 干跑，只打印将写入什么
node --import tsx scripts/seed-contract-mock.ts --apply         # 快照 → 写入 → 跑一轮提醒扫描
node --import tsx scripts/seed-contract-mock.ts --rollback 20261011221006
```

分布（按工号排序，固定偏移不随机，跑两次得到同一批日期）：
**已过期 3**（-120/-45/-3 天）· **30 天内到期 4**（+5/+12/+21/+29）· **正常 19** · **保持未登记 2**（EMP0027/28）
= 28 人。签订日 = 到期日回推 `contractYears` 年（这批人都是 3 年）。

三条硬规矩都实现了：写入前 `VACUUM INTO` 快照；**已有真实到期日的人一律跳过**（不盖真数据）；
回滚按 id 精确删本次生成的待办/通知，不用 type 一把清。
快照与回滚记录在 `data/contract-mock/`（`pre-<ts>.db` + `rollback-<ts>.json`，随 `data/` 一起被 gitignore）。

链已实测打通：合同页 `已过期3 / 30天内到期4 / 未登记2 / 正常19`（合计 28），点「已过期 3」→ 分页「共 3 条记录」；
提醒扫描 `命中 4 条 · 新生成待办 4 条 · 收件人 1 个`，5 天那位是钟德仁（2026-10-17）；
待办页 `全部 4 · 未完成 4`；通知 4 条。

**顺带证实了一个真实缺口，已按用户决定修掉 —— 见 §8.2。**

### 8.2 已过期纳入提醒（2026-10-12，用户决定）

`server/remindersDb.ts` 三处改动：

1. 窗口去掉下界：`days <= 阈值` 即命中（离职仍排除）。阈值从此只是**提前量上界**，不再隐含
   "过期多久就不管"；面板那格输入也补了说明「已过期的合同不受此数限制，会一直提醒」。
2. 文案与标题分开：过期的人标题「合同已过期」、正文「已于 X 到期（逾期 N 天），需尽快续签或说明」；
   当天到期单独写「今天（X）到期」。原先会出现「将于 2026-08-28 到期（剩余 -45 天）」这种没人看得懂的字。
   `refKey` 不变（`contract:<工号>`），通知仍是原地刷新而不是多出一条。
3. 排序改为最紧急在前（`daysLeft` 升序）：过期 120 天的排在"还有 29 天"上面。

**踩到的一件事**：待办按 `(createdBy, type, targetId)` 未完成去重，所以**改文案不会刷新已存在的未完成的待办**。
第一次重扫时那 3 条过期待办仍是服务进程用旧文案建的，字面写着「剩余 -3 天」。
处理办法是回滚再重放（`--rollback` → `--apply`），顺带证明了回滚工具本身可用：
回滚输出 `清掉待办（记账 4 + 按人 3）` —— 那"按人 3"正是服务端自己扫出来、脚本账本外的条目，
所以 `--rollback` 除了删记账 id，还会按"被 mock 的工号 + 自动提醒类型"再兜一层
（通知侧按 `refKey IN (...)` 精确删，不用 `LIKE 'contract:%'` 一把清，免得伤到没被 mock 的人）。

实测（真实库，重放后）：`/api/todos` 7 条 —— 3 条「合同已过期」（逾期 120 / 45 / 3 天）
+ 4 条「合同到期提醒」（剩 5 / 12 / 21 / 29 天）；提醒面板 7 行、第一行就是已逾期、红色标注、
无负数文案（`.design-qa/verify-reminders-expired.mts` 5 项全过，截图 `reminders-expired.png`）。
回归：`server/tests/reminders-scan.test.ts` 加了已过期用例（`daysLeft = -20`、排第一、标题「合同已过期」、
窗口调小到 5 天时过期的仍然提醒），7 例全过；全量 `test:run` 100 文件 / 810 例、`test:server` 19/19、`lint` 0 error。

> 试用期那一档（`status = 试用期` 且转正日已过）仍是 `days > 0` 才提醒 —— 同类的静默缺口，
> 这次没动（用户只点了合同）。要一起改是同一处两行的事。

⚠ mock 数据现在在真实库里。用完记得回滚，否则哪天真的录入合同日期时，这 26 条假日期会混在里面
（脚本本身会跳过"已有到期日"的人，所以真录进去之后重跑 `--apply` 不会盖掉真数据 —— 但假数据得靠回滚清）。
另外快照 `pre-*.db` 和真实库同在 E 盘，不解决接手文档 §12.3 那个"只有一份"的问题。
