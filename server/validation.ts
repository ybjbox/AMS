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

// ---------------------------------------------------------------- 员工（字段多，放开未知键）

const employeeShape = {
  id: z.string().optional(),
  name: z.string({ error: "姓名不能为空" }).min(1, "姓名不能为空"),
  idCard: z.string().optional(),
  gender: z.string().optional(),
  age: z.coerce.number().int().min(0).max(200).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  joinDate: z.string().optional(),
  yearsOfService: z.string().optional(),
  employmentType: z.string().optional(),
  hasSocialSecurity: z.union([z.boolean(), z.number()]).optional(),
  contractYears: z.coerce.number().int().min(0).max(50).optional(),
  contractSignDate: z.string().optional(),
  contractExpiry: z.string().optional(),
  daysToExpiry: z.coerce.number().int().optional(),
  changeStatus: z.string().optional(),
  registeredAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  isVeteran: z.union([z.boolean(), z.number()]).optional(),
  formerUnit: z.string().optional(),
  militaryDates: z.string().optional(),
  remarks: z.string().optional(),
  systemRole: z.string().optional(),
};

export const employeeCreateSchema = z.object(employeeShape).loose();
/** 更新为全可选（含 name），空对象也合法。 */
export const employeeUpdateSchema = employeeCreateSchema.partial();

// ---------------------------------------------------------------- 待办 / 通知

export const todoCreateSchema = z
  .object({
    title: z.string({ error: "待办标题不能为空" }).min(1, "待办标题不能为空"),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    type: z.enum(["contract", "probation", "manual"]).optional(),
    targetId: z.union([z.string(), z.null()]).optional(),
    assignee: z.string().optional(),
  })
  .loose();

export const todoUpdateSchema = todoCreateSchema.partial();

export const notificationCreateSchema = z
  .object({
    title: z.string({ error: "通知标题不能为空" }).min(1, "通知标题不能为空"),
    message: z.string().optional(),
    type: z.enum(["info", "warning", "success", "error"]).optional(),
    recipient: z.string().optional(),
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

export const documentUpdateSchema = z.object({}).loose();

// ---------------------------------------------------------------- 认证 / 账号

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
