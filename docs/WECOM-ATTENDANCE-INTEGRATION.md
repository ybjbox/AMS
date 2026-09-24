# 企业微信考勤接入调研（AMS）

> 状态：**P0/P1 链路已于 2026-09-23 落地**（`server/wecomDb.ts` / `wecomClient.ts` / `wecomSync.ts` / `wecomRouter.ts` + 设置页「企业微信打卡」面板，回归 `server/tests/wecom-sync.test.ts` 20 例）。
> 剩下的只是**真实凭据**：企业微信后台建自建应用 → 把出口 IP（家宽就填出网代理机的 IP）配进可信 IP → 在面板里填 CorpID/Secret（必要时填「出网代理」）→ 检测连接。
> 2026-09-24 追加：判定层支持三班倒与凌晨跨零点交接（P2 末），并落地**出网代理**（P3）以解家宽动态 IP 的门槛。
> 下面第一~四节是当时的调研原文（保留作接口口径备查），第五节的三个决策已在文末记为已定。
> 环境事实（2026-09-20 起）：企业微信自建应用与 API 凭据**尚未创建**。

企业微信侧的接口能力是够的，但**开通姿势**和**数据落库**有两处硬约束会直接决定方案形态。

---

## 一、企业微信侧要做什么（按这个顺序）

1. **管理后台 → 应用管理 → 自建应用**：新建一个应用（名字如「行政考勤同步」），记录 **AgentId** 与 **Secret**；企业 ID（**corpid**）在「我的企业」页面底部。
2. **配置可信 IP（强制）**：`开发前必读` 明确——2022-06-20 20:00 后**新创建的自建应用必须在管理端配置可信 IP，仅配置过的 IP 能调接口**（错误码 `60020` 就是这个；token 失效相关为 `40014`）。
   ⚠️ 这是本系统的第一个现实问题：AMS 现在跑在本机，出口 IP 是家宽动态地址，每次变了就会 40014/60020。要么把同步进程部署到有固定公网 IP 的机器/云主机，要么接受"IP 变了去后台改一次"。
3. **开通打卡接口权限**：`获取打卡记录数据` 的权限说明要求自建应用**配置到「打卡 → 可调用接口的应用」**里。并且——**2023-12-01 0 点起不再支持用「系统应用 secret」调用**，必须走自建应用 secret。
4. **可见范围**：应用可见范围决定能取哪些人的打卡数据（接口只能取"可见范围内员工"），建议按部门圈定或全企业。

---

## 二、核心接口与硬限制（官方文档口径）

| 项 | 值 |
|---|---|
| 请求 | `POST https://qyapi.weixin.qq.com/cgi-bin/checkin/getcheckindata?access_token=…` |
| 入参 | `opencheckindatatype`(1 上下班 / 2 外出 / 3 全部)、`starttime`、`endtime`(Unix 秒)、`useridlist` |
| **时间跨度** | **单次不超过 30 天** |
| **人数** | **useridlist 不超过 100 个**，超了要分批 |
| **频率** | 每企业 `getcheckindata` ≤ **600 次/分**（通用上限：每企业单接口 1 万/分、每 IP 2 万/分） |
| 返回 | `userid`、`groupname`、`checkin_type`(上班打卡/下班打卡/外出打卡)、`exception_type`(时间异常;地点异常;未打卡;wifi异常;非常用设备，分号分隔)、`checkin_time`(Unix)、`location_title`/`location_detail`、`wifiname`、`wifimac`、`notes`、`mediaids`、`lat`/`lng`(GCJ-02，×1e6)、`deviceid`、`sch_checkin_time`(标准上下班时间)、`groupid`(打卡规则 id)、`schedule_id`(班次 id)、`timeline_id`(时段 id) |

**access_token**：`GET /cgi-bin/gettoken?corpid=&corpsecret=`，有效期 **7200 秒**、**每个应用独立**、**必须缓存**（频繁调 gettoken 会被频率拦截）。官方明确 **access_token 绝不能返回给前端**——AMS 侧同理，`corpsecret`/token 只留在服务端，配置回显走掩码。

同目录可选数据源：`获取员工打卡规则`、`获取打卡日报数据`、`获取打卡月报数据`、`获取打卡人员排班信息`、`为打卡人员排班`、`获取设备打卡数据`。

---

## 三、AMS 侧现状（这决定了不能怎么接）

- **没有外部 ID 字段**：`employees` 只有 `id(EMP####)/name/idCard/phone`，**无 wecomUserId**；`departments(id,name,priority,parentId)` 也无外部部门 ID。而打卡接口返回的是 `userid` → **必须先建映射**。
- **`punch_records` 没有唯一约束**（`server/attendanceDb.ts:67-97`），同员工同日同时刻可重复插入 → 同步任务重复跑就会堆重复行。
- **`PUT /records` 是整表替换**（`replaceRecords`：先 `DELETE FROM punch_records` 再全量 INSERT，`server/attendanceDb.ts:277-293`）。
  ⚠️ **同步绝对不能走这个端点**，否则每次同步都会把别处写入的数据冲掉。
- 考勤侧**目前没有服务端 Excel 解析器**（前端 `src/pages/Attendance/components/Filter.tsx:66-78` 只弹"即将上线"），所以企业微信同步会是**第一条真实的外部考勤入库通道**，去重 / upsert 语义要一次做对。
- `analyzeAnomalies`（`server/attendanceDb.ts:492-564`）依赖 **AMS 自己的 shifts + schedules**，不认企业微信的 `groupid`/`schedule_id`；请假日靠 `approvals` 豁免（`server/attendanceDb.ts:462-489`）。→ 打卡记录可以直灌，但**"迟到/早退判定"仍按 AMS 排班算**，两套班次体系不会自动对齐。
- 可复用的既有模式：
  - 凭据配置照抄 `server/notifyDb.ts`（settings KV + `maskSecret`/`MASK_SENTINEL`/`mergeNotifyConfig` 掩码回显，`:14/:33/:80-122`）；
  - 周期作业照抄 `startBackupScheduler`（`server/backupDb.ts:270-295`，setInterval + `.unref()` + env 开关 + 日志，注册于 `server.ts:407`）；
  - 异步作业通道 `server/importJobsDb.ts:29-42/73-106`（前端 202 + jobId 轮询，已在员工导入链路验证）；
  - 设置面板注册在 `src/pages/Settings/index.tsx:54-101` 的 `TAB_GROUPS`（`minRole: ADMIN`）；
  - 服务端权限 `server/authMiddleware.ts:112-166` 的 `POLICIES`（注意：没有独立 authGate 文件），前端权限码 `src/config/permission.ts:20-50`。

---

## 四、建议的接入形态（分三期）

> 2026-09-23 更新：P0 与 P1 已合并为一批落地，下面保留原设计并标注实际差异。

### P0 · 打通链路（只读，不写库）✅ 已落地

- `server/wecomDb.ts`：配置（corpid / agentId / appSecret 掩码 / 同步开关 / 时间窗）+ 成员映射 + 同步游标；
  `server/wecomClient.ts` 负责 access_token 缓存（含提前失效重取）。
- `POST /api/wecom/preview`：干跑报告，**完全只读**（不写打卡、不登记映射、不抬游标）。
- 映射表 `wecom_bindings(wecomUserId PK, employeeId NULL=待认领, boundAt, boundBy, lastSeenAt)`；
  设置页「企业微信打卡」面板做登记/认领/退回/删除。**实际差异**：
  一个员工只能被一个 userid 认领（部分唯一索引，与账号↔员工同口径）；
  权限**没有**新增 `attendance:sync` 权限码，而是 `POLICIES` 里 `/wecom` 整段限 ADMIN+（面板按角色秩隐藏）。
- 落库标记：`punch_records` 新增 `source` 列（`''`=补卡/导入/手工，`wecom`=同步），考勤页「打卡记录」显示来源徽标。
  时间统一写成 `HH:mm:ss`，与 Excel 导入通道同形，否则同一分钟会被唯一索引认成两条。

### P1 · 定时增量同步 ✅ 已落地

- 游标在 `wecom_sync_state`，每轮拉 `[cursor - 回看窗口, now]`（默认回看 120 分钟，可调），
  幂等靠 `(employeeId, date, time)` 唯一索引 + `INSERT … ON CONFLICT DO NOTHING`。
- 手动「立即同步」复用 `import_jobs` 通道（202 + jobId 轮询）；`startWeComSyncScheduler()` 照备份范式，
  默认关（配置页开关 + `WECOM_SYNC_ENABLED=false` 总闸），因为可信 IP 没配好之前一次接口都不该发。
- **任一分段失败即整体失败、游标不抬**：半途而废的同步会让缺口永久静默。一次补拉上限 180 天，内部按 29 天分段、每 100 人分批。

### P2 · 班次对齐 → 已按「部门工作时段 + 自动对班」落地（2026-09-23）

原设想是"要不要采信企业微信 `exception_type`"。裁定结果是否定的：用户按部门预先给出上班时间段，
系统按打卡时间**自动匹配**当天该上哪个班，既不逐日排班也不看企业微信的异常标记。实际形态：

- `server/shiftMatch.ts`（纯函数，异常分析与月报共用同一份判定）+ `server/shiftRulesDb.ts`（`dept_shift_rules`）。
- 一个部门可配多条时段（早班/正常班并存），每条带自己的工作日集合；**首卡**与上班时间的偏差最小者胜出，
  超过容忍 180 分钟就判"没对上班"而不是硬套一个班（逐日排班是明确指定，不受该容忍限制）。
- 未配时段的部门沿组织树向上取**第一个配了时段的祖先部门**，判定说明里写清来源（例：`对班：北京分公司 · 正常班 09:00-18:00`）。
- 优先级：**部门时段一旦生效就压过该员工的逐日排班**；没配时段的部门仍走排班（回退，不是并存）。
- `POST /api/attendance/analyze` 返回 `coverage`（按部门时段 / 按排班 / 未对上 / 无判定依据 / 请假日跳过 + 前 20 条原因），
  并留档在 settings KV，刷新或换设备仍能看到"为什么没有异常"。
- 界面：考勤管理 →「部门时段」（含"试算某部门实际生效的时段"）+ 异常分析页顶部的覆盖率条。
- ~~不支持跨夜班~~ **2026-09-24 已支持三班倒**：判定单位从日历日改成班次实例（归属日=首卡那天、末卡可跨到次日），
  16:00–00:00 与 20:00–04:00 这类时段可直接配，界面标「次日」。见 `server/shiftMatch.ts` 的 `buildShiftInstances`。

### P3 · 出网代理（解「家宽动态 IP 调不了 API」）✅ 已落地（2026-09-24）

可信 IP 是自建应用的硬门槛，而 AMS 常跑在出口 IP 会变的家用宽带上。除了"把服务搬到固定 IP 的机器上"，
现在的解法是**让请求经由一台固定公网 IP 的代理机出网**，可信 IP 填那台机器：

- 配置项 `proxyUrl`（`http://host:port`，可带 `user:pass`）在设置页「企业微信打卡 → 出网代理」。
  只收 http/https 代理（undici 的 ProxyAgent 也只支持这两种），拒路径与查询；清空即直连。
- 实现上**只有配了代理才换用 undici 自带的 fetch + ProxyAgent**，未配时仍走原来的全局 fetch，
  不给现网链路引入第二套 HTTP 栈。代理连接池按地址复用，`resetWeComProxyAgents()` 供测试与改配置时释放。
- 目标接口是官方 https 时，代理只建立 **CONNECT 隧道**：看得到 `qyapi.weixin.qq.com:443`，
  看不到 path/query，因此 `corpsecret` 与 `access_token` 对代理机不可见。
- 代理地址可携带凭据，故与 `corpSecret` 同档处理：回显掩码成 `http://user:********@host:port`，
  审计 `SECRET_KEYS` 里整条丢弃；代理地址还参与 access_token 缓存键（换出口机必然重新换 token）。
- 另两条不改代码的路：① 后台导出打卡 Excel 后走考勤页的服务端导入通道（零凭据、非实时）；
  ② 接受 IP 漂移 —— 任一分段失败不抬游标 + 每轮回看，改完可信 IP 再点一次「立即同步」就会自动补齐缺口。

---

## 五、需要确认的三件事（2026-09-23 已裁定）

1. **部署位置** → 先把链路做完、不等凭据。真实联调要等企业在微信后台建自建应用并把出口 IP 配进可信 IP；
   期间用本机假服务（`127.0.0.1` 被 `validateWeComBaseUrl` 显式允许）跑完整回归与真机取证。
   ⚠️ 可信 IP 仍是硬门槛：IP 变了会 60020。三条出路见上面 P3 —— 搬固定 IP 机器 / 配出网代理 / 接受漂移后手动补拉。
2. **数据范围** → `opencheckindatatype` **固定为 1（只取上下班）**，且 `lat`/`lng`/`wifimac`/`wifiname`/`deviceid`/
   `mediaids`/`location_*`/`notes` **在客户端边界就被丢弃**（`wecomClient.toPunch()` 只挑 `userid` + `checkin_time`）。
   默认拒绝：以后要加字段必须显式改那个白名单，敏感数据不会经由预览报告、日志或落库泄露。
3. **判定口径** → 两边都不直接用。**用户会提前给出各部门上班时间段，需要按打卡时间自动匹配对班，而不是提前逐日排班。**
   所以：同步只负责把打卡事实（工号/日期/时间/来源）落库，异常判定要新做一层
   「部门工作时段规则 + 按打卡时间自动匹配」（AMS 现有 `analyzeAnomalies` 依赖 `schedules` 逐日排班，与这个形态不兼容）。
   这一层**不在本批**，见 ROADMAP N1 的剩余项。

---

## 附录：通讯录侧的取数限制（建映射时会踩到）

- `GET /cgi-bin/user/simplelist?department_id=`：自 2022-08-15 起，**新加入的「通讯录管理」可信 IP 不再支持该接口取部门成员明细**，只保留 `user/get` 单个查询等能力。
- `POST /cgi-bin/user/list_id`：**只能用工厂自带的「通讯录同步」secret** 调用，游标分页，`limit` ≤ 10000，返回 `dept_user[department, userid, user_order]`。
- 结论：**不要为了建映射去引通讯录同步 secret**。更稳的做法是走打卡数据本身（`getcheckindata` 返回的 userid 集合）+ 设置页人工认领；需要全量名单时再单独评估通讯录权限。
- 也可让员工在企业微信「个人信息」里看到自己的 userid，由员工自查后绑定，但这在行政场景通常不如管理员认领方便。

## 参考文档

- [获取打卡记录数据](https://developer.work.weixin.qq.com/document/path/94205)
- [获取access_token](https://developer.work.weixin.qq.com/document/path/91039)
- [开发前必读（可信IP）](https://developer.work.weixin.qq.com/document/path/90664)
- [访问频率限制](https://developer.work.weixin.qq.com/document/path/90312)
- [获取部门成员](https://developer.work.weixin.qq.com/document/path/90200)
- [获取成员ID列表](https://developer.work.weixin.qq.com/document/path/96067)
