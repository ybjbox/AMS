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
  minRole: SystemRole;
}

/**
 * 显式策略，自上而下匹配，命中即止。
 * 未命中任何一条时走 DEFAULT_POLICY。
 */
const POLICIES: Policy[] = [
  // 审批自助提交与撤回：任何登录用户对自己的申请可做（R2 员工自助）。
  // 归属在服务端二次校验（approvalsDb.withdraw: applicant !== 当前用户 → 403），
  // 这里只放开秩的下限；审批决定走默认写策略（HR+）+ 路由内 requireRole。
  { pattern: /^\/approvals\/?$/, methods: ["POST"], minRole: "EMPLOYEE" },
  { pattern: /^\/approvals\/[^/]+\/withdraw$/, methods: ["PUT"], minRole: "EMPLOYEE" },

  // 自己的会话与自己的资料，任何登录用户都可以做（profile 只改本人显示名/邮箱/头像，
  // 角色与启停在 /auth/accounts 那条 ADMIN 策略下，不在这里放行）
  { pattern: /^\/auth\/(me|logout|change-password|profile)\b/, methods: "*", minRole: "EMPLOYEE" },

  // 账号管理、安全日志：仅管理员
  { pattern: /^\/auth\/accounts\b/, methods: "*", minRole: "ADMIN" },
  { pattern: /^\/auth\/security-events\b/, methods: "*", minRole: "ADMIN" },

  // 备份文件是整库副本，里面有 passwordHash、AI apiKey、SMTP 凭据、企微 corpSecret。
  // 普通 ADMIN 在其他任何接口上都只能看到这些字段的掩码值，所以把它们一次性打包带走
  // 的动作只给超级管理员（backupRopter 里还有一道 requireRole("ADMIN") 作纵深）。
  { pattern: /^\/backup\/export\b/, methods: ["GET"], minRole: "SUPER_ADMIN" },

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

  // 通知出站通道配置含 webhook 回调地址与 SMTP 凭据，仅管理员可读写
  { pattern: /^\/notify\b/, methods: "*", minRole: "ADMIN" },

  // 企业微信考勤：corpSecret / userid 映射 / 全员打卡数据，读写都限管理员。
  // 服务端只用它向企微发请求，access_token 与 Secret 永不下发前端。
  { pattern: /^\/wecom\b/, methods: "*", minRole: "ADMIN" },

  // 待办与通知（P2-7）：个人生产力功能，任何登录用户可用；
  // 数据按 username 隔离，且归属/权限在服务端二次校验（见 todosDb/notificationsDb）。
  { pattern: /^\/todos\b/, methods: "*", minRole: "EMPLOYEE" },
  { pattern: /^\/notifications\b/, methods: "*", minRole: "EMPLOYEE" },

  // 到期提醒：阈值与收件人都是全局配置（含同事的合同到期日），只对 HR 及以上开放。
  { pattern: /^\/reminders\b/, methods: "*", minRole: "HR" },

  // AI 助手（PoC）：对话功能，任何登录用户可用；
  // 数据检索在 aiContext 中按最小暴露原则只取聚合摘要，且遵守 req.auth 的数据权限。
  { pattern: /^\/ai\//, methods: "*", minRole: "EMPLOYEE" },

  // 微信通知生成器：任何登录用户可用；AI 启停/管理员限制在 wechatNoticeRouter 内部按 aiConfig 判断。
  { pattern: /^\/notice\//, methods: "*", minRole: "EMPLOYEE" },

  // 业务单正文润色：员工自助办单，任何登录用户可用；AI 启停/额度同 /notice 一样在路由内判断。
  { pattern: /^\/form\//, methods: "*", minRole: "EMPLOYEE" },

  // 用户留存条目（座位方案 / 打印参数 / 草稿）：数据按 username 隔离，路由内只读写本人行。
  { pattern: /^\/saved-items\b/, methods: "*", minRole: "EMPLOYEE" },

  // 品牌资源（登录页背景 / 系统图标）：读已按固定槽位放开，写只给超管。
  { pattern: /^\/branding\b/, methods: ["POST", "PUT", "PATCH", "DELETE"], minRole: "SUPER_ADMIN" },
];

/** 兜底：读操作任何登录用户可做，写操作至少 HR */
const DEFAULT_POLICY = {
  read: "EMPLOYEE" as SystemRole,
  write: "HR" as SystemRole,
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 某次请求需要的最低角色。capabilities.ts 复用它，界面门禁与真实 403 因此同源。 */
export function requiredRoleFor(method: string, path: string): SystemRole {
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
