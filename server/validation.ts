/**
 * 统一入口校验层（P2-8 修复核心）。
 *
 * 用 zod 在「请求体入口」对写操作做 schema 校验，替代原本散落在各 router 里、
 * 形如 `if (!req.body?.name) return 400` 的手写判断：
 *  - 必填字段缺失 / 类型错误 → 统一 400，并给出对前端友好的中文错误串；
 *  - 校验通过后再把「收窄后的数据」写回 req.body 交给下游处理；
 *  - 配合 tsc 的 strict 模式，把 `any` 收口到这一处边界，业务层不再需要 `any`。
 *
 * 设计取舍：员工 / 文件夹 / 文档套件这类「字段很多、且下游只读已知列」的 schema
 * 用 `.loose()` 保留未知键（下游 normalize 只认已知列，多余键无害）；
 * 账号 / 登录这类「字段固定」的 schema 不放开，多余键直接忽略。
 */
import { z } from "zod";
import type { NextFunction, Request, Response } from "express";

const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE"] as const;

// ---------------------------------------------------------------- 错误收敛

/** 把 zod 校验错误收敛成前端可读的单条字符串（前端统一读 response.data.error）。 */
export function formatZodError(error: z.ZodError): string {
  const msgs = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return msgs.slice(0, 5).join("；") || "请求参数不合法";
}

/** 把未知异常安全地转成字符串（替代散落的 `e.message`，避免 `any`）。 */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------- 中间件

/**
 * 请求体校验中间件工厂：校验失败直接 400 并写出 { error }；
 * 成功则把解析后的（类型收窄 / 去除多余字段）数据写回 req.body。
 */
export function validateBody(schema: z.ZodTypeAny, status = 400) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(status).json({ error: formatZodError(result.error) });
      return;
    }
    // req.body 在 @types/express 里声明为 any，这里写回的是已收窄的强类型数据。
    req.body = result.data;
    next();
  };
}

/**
 * 批量写入的行数上限（排班与打卡共用）。
 *
 * `PUT /api/attendance/records` 原先只判 `Array.isArray`，而 attendance 的 body 上限是
 * 20MB —— 一次提交约 20 万条打卡会在同一个事务里全写进去。导入那条路有
 * MAX_PUNCH_IMPORT_ROWS，这个"手工整表提交"的口子反而没有。
 */
export const MAX_BULK_ROWS = 5000;

// ---------------------------------------------------------------- 员工（字段多，放开未知键）

/**
 * 字符串字段一律有上限。
 *
 * 之前只有 body parser 的 100kb 兜着 —— 也就是 `name` 可以是一整篇 10 万字的文本，
 * 落库后在表格里被截断、在导出里撑爆列宽、在 AI 上下文里被原样带上游。
 * profileUpdateSchema 一直是仓库里的正确写法（30/120），这里按同一思路补齐。
 * 上限取「人手填不会超过的量级 + 复制粘贴的余量」，报错文案直说是哪个字段过长。
 */
const str = (max: number, label: string) => z.string().max(max, `${label}过长（上限 ${max} 字）`);

const employeeShape = {
  id: str(32, "员工编号").optional(),
  name: z.string({ error: "姓名不能为空" }).min(1, "姓名不能为空").max(60, "姓名过长（上限 60 字）"),
  idCard: str(32, "身份证号").optional(),
  gender: str(20, "性别").optional(),
  age: z.coerce.number().int().min(0).max(200).optional(),
  phone: str(32, "手机号").optional(),
  department: str(100, "部门").optional(),
  departmentId: str(32, "部门 ID").optional(),
  role: str(100, "职位").optional(),
  status: str(40, "状态").optional(),
  joinDate: str(40, "入职日期").optional(),
  yearsOfService: str(20, "司龄").optional(),
  employmentType: str(40, "用工类型").optional(),
  hasSocialSecurity: z.union([z.boolean(), z.number()]).optional(),
  contractYears: z.coerce.number().int().min(0).max(50).optional(),
  contractSignDate: str(40, "合同签订日").optional(),
  contractExpiry: str(40, "合同到期日").optional(),
  changeStatus: str(40, "变动情况").optional(),
  registeredAddress: str(200, "户籍地址").optional(),
  currentAddress: str(200, "现居住地址").optional(),
  isVeteran: z.union([z.boolean(), z.number()]).optional(),
  formerUnit: str(100, "原部队").optional(),
  militaryDates: str(100, "服役时间").optional(),
  remarks: str(5000, "备注").optional(),
  systemRole: str(20, "系统角色").optional(),
};

export const employeeCreateSchema = z.object(employeeShape).loose();
/** 更新为全可选（含 name），空对象也合法。 */
export const employeeUpdateSchema = employeeCreateSchema.partial();

// ---------------------------------------------------------------- 待办 / 通知

export const todoCreateSchema = z
  .object({
    title: z.string({ error: "待办标题不能为空" }).min(1, "待办标题不能为空").max(200, "标题过长（上限 200 字）"),
    description: str(5000, "待办说明").optional(),
    dueDate: str(40, "截止日期").optional(),
    type: z.enum(["contract", "probation", "manual"]).optional(),
    targetId: str(64, "关联对象 ID").nullable().optional(),
    // assignee 是账号名（usernames 正则 [a-zA-Z0-9._-]{3,32}）；不校验存在性是有意的：
    // 待办可以派给还没有账号的员工本人，通知那条路径自己会跳过取不到邮箱的人。
    assignee: str(32, "负责人").optional(),
  })
  .loose();

export const todoUpdateSchema = todoCreateSchema.partial();

export const notificationCreateSchema = z
  .object({
    title: z.string({ error: "通知标题不能为空" }).min(1, "通知标题不能为空").max(200, "标题过长（上限 200 字）"),
    message: str(5000, "通知内容").optional(),
    type: z.enum(["info", "warning", "success", "error"]).optional(),
    recipient: str(32, "接收人").optional(),
    refKey: z.string().max(120).optional(),
  })
  .loose();

/** 从员工档案生成业务单后的归档请求体（employeeName 不在其中：归属由服务端按 employeeId 回填） */
export const businessFormRecordSchema = z
  .object({
    employeeId: z.string({ error: "缺少员工" }).min(1, "缺少员工"),
    kind: z.enum(["condolence", "wedding", "custom"], { error: "业务类型不合法" }),
    kindLabel: z.string().max(40).optional(),
    department: z.string().max(40).optional(),
    relation: z.string().max(20).optional(),
    date: z.string({ error: "单据日期格式应为 YYYY-MM-DD" }).regex(/^\d{4}-\d{2}-\d{2}$/u, "单据日期格式应为 YYYY-MM-DD"),
    amount: z.number().min(0).max(1_000_000).optional(),
    body: z.string({ error: "正文不能为空" }).trim().min(1, "正文不能为空").max(4000, "正文过长（上限 4000 字）"),
  })
  .loose();

/** 到期提醒阈值（服务端 settings KV）；上限防止手滑填成 9999 天 */
export const reminderConfigSchema = z
  .object({
    contractExpiryDays: z.coerce.number().int().min(1).max(365).optional(),
    probationConversionDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .loose();

// ---------------------------------------------------------------- 企业微信考勤接入

/**
 * 凭据配置：字段全部可选（面板按可见字段提交，缺键=不改），
 * 掩码串/清除哨兵的语义在 wecomDb.mergeWeComConfig 里处理；
 * baseUrl 的目标地址校验也在那边（要区分本机回环与外网 https，不是简单格式问题）。
 */
export const wecomConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    corpId: z.string().max(64, "企业 ID 过长").optional(),
    agentId: z.string().max(32, "AgentId 过长").optional(),
    corpSecret: z.string().max(128, "Secret 过长").optional(),
    baseUrl: z.string().max(200, "接口地址过长").optional(),
    // 出网代理：可带 user:pass，故按凭据对待（回显掩码、审计丢弃）；具体格式由 validateWeComProxyUrl 裁定
    proxyUrl: z.string().max(300, "代理地址过长").optional(),
    syncIntervalMinutes: z.coerce.number().optional(),
    overlapMinutes: z.coerce.number().optional(),
  })
  .loose();

/** 成员映射批量认领：employeeId 为 null 表示退回待认领 */
export const wecomBindingsSchema = z.object({
  items: z
    .array(
      z.object({
        wecomUserId: z
          .string({ error: "企业微信成员账号不能为空" })
          .trim()
          .min(1, "企业微信成员账号不能为空")
          .max(64, "企业微信成员账号过长")
          .regex(/^[\w.\-@]+$/u, "企业微信成员账号只能包含字母、数字与 . - _ @"),
        employeeId: z.string().trim().max(32).nullable().optional(),
      })
    )
    .min(1, "没有要提交的成员")
    .max(500, "一次最多认领 500 条"),
});

// ---------------------------------------------------------------- 文件夹 / 文档套件（name 必填）

export const folderCreateSchema = z
  .object({
    name: z.string({ error: "name is required" }).min(1, "name is required"),
    parentId: z.union([z.string(), z.null()]).optional(),
  })
  .loose();

export const folderUpdateSchema = folderCreateSchema.partial();

export const documentSetCreateSchema = z
  .object({
    name: z.string({ error: "name is required" }).min(1, "name is required"),
  })
  .loose();

export const documentSetUpdateSchema = documentSetCreateSchema.partial();

/**
 * `PUT /api/documents/:id`。
 *
 * 这里原本写的是 `z.object({}).loose()` —— 语法上"过了 validateBody"，实质上任何对象都放行，
 * 于是这条路由在校清单一度是**假绿**（数据层只取 name/type/folderId 三列，多余键无害，
 * 但 name 可以是 10 万字、type 可以是数组 → 500）。按数据层真正消费的字段收窄。
 */
export const documentUpdateSchema = z.object({
  name: z.string().trim().min(1, "文件名不能为空").max(255, "文件名过长（上限 255 字，受文件系统限制）").optional(),
  type: str(40, "文件类型").optional(),
  folderId: z.string().max(64).nullable().optional(),
});

// ---------------------------------------------------------------- 考勤：班次 / 部门工作时段 / 排班 / 打卡

/**
 * 日期/时间的**格式**一律不在这里判：`attendanceDb.normalizePunchDate/Time/ClockTime`
 * 已经是唯一口径（抛 PunchFormatError → 路由翻 400），再写一份 zod 正则就是
 * 「同一件事两处说法」——attendanceRouter 里那段注释说的就是这个坑。
 * 这里只管类型、必填与长度，把"缺字段 → TypeError → 500"这条路堵掉。
 */
const timeStr = (label: string) =>
  z.string({ error: `${label}必须是字符串` }).trim().min(1, `${label}不能为空`).max(40, `${label}过长`);

export const shiftUpsertSchema = z.object({
  name: z.string({ error: "班次名称不能为空" }).trim().min(1, "班次名称不能为空").max(60, "班次名称过长"),
  startTime: timeStr("上班时间"),
  endTime: timeStr("下班时间"),
});

/** 班次更新：整体可选（PUT 语义），但给了就必须是完整合法值 */
export const shiftUpdateSchema = shiftUpsertSchema.partial();

/**
 * 工作日：**数字数组**（1..7），不是逗号字符串 —— 数据层按 `input.workdays.join(",")`
 * 落库、按 `.length` 判空（shiftRulesDb.assertShape），界面也只发数组（ShiftRules.tsx）。
 * 新建时缺省补成工作日五天（与列默认值一致）；更新时**必须显式带**，
 * 否则一个不带 workdays 的 PUT 会把夜班的工作日悄悄改回周一到周五。
 */
const workdaysField = z
  .array(z.coerce.number().int().min(1, "工作日需为 1-7").max(7, "工作日需为 1-7"))
  .max(7, "一周最多 7 天")
  .refine((v) => new Set(v).size === v.length, "工作日不能重复");

export const deptShiftRuleSchema = z.object({
  departmentId: z.string({ error: "缺少部门" }).trim().min(1, "缺少部门").max(32, "部门 ID 过长"),
  name: z.string({ error: "时段名称不能为空" }).trim().min(1, "时段名称不能为空").max(60, "时段名称过长"),
  startTime: timeStr("上班时间"),
  endTime: timeStr("下班时间"),
  workdays: workdaysField.default([1, 2, 3, 4, 5]),
});

/** 时段更新：姓名/两个时间/工作日都要带上（数据层的 assertShape 无条件读它们） */
export const deptShiftRuleUpdateSchema = z.object({
  departmentId: z.string().trim().max(32, "部门 ID 过长").optional(),
  name: z.string({ error: "时段名称不能为空" }).trim().min(1, "时段名称不能为空").max(60, "时段名称过长"),
  startTime: timeStr("上班时间"),
  endTime: timeStr("下班时间"),
  workdays: workdaysField,
});

/**
 * 排班与打卡的批量入口。
 *
 * 两个都要收行数：`PUT /attendance/records` 原先只判 `Array.isArray`，而 attendance 的
 * body 上限是 20MB —— 一次提交约 20 万条打卡全在一个事务里写。导入那条路有
 * MAX_PUNCH_IMPORT_ROWS，这个"手工整表提交"的口子反而没有。
 */

export const schedulesBulkSchema = z.object({
  schedules: z
    .array(
      z.object({
        employeeId: z.string({ error: "排班缺少员工编号" }).trim().min(1, "排班缺少员工编号").max(32, "员工编号过长"),
        employeeName: z.string({ error: "排班缺少姓名" }).trim().min(1, "排班缺少姓名").max(60, "姓名过长"),
        shiftIds: z.array(z.string().max(64, "班次 ID 过长")).max(20, "一人最多排 20 个班次").optional(),
      })
    )
    .max(MAX_BULK_ROWS, `一次最多提交 ${MAX_BULK_ROWS} 条排班`)
    // 空数组在这里是「按提交内容清空排班」的显式动作，与 PUT /records 的 400 不同，
    // 保持既有语义（该接口的整表语义由前端提交完整列表驱动）。
    .optional(),
});

/** 单人排班（POST 新增 / PUT 更新）：expectedVersion 走乐观锁，缺省即不比对 */
const scheduleFields = z.object({
  employeeId: z.string({ error: "缺少员工编号" }).trim().min(1, "缺少员工编号").max(32, "员工编号过长"),
  employeeName: z.string({ error: "缺少姓名" }).trim().min(1, "缺少姓名").max(60, "姓名过长"),
  shiftIds: z.array(z.string().max(64, "班次 ID 过长")).max(20, "一人最多排 20 个班次").optional(),
  expectedVersion: z.coerce.number().int().min(0).optional(),
});

export const scheduleCreateSchema = scheduleFields;
/** PUT /schedules/:employeeId 只要求姓名（工号在路径上），并且可以只改版本号或只改班次 */
export const scheduleUpdateSchema = scheduleFields.pick({ employeeName: true }).extend({
  shiftIds: scheduleFields.shape.shiftIds,
  expectedVersion: scheduleFields.shape.expectedVersion,
});

/** 单条打卡记录的字段（批量与手工补录共用一份定义） */
const punchRecordFields = z.object({
  id: z.string().max(64, "记录 ID 过长").optional(),
  employeeId: z.string({ error: "打卡缺少员工编号" }).trim().min(1, "打卡缺少员工编号").max(32, "员工编号过长"),
  employeeName: z.string({ error: "打卡缺少姓名" }).trim().min(1, "打卡缺少姓名").max(60, "姓名过长"),
  date: timeStr("打卡日期"),
  time: timeStr("打卡时间"),
  source: str(20, "打卡来源").optional(),
  expectedVersion: z.coerce.number().int().min(0).optional(),
});

export const punchRecordsBulkSchema = z.object({
    // 空数组**不在这里**判：路由自己回了句更有用的话（"要清空请用全部清空"），
    // 而 zod 只会说 "too_small"。上限才是这里该管的。
    records: z.array(punchRecordFields).max(MAX_BULK_ROWS, `一次最多提交 ${MAX_BULK_ROWS} 条打卡`).default([]),
});

/** 单条打卡（手工补录）：与批量同一套字段约束 */
export const punchRecordCreateSchema = punchRecordFields;

// ---------------------------------------------------------------- 部门 / 职位整树

const departmentNodeSchema: z.ZodType<DepartmentNode> = z.lazy(() =>
  z.object({
    id: z.string({ error: "部门缺少 id" }).min(1, "部门缺少 id").max(32, "部门 id 过长"),
    name: z.string({ error: "部门名称不能为空" }).trim().min(1, "部门名称不能为空").max(60, "部门名称过长"),
    priority: z.coerce.number().int().min(-9999).max(9999).optional(),
    children: z.array(departmentNodeSchema).max(500, "子部门过多").optional(),
  })
);

interface DepartmentNode {
  id: string;
  name: string;
  priority?: number;
  children?: DepartmentNode[];
}

export const departmentsTreeSchema = z.object({
  departments: z.array(departmentNodeSchema).max(2000, "一次最多提交 2000 个部门").optional(),
});

export const rolesBulkSchema = z.object({
  roles: z
    .array(
      z.object({
        id: z.string({ error: "职位缺少 id" }).min(1, "职位缺少 id").max(32, "职位 id 过长"),
        name: z.string({ error: "职位名称不能为空" }).trim().min(1, "职位名称不能为空").max(60, "职位名称过长"),
        // 这是外键列：给一个不存在的部门原先会撞 SQLITE 约束变成 500，这里收敛成 400
        departmentId: z.string({ error: "职位缺少部门" }).min(1, "职位缺少部门").max(32, "部门 ID 过长"),
        priority: z.coerce.number().int().min(-9999).max(9999).optional(),
      })
    )
    .max(2000, "一次最多提交 2000 个职位")
    .optional(),
});

/**
 * AI 对话消息。
 *
 * 之前只有 `Array.isArray(messages)`，**元素完全不校验**：`ChatMsg` 是 TS 接口，运行时不存在，
 * 于是 `role: "tool"` / `content: {big:…}` / 一条 10 万字的 content 都会原样进上游请求体与
 * `ai_conversations.messages`（后者还会被拼进后续对话的上下文）。
 * 这里收三样：角色白名单（客户端不许自称 system，system 由服务端生成）、内容是字符串且有上限、
 * 条数有上限。上限取「一次请求」与「一份存档」两档，都明显宽于正常用法。
 */
const chatRole = z.enum(["user", "assistant"], { error: "消息角色只允许 user / assistant" });
/**
 * 内容允许空串：助手这一路在流被中断/上游只回角色头时确实会是 ""，
 * 而存档与续聊都要能容纳它（这里挡的是"不是字符串"与超长，不是空）。
 */
const chatContent = z.string().max(20_000, "单条消息过长（上限 2 万字）");

export const chatMessagesSchema = z.object({
  messages: z.array(z.object({ role: chatRole, content: chatContent })).min(1, "messages 不能为空").max(50, "一次最多携带 50 条上下文"),
  useData: z.boolean().optional(),
});

export const aiConversationSchema = z.object({
  title: z.string().trim().max(120, "会话标题过长").optional(),
  messages: z.array(z.object({ role: chatRole, content: chatContent })).max(200, "单条会话最多保存 200 条消息").optional(),
});

/**
 * `POST /api/export/employees`（HR+）。
 *
 * 原先完全没有入口校验：缺 `config` / `data` 不是数组 / `columns` 缺 key，都会走到
 * `data.filter` 或 `worksheet.columns = ...` 抛 TypeError，被 catch 成 `500 Export failed`
 * —— 用户看到的是一个没有任何原因的失败。这里把它变成 400 + 指名哪个字段。
 * 顺带收列数与行数：两者都会被拼进 xlsx（列头进表头行、每行一次 addRow）。
 */
export const exportEmployeesSchema = z
  .object({
    data: z
      .array(z.record(z.string(), z.unknown()))
      .max(20_000, `一次最多导出 20000 行`)
      .default([]),
    config: z.object({
      title: str(120, "标题").optional(),
      columns: z
        .array(
          z.object({
            header: str(60, "列标题"),
            key: str(60, "列字段名"),
          })
        )
        .min(1, "至少要选一列")
        .max(80, "一次最多导出 80 列"),
      includeResigned: z.boolean().optional(),
      themeId: str(64, "主题 ID").optional(),
      mode: z.enum(["theme", "script"]).optional(),
      templateName: str(64, "模板名").optional(),
    }),
  })
  .loose();

/** 主题整表写入（settings KV）：只保证是个非空对象，内部结构由前端负责 */
export const themesWriteSchema = z.object({ themes: z.record(z.string(), z.unknown()) });

export const loginSchema = z.object({
  username: z.string({ error: "用户名不能为空" }).min(1, "用户名不能为空"),
  password: z.string({ error: "密码不能为空" }).min(1, "密码不能为空"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: "当前密码不能为空" }).min(1, "当前密码不能为空"),
  newPassword: z.string({ error: "新密码不能为空" }).min(1, "新密码不能为空"),
});

export const accountCreateSchema = z.object({
  username: z.string({ error: "用户名不能为空" }).min(1, "用户名不能为空"),
  password: z.string({ error: "密码不能为空" }).min(1, "密码不能为空"),
  systemRole: z.enum(SYSTEM_ROLES).optional(),
  employeeId: z.union([z.string(), z.null()]).optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
});

export const accountUpdateSchema = z.object({
  systemRole: z.enum(SYSTEM_ROLES).optional(),
  enabled: z.boolean().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  employeeId: z.union([z.string(), z.null()]).optional(),
});

/** 自助资料更新：只允许改显示名称 / 邮箱 / 头像，角色/状态一律不在此接口暴露 */
export const profileUpdateSchema = z.object({
  displayName: z
    .string({ error: "显示名称不能为空" })
    .trim()
    .min(1, "显示名称不能为空")
    .max(30, "显示名称最多 30 个字符"),
  email: z
    .string()
    .trim()
    .max(120, "邮箱过长")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "邮箱格式不正确"),
  // 头像 = base64 data URL（前端 canvas 已压到 128px，约 5–15KB）；空串 = 恢复默认头像。
  // authRouter 的 body 上限 64kb，这里再收一道，给友好报错而不是 JSON 解析失败。
  avatar: z
    .string()
    .max(50_000, "头像数据过大，请压缩后重试")
    .refine((v) => v === "" || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v), "头像必须是图片数据")
    .optional(),
});

/** 用户留存条目（座位方案 / 打印参数 / 草稿）：kind 白名单在服务端也收一道 */
export const savedItemUpsertSchema = z.object({
  kind: z.string({ error: "缺少留存类型" }).min(1, "缺少留存类型").max(40, "留存类型过长"),
  name: z
    .string({ error: "缺少名称" })
    .trim()
    .min(1, "缺少名称")
    .max(80, "名称最多 80 个字符"),
  // payload 结构由各前端模块自己负责（方案/参数形状不同），这里只保证是 JSON 值
  payload: z.unknown(),
});
