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
import { thresholdForCapability } from "./rolePermissions.ts";

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
  "INSERT INTO security_events (event, username, ip, detail) VALUES (?, ?, ?, ?)";let insertEvent = db.prepare(INSERT_EVENT_SQL);
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

/**
 * 安全事件按保留期清理（与审计日志同一口径）。
 *
 * 这张表此前只增不减，而它恰恰是最容易被"写爆"的那张：每个失效 token 的请求都会留一行。
 * 公网扫描器或一个开着不动的旧标签页（前端每 15 秒探一次活）就能持续放大，
 * 最后压垮的是同一个数据卷 —— 也就是备份和上传文件所在的地方。
 */
export function pruneSecurityEvents(retentionDays = Number(process.env.AUDIT_RETENTION_DAYS) || 180): number {
  const days = Math.max(Number(retentionDays) || 180, 7);
  try {
    return Number(db.prepare("DELETE FROM security_events WHERE at < datetime('now','localtime',?)").run(`-${days} days`).changes ?? 0);
  } catch (e) {
    console.warn("[security] 安全事件保留期清理失败:", e);
    return 0;
  }
}

export function clientIp(req: Request): string {
  // req.ip：设了 TRUST_PROXY 时它是 Express 从 X-Forwarded-For 换算出的真实来源，
  // 没设时它等于 socket 地址且完全忽略该头。两种情况下取 req.ip 都比直接读 socket 更正确
  // ——旧写法在反代后面会把所有请求记成代理那一个 IP，暴破限流也因此只对代理有效。
  const ip = req.ip ?? req.socket?.remoteAddress ?? "";
  return ip.replace(/^::ffff:/, "");
}

// ---------------------------------------------------------------- 策略表

/** 无需登录即可访问的接口（路径为去掉 /api 前缀后的部分） */
const PUBLIC_PATHS: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/health\/?$/ },
  { method: "POST", pattern: /^\/auth\/login\/?$/ },
  // 账号认领申请：这是系统里唯一一个免登录写入口。它不收敏感字段（姓名/工号/手机尾号），
  // 真正的校验发生在 HR 当面核对那一步；限流在 authRouter 里单独做。
  { method: "POST", pattern: /^\/auth\/claims\/?$/ },
  // 申请人查自己的认领进度：同样免登录；限流与"查不到"口径都在 authRouter 里收口。
  { method: "POST", pattern: /^\/auth\/claims\/lookup\/?$/ },
  // 登录页在拿到 token 之前就要渲染背景与图标，因此这两个固定槽位免鉴权可读。
  // 只放开 background / icon 两个字面量（路径由服务端拼、按字节头白名单校验），
  // 其余 /branding/* 仍需登录；写入另说一律超管。
  { method: "GET", pattern: /^\/branding\/?$/ },
  { method: "GET", pattern: /^\/branding\/(background|icon)$/ },
];

interface Policy {
  pattern: RegExp;
  /** 命中的 HTTP 方法；"*" 表示全部 */
  methods: string[] | "*";
  /** 未登记 capability 时的硬编码下限；登记了 capability 时作为默认值留档 */
  minRole: SystemRole;
  /** 能力矩阵里的能力码：有它时真实门槛取矩阵阈值 */
  capability?: string;
}

/**
 * 显式策略，自上而下匹配，命中即止。
 * 未命中任何一条时走 DEFAULT_POLICY。
 *
 * 2026-10-25：带 capability 的路由由「角色 → 能力矩阵」决定门槛；
 * 不带 capability 的路由是安全硬编码（账号、审计、诊断、通知通道、企微等），
 * 仍按 minRole 判定，不进入设置页矩阵。
 */
const POLICIES: Policy[] = [
  // ---- 审批 ----
  { pattern: /^\/approvals\/?$/, methods: ["POST"], minRole: "EMPLOYEE", capability: "approvals:view" },
  { pattern: /^\/approvals\/[^/]+\/withdraw$/, methods: ["PUT"], minRole: "EMPLOYEE", capability: "approvals:view" },
  { pattern: /^\/approvals\/mine$/, methods: ["GET"], minRole: "EMPLOYEE", capability: "approvals:view" },
  { pattern: /^\/approvals\/comp-balance$/, methods: ["GET"], minRole: "EMPLOYEE", capability: "approvals:view" },
  { pattern: /^\/approvals\/(pending|all)$/, methods: ["GET"], minRole: "HR", capability: "approvals:approve" },
  { pattern: /^\/approvals\/batch-decide$/, methods: ["PUT"], minRole: "HR", capability: "approvals:approve" },
  { pattern: /^\/approvals\/[^/]+\/decide$/, methods: ["PUT"], minRole: "HR", capability: "approvals:approve" },

  // ---- 自己的会话与资料：始终 EMPLOYEE，不进矩阵 ----
  { pattern: /^\/auth\/(me|logout|change-password|profile)\b/, methods: "*", minRole: "EMPLOYEE" },

  // ---- 账号管理 / 安全事件 / 认领：安全面 ----
  { pattern: /^\/auth\/accounts\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/auth\/claims\b/, methods: "*", minRole: "ADMIN", capability: "claims:review" },
  { pattern: /^\/auth\/security-events\b/, methods: "*", minRole: "ADMIN" },
  // 权限矩阵本体：硬编码超管，不能被矩阵自己关掉
  { pattern: /^\/role-permissions\b/, methods: "*", minRole: "SUPER_ADMIN" },

  // ---- 备份：整库副本，硬下限超管 ----
  { pattern: /^\/backup\/export\b/, methods: ["GET"], minRole: "SUPER_ADMIN", capability: "backup:export" },
  { pattern: /^\/backup\/import\b/, methods: ["POST"], minRole: "SUPER_ADMIN", capability: "backup:import" },

  // ---- 审计 / 诊断：安全硬编码 ----
  { pattern: /^\/audit-logs\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/system\b/, methods: "*", minRole: "ADMIN" },

  // ---- 控制台：聚合数据 ----
  { pattern: /^\/stats\b/, methods: ["GET"], minRole: "HR", capability: "dashboard:view" },

  // ---- 公告：有效公告全员可读（面向全员的通知面，不随 HR 数据面收口）；
  // 管理列表与写操作 ADMIN ----
  { pattern: /^\/announcements\/all\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/announcements\b/, methods: ["GET"], minRole: "EMPLOYEE" },
  { pattern: /^\/announcements\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "ADMIN" },

  // ---- 导出模板 / 主题写入 ----
  { pattern: /^\/export-templates\b/, methods: "*", minRole: "ADMIN", capability: "export-templates:manage" },
  { pattern: /^\/themes\b/, methods: ["POST", "PUT", "DELETE"], minRole: "ADMIN", capability: "export-templates:manage" },

  // ---- 员工名单 ----
  { pattern: /^\/users\b/, methods: ["GET"], minRole: "HR", capability: "users:view" },
  { pattern: /^\/users\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "HR", capability: "users:manage" },

  // ---- 考勤 ----
  { pattern: /^\/attendance\/records$/, methods: ["DELETE"], minRole: "ADMIN", capability: "attendance:purge" },
  { pattern: /^\/attendance\b/, methods: ["GET"], minRole: "HR", capability: "attendance:view" },
  { pattern: /^\/attendance\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "HR", capability: "attendance:manage" },

  // ---- 文档 ----
  { pattern: /^\/documents\b/, methods: ["GET"], minRole: "HR", capability: "documents:view" },
  { pattern: /^\/documents\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "HR", capability: "documents:manage" },

  // ---- 部门 ----
  { pattern: /^\/departments\b/, methods: ["GET"], minRole: "HR", capability: "departments:view" },
  { pattern: /^\/departments\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "ADMIN", capability: "departments:manage" },

  // ---- 批量导出 / 通知通道 / 企微：安全硬编码 ----
  { pattern: /^\/export\/\b/, methods: "*", minRole: "HR" },
  { pattern: /^\/notify\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/wecom\b/, methods: "*", minRole: "ADMIN" },

  // ---- 待办 / 通知 / 员工门户 ----
  { pattern: /^\/todos\b/, methods: "*", minRole: "EMPLOYEE", capability: "todos:view" },
  { pattern: /^\/notifications\b/, methods: "*", minRole: "EMPLOYEE" },
  { pattern: /^\/my\b/, methods: ["GET"], minRole: "EMPLOYEE" },

  // ---- 到期提醒：安全硬编码 HR ----
  { pattern: /^\/reminders\b/, methods: "*", minRole: "HR" },

  // ---- 可配置的 HR 工具 ----
  { pattern: /^\/ai\//, methods: "*", minRole: "HR", capability: "ai:use" },
  { pattern: /^\/notice\//, methods: "*", minRole: "HR", capability: "notice:view" },
  { pattern: /^\/form\//, methods: "*", minRole: "HR", capability: "forms:view" },
  { pattern: /^\/saved-items\b/, methods: "*", minRole: "HR", capability: "print-tools:view" },

  // ---- 品牌资源写入 ----
  { pattern: /^\/branding\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "SUPER_ADMIN" },
];

/**
 * 兜底：读、写都至少 HR。
 *
 * 2026-10-25 安全收口：默认读从 EMPLOYEE 收到 HR。员工只保留自己的门户、待办、通知、
 * 自己的审批与资料（都在上面的显式策略里）；其余 HR 数据面（员工/考勤/合同/部门/文档/
 * 打印/统计）必须显式放行。新增员工接口时忘了加策略就会默认 403 —— fail-closed 是刻意的。
 */
const DEFAULT_POLICY = {
  read: "HR" as SystemRole,
  write: "HR" as SystemRole,
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 某次请求命中的策略（自上而下，命中即止） */
function matchPolicy(method: string, path: string): Policy | undefined {
  for (const p of POLICIES) {
    if (p.methods !== "*" && !p.methods.includes(method)) continue;
    if (p.pattern.test(path)) return p;
  }
  return undefined;
}

/**
 * 某次请求需要的最低角色。
 * - 带 capability 的路由：取角色能力矩阵的当前阈值（设置页可改，默认=收口后的现状）；
 * - 不带 capability 的路由：安全硬编码，不随矩阵变化；
 * - 都没命中：走 DEFAULT_POLICY（读/写都 HR）。
 */
export function requiredRoleFor(method: string, path: string): SystemRole {
  const policy = matchPolicy(method, path);
  if (policy?.capability) return thresholdForCapability(policy.capability);
  if (policy) return policy.minRole;
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
  // 备份下载不在这里：它交出的是一整份含凭据的库副本，值得让前端改成带请求头的
  // fetch + Blob 下载（BackupPanel 里就是程序化触发，没有真实链接跳转的需求）。
  const DOWNLOAD_PATHS = [/^\/files\//, /^\/audit-logs\/export/, /^\/users\/import\/template/];
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
