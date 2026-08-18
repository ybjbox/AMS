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
  })
  .loose();

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
