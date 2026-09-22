# 企业微信考勤接入调研（AMS）

> 状态：**仅调研，未写任何代码**。等待第五节三个决策后再落 P0。
> 日期：2026-09-20 ｜ 环境事实：企业微信自建应用与 API 凭据**尚未创建**。

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

### P0 · 打通链路（只读，不写库）

- `server/wecomDb.ts`：配置（corpid / agentId / appSecret 掩码 / 同步开关 / 时间窗）+ access_token 缓存（含提前失效重取）。
- `POST /api/wecom/preview`：传日期区间 → 拉数据 → 返回"将写入 N 条 / 无法匹配 M 人"的**干跑报告**，先验证权限与映射，不动考勤表。
- 映射表 `wecom_bindings(wecomUserId, employeeId)` + 设置页一个"未绑定成员"列表让人手工认领（比自动按姓名匹配安全——AMS 里"员工 34"这种种子名根本对不上真实 userid）。
- 权限：`POLICIES` 加 `/wecom/*` = ADMIN；前端 `attendance:sync` 权限码 + persist 版本 migrate。

### P1 · 定时增量同步

- 同步游标表记录"上次成功同步到的时间点"，每 30~60 分钟拉 `[cursor - 重叠窗口, now]`（重叠是为了补企业微信侧的迟到数据，靠唯一键幂等）。
- ~~给 `punch_records` 加唯一索引（schema v10）~~ **已完成**：`(employeeId, date, time)` 唯一索引已随 schema v10 落地，服务端考勤 Excel 导入走 `INSERT … ON CONFLICT DO NOTHING` 幂等落库（`server/attendanceImportDb.ts`，回归 `server/tests/attendance-import.test.ts`）。同步侧只需再补 `source` / `wecomSign` 两列区分来源。
- 复用 `import_jobs` 异步作业通道做手动"立即同步"，前端显示进度。

### P2 · 班次对齐（可选）

- 若要让迟到判定与企业微信一致：拉 `获取员工打卡规则` + `获取打卡人员排班信息`，把 `groupid`/`schedule_id`/`timeline_id` 映射进 AMS 的 shifts/schedules；或直接采信企业微信的 `exception_type` 生成 anomalies（不再本地算）。
- 这期改动最大，建议先看 P1 跑出来的数据质量再决定。

---

## 五、需要确认的三件事

1. **部署位置**：同步进程放哪？有没有固定公网 IP 的机器可以配可信 IP？（这条不通，后面都白做）
2. **数据范围**：只取上下班打卡（datatype=1）还是含外出打卡？要不要 `location`/`wifimac`/`deviceid`/`mediaids` 这些敏感字段——**建议默认不入库**，它们既是 PII 又撑大库，AMS 现有表结构也放不下。
3. **判定口径**：迟到/异常继续用 AMS 本地排班算，还是以企业微信 `exception_type` 为准？（决定要不要做 P2）

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
