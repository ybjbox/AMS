/**
 * 鉴权网关。
 *
 * 挂载方式：app.use("/api", authGate) —— 必须在所有业务路由之前。
 * 这里用「默认拒绝」策略：不在公开白名单里的任何 /api 请求都必须带有效会话；
 * 权限要求由下方声明式策略表描述，新增接口时改表即可，不需要在每个路由里手写判断。
 */
import type { RequestHandler, Request, Response, NextFunction } from "express";
import { db, onDbReload } from "./db.ts";
import { resolveSession, ROLE_LEVEL, type SessionContext, type SystemRole } from "./authDb.ts";
import { writeAuditLog, type AuditLevel } from "./auditDb.ts";

// ---------------------------------------------------------------- 类型扩展

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: SessionContext;
    }
  }
}

// ---------------------------------------------------------------- 安全事件日志

db.exec(`
  CREATE TABLE IF NOT EXISTS security_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    event     TEXT NOT NULL,
    username  TEXT DEFAULT '',
    ip        TEXT DEFAULT '',
    detail    TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_security_events_at ON security_events(at);
`);

const INSERT_EVENT_SQL =
  "INSERT INTO security_events (event, username, ip, detail) VALUES (?, ?, ?, ?)";
let insertEvent = db.prepare(INSERT_EVENT_SQL);
// 恢复备份会热重载连接，重新 prepare 模块级缓存语句，避免指向已关闭的旧连接。
onDbReload(() => {
  insertEvent = db.prepare(INSERT_EVENT_SQL);
});

/** 安全事件 → 审计日志的等级映射：失败/越权类一律升为 WARN，方便日志页一眼筛出来 */
const SECURITY_EVENT_LEVEL: Record<string, AuditLevel> = {
  "auth.login_failed": "WARN",
  "auth.login_locked": "WARN",
  "auth.login_blocked": "WARN",
  "auth.rate_limited": "WARN",
  "auth.invalid_token": "WARN",
  "auth.forbidden": "WARN",
  "auth.change_password_failed": "WARN",
};

export function logSecurityEvent(
  event: string,
  username = "",
  ip = "",
  detail = "",
  /** 真实 HTTP 状态码：让 auth.invalid_token / auth.forbidden 在审计里正确记为 failure */
  status = 200
): void {
  try {
    insertEvent.run(event, username, ip, String(detail).slice(0, 500));
  } catch (e) {
    console.warn("[auth] 安全事件写入失败:", e);
  }

  // 同步写一份到 audit_logs（P1-5）：让「登录/越权」和「改了谁的资料」出现在同一条时间线上，
  // 前端系统日志页只需要读一个接口。security_events 表保持原样，既有回归脚本不受影响。
  writeAuditLog({
    actor: username || "anonymous",
    action: event,
    category: event.startsWith("account.") ? "账号" : "安全",
    level: SECURITY_EVENT_LEVEL[event] ?? "INFO",
    status,
    ip,
    detail,
  });
}

export function listSecurityEvents(limit = 200): unknown[] {
  const n = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  return db.prepare("SELECT * FROM security_events ORDER BY id DESC LIMIT ?").all(n);
}

export function clientIp(req: Request): string {
  return (req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
}

// ---------------------------------------------------------------- 策略表

/** 无需登录即可访问的接口（路径为去掉 /api 前缀后的部分） */
const PUBLIC_PATHS: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/health\/?$/ },
  { method: "POST", pattern: /^\/auth\/login\/?$/ },
];

interface Policy {
  pattern: RegExp;
  /** 命中的 HTTP 方法；"*" 表示全部 */
  methods: string[] | "*";
  minRole: SystemRole;
}

/**
 * 显式策略，自上而下匹配，命中即止。
 * 未命中任何一条时走 DEFAULT_POLICY。
 */
const POLICIES: Policy[] = [
  // 审批自助提交：任何登录用户可提交（R2 员工自助）；审批决定走默认写策略（HR+）+ 路由内 requireRole
  { pattern: /^\/approvals\/?$/, methods: ["POST"], minRole: "EMPLOYEE" },

  // 自己的会话相关操作，任何登录用户都可以做
  { pattern: /^\/auth\/(me|logout|change-password)\b/, methods: "*", minRole: "EMPLOYEE" },

  // 账号管理、安全日志：仅管理员
  { pattern: /^\/auth\/accounts\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/auth\/security-events\b/, methods: "*", minRole: "ADMIN" },

  // 审计日志含全量操作留痕（谁改了谁的薪资），只对管理员开放，且没有任何删除入口
  { pattern: /^\/audit-logs\b/, methods: "*", minRole: "ADMIN" },

  // 运行诊断（进程健康/访问日志/表行数）：运维信息，仅管理员
  { pattern: /^\/system\b/, methods: "*", minRole: "ADMIN" },

  // 公告：读取（有效公告）全员可见；管理列表与写操作仅 ADMIN
  { pattern: /^\/announcements\/all\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/announcements\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "ADMIN" },

  // 导出脚本模板 = 可执行代码，读写都必须是管理员
  { pattern: /^\/export-templates\b/, methods: "*", minRole: "ADMIN" },
  // 主题写入
  { pattern: /^\/themes\b/, methods: ["POST", "PUT", "DELETE"], minRole: "ADMIN" },
  // 组织架构变更
  { pattern: /^\/departments\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "ADMIN" },

  // 批量导出会吐出身份证等敏感字段，限制到 HR 及以上
  { pattern: /^\/export\/\b/, methods: "*", minRole: "HR" },

  // 待办与通知（P2-7）：个人生产力功能，任何登录用户可用；
  // 数据按 username 隔离，且归属/权限在服务端二次校验（见 todosDb/notificationsDb）。
  { pattern: /^\/todos\b/, methods: "*", minRole: "EMPLOYEE" },
  { pattern: /^\/notifications\b/, methods: "*", minRole: "EMPLOYEE" },

  // AI 助手（PoC）：对话功能，任何登录用户可用；
  // 数据检索在 aiContext 中按最小暴露原则只取聚合摘要，且遵守 req.auth 的数据权限。
  { pattern: /^\/ai\//, methods: "*", minRole: "EMPLOYEE" },
];

/** 兜底：读操作任何登录用户可做，写操作至少 HR */
const DEFAULT_POLICY = {
  read: "EMPLOYEE" as SystemRole,
  write: "HR" as SystemRole,
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requiredRoleFor(method: string, path: string): SystemRole {
  for (const p of POLICIES) {
    if (p.methods !== "*" && !p.methods.includes(method)) continue;
    if (p.pattern.test(path)) return p.minRole;
  }
  return READ_METHODS.has(method) ? DEFAULT_POLICY.read : DEFAULT_POLICY.write;
}

function isPublic(method: string, path: string): boolean {
  return PUBLIC_PATHS.some((p) => p.method === method && p.pattern.test(path));
}

// ---------------------------------------------------------------- 网关

function extractToken(req: Request, path: string): string {
  const header = req.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return m[1].trim();
  // query 兜底仅限文件下载类端点（<a href>/window.open 带不上自定义头）。
  // token 进 URL 会落入访问日志/代理日志，对普通接口一律拒绝，尽量收窄暴露面。
  const DOWNLOAD_PATHS = [/^\/files\//, /^\/backup\/export\//, /^\/audit-logs\/export/];
  if (!DOWNLOAD_PATHS.some((p) => p.test(path))) return "";
  const q = req.query?.access_token;
  return typeof q === "string" ? q : "";
}

export const authGate: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // req.path 已被 express 剥掉 /api 挂载前缀
  const path = req.path || "/";
  const method = req.method.toUpperCase();

  if (isPublic(method, path)) return next();

  const token = extractToken(req, path);
  if (!token) {
    return res.status(401).json({ error: "未登录", code: "UNAUTHENTICATED" });
  }

  const session = resolveSession(token);
  if (!session) {
    logSecurityEvent("auth.invalid_token", "", clientIp(req), `${method} ${path}`, 401);
    return res.status(401).json({ error: "登录已过期，请重新登录", code: "SESSION_EXPIRED" });
  }

  const required = requiredRoleFor(method, path);
  if (ROLE_LEVEL[session.systemRole] < ROLE_LEVEL[required]) {
    logSecurityEvent(
      "auth.forbidden",
      session.username,
      clientIp(req),
      `${method} ${path} 需要 ${required}，实际 ${session.systemRole}`,
      403
    );
    return res.status(403).json({
      error: `权限不足，该操作需要 ${required} 及以上角色`,
      code: "FORBIDDEN",
      required,
    });
  }

  // 强制改密期间只放行改密与登出，其余一律拦下
  if (session.mustChangePassword && !/^\/auth\/(me|logout|change-password)\b/.test(path)) {
    return res.status(403).json({
      error: "首次登录必须先修改初始密码",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }

  req.auth = session;
  next();
};

/** 在具体路由里额外收紧角色时使用 */
export function requireRole(minRole: SystemRole): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: "未登录", code: "UNAUTHENTICATED" });
    if (ROLE_LEVEL[req.auth.systemRole] < ROLE_LEVEL[minRole]) {
      logSecurityEvent(
        "auth.forbidden",
        req.auth.username,
        clientIp(req),
        `${req.method} ${req.originalUrl} 需要 ${minRole}`
      );
      return res.status(403).json({ error: "权限不足", code: "FORBIDDEN", required: minRole });
    }
    next();
  };
}
