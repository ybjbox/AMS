/**
 * 认证与账号管理路由，挂载在 /api/auth。
 *
 * 只有 POST /auth/login 是公开的（见 authMiddleware 的 PUBLIC_PATHS），
 * 其余端点都已被 authGate 保护，这里的 requireRole 只是纵深防御的第二道。
 */
import express from "express";
import { permissionsForRole } from "./capabilities.ts";
import {
  AuthError,
  assertPasswordStrength,
  burnPasswordTime,
  createAccount,
  createSession,
  deleteAccount,
  getAccount,
  getLockRemainingMs,
  listAccounts,
  recordLoginFailure,
  recordLoginSuccess,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  setPassword,
  toPublicAccount,
  updateAccountMeta,
  verifyPassword,
} from "./authDb.ts";
import { clientIp, listSecurityEvents, logSecurityEvent, requireRole } from "./authMiddleware.ts";
import { validateBody, loginSchema, changePasswordSchema, accountCreateSchema, accountUpdateSchema, profileUpdateSchema } from "./validation.ts";
import { db, getEmployee } from "./db.ts";
import { asString } from "./sqliteUtil.ts";

export const authRouter = express.Router();
authRouter.use(express.json({ limit: "64kb" }));

/**
 * 员工绑定前置校验：employeeId 必须指向真实档案，且不能被别的账号占用。
 * 不拦的话：绑定不存在的工号会撞唯一索引变成 500；而"一个员工两个账号"会让
 * approvalsDb / attendanceRouter 里 `SELECT ... WHERE employeeId = ?` 的 .get()
 * 任取其一，另一个账号永远收不到转正/补卡/考勤异常通知 —— 静默失效最难查。
 */
function accountBindingError(employeeId: unknown, selfUsername: string): string | null {
  if (employeeId === undefined || employeeId === null || employeeId === "") return null;
  const id = String(employeeId);
  if (!getEmployee(id)) return `员工档案不存在：${id}`;
  const holder = db
    .prepare("SELECT username FROM accounts WHERE employeeId = ? AND username <> ?")
    .get(id, selfUsername);
  const occupied = asString((holder as { username?: string } | undefined)?.username);
  return occupied ? `该员工已绑定账号 ${occupied}，请先在对方账号上解除绑定` : null;
}

// ---------------------------------------------------------------- 登录限流

/** 按 IP 的滑动窗口限流，防止有人用字典轮着撞不同用户名绕开账号级锁定 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 30;
const ipAttempts = new Map<string, number[]>();

function tooManyFromIp(ip: string): boolean {
  const now = Date.now();
  const list = (ipAttempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  ipAttempts.set(ip, list);
  if (ipAttempts.size > 5000) ipAttempts.clear(); // 粗暴但足够的内存保护
  return list.length > MAX_ATTEMPTS_PER_IP;
}

function sessionUserPayload(username: string) {
  const account = getAccount(username)!;
  return {
    id: account.employeeId ?? account.username,
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    avatar: account.avatar ?? "",
    // 前端 permission.ts 按 role 查权限字典，这里直接给系统角色
    role: account.systemRole,
    systemRole: account.systemRole,
    // 能力码由服务端策略表算出并随会话下发：前端不再持有可编辑的本地权限矩阵
    permissions: permissionsForRole(account.systemRole),
    employeeId: account.employeeId,
    mustChangePassword: !!account.mustChangePassword,
  };
}

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

// ---------------------------------------------------------------- 登录 / 登出

authRouter.post("/login", validateBody(loginSchema), (req, res) => {
  const ip = clientIp(req);
  const { username, password } = req.body;

  if (tooManyFromIp(ip)) {
    logSecurityEvent("auth.rate_limited", username, ip, "IP 登录尝试过于频繁");
    return res.status(429).json({ error: "尝试过于频繁，请稍后再试" });
  }

  const account = getAccount(username);

  // 账号不存在时也消耗一次同等的 scrypt 时间，避免用户名枚举
  if (!account) {
    burnPasswordTime(password);
    logSecurityEvent("auth.login_failed", username, ip, "账号不存在");
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  if (!account.enabled) {
    logSecurityEvent("auth.login_blocked", username, ip, "账号已停用");
    return res.status(403).json({ error: "账号已被停用，请联系管理员" });
  }

  const lockMs = getLockRemainingMs(account);
  if (lockMs > 0) {
    logSecurityEvent("auth.login_locked", username, ip, `剩余锁定 ${Math.ceil(lockMs / 1000)}s`);
    return res
      .status(423)
      .json({ error: `账号已锁定，请 ${Math.ceil(lockMs / 60000)} 分钟后再试` });
  }

  if (!verifyPassword(password, account.passwordHash)) {
    const nextLock = recordLoginFailure(username);
    logSecurityEvent("auth.login_failed", username, ip, "密码错误");
    if (nextLock > 0) {
      return res
        .status(423)
        .json({ error: `密码错误次数过多，账号已锁定 ${Math.ceil(nextLock / 60000)} 分钟` });
    }
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  recordLoginSuccess(username);
  const { token, expiresAt } = createSession(username, ip, req.get("user-agent") ?? "");
  logSecurityEvent("auth.login_success", username, ip, "");

  res.json({ token, expiresAt, user: sessionUserPayload(username) });
});

authRouter.post("/logout", (req, res) => {
  const header = req.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) revokeSession(m[1].trim());
  if (req.auth) logSecurityEvent("auth.logout", req.auth.username, clientIp(req), "");
  res.json({ success: true });
});

authRouter.get("/me", (req, res) => {
  if (!req.auth) return res.status(401).json({ error: "未登录" });
  res.json({ user: sessionUserPayload(req.auth.username) });
});

authRouter.post("/change-password", validateBody(changePasswordSchema), (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "未登录" });
    const { currentPassword, newPassword } = req.body;
    const account = getAccount(req.auth.username);
    if (!account) return res.status(404).json({ error: "账号不存在" });

    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, account.passwordHash)) {
      logSecurityEvent("auth.change_password_failed", account.username, clientIp(req), "当前密码错误");
      return res.status(401).json({ error: "当前密码不正确" });
    }
    assertPasswordStrength(newPassword);
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: "新密码不能与当前密码相同" });
    }

    // setPassword 内部会吊销该账号全部会话（含本次请求用的这一个）
    setPassword(account.username, newPassword, false);
    logSecurityEvent("auth.change_password", account.username, clientIp(req), "已吊销全部会话");

    // 立刻补发一个新会话，避免用户改完密码被踢回登录页
    const { token, expiresAt } = createSession(
      account.username,
      clientIp(req),
      req.get("user-agent") ?? ""
    );
    res.json({ success: true, token, expiresAt, user: sessionUserPayload(account.username) });
  } catch (error) {
    handleError(res, error, "修改密码失败");
  }
});

// ---------------------------------------------------------------- 自助资料（本人）

/** 更新当前登录人的显示名称 / 邮箱 / 头像。不涉及角色/启停，故不吊销会话（改完不掉线） */
authRouter.put("/profile", validateBody(profileUpdateSchema), (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "未登录" });
    const { displayName, email, avatar } = req.body;
    updateAccountMeta(req.auth.username, {
      displayName,
      email,
      ...(avatar !== undefined ? { avatar } : {}),
    });
    logSecurityEvent("account.update_profile", req.auth.username, clientIp(req), "");
    res.json({ user: sessionUserPayload(req.auth.username) });
  } catch (error) {
    handleError(res, error, "更新个人资料失败");
  }
});

// ---------------------------------------------------------------- 账号管理（ADMIN+）

authRouter.get("/accounts", requireRole("ADMIN"), (_req, res) => {
  res.json(listAccounts());
});

authRouter.post("/accounts", requireRole("ADMIN"), validateBody(accountCreateSchema), (req, res) => {
  try {
    const { username, password, systemRole, employeeId, displayName, email } = req.body;

    // 不允许通过该接口直接造出比自己更高权限的账号
    if (systemRole === "SUPER_ADMIN" && req.auth?.systemRole !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "只有超级管理员才能创建超级管理员账号" });
    }
    const bindError = accountBindingError(employeeId, username);
    if (bindError) return res.status(400).json({ error: bindError });
    // 注：systemRole 已由 zod 枚举收口，非法值直接 400，无需再手写 !isSystemRole 判断。

    const account = createAccount({
      username,
      password,
      systemRole,
      employeeId: employeeId ?? null,
      displayName,
      email,
      mustChangePassword: true,
    });
    logSecurityEvent("account.create", req.auth?.username ?? "", clientIp(req), `新建 ${account.username}`);
    res.status(201).json(account);
  } catch (error) {
    handleError(res, error, "创建账号失败");
  }
});

authRouter.put("/accounts/:username", requireRole("ADMIN"), validateBody(accountUpdateSchema), (req, res) => {
  try {
    const target = req.params.username;
    const patch = req.body;

    if (patch.systemRole === "SUPER_ADMIN" && req.auth?.systemRole !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "只有超级管理员才能授予超级管理员角色" });
    }
    const bindError = accountBindingError(patch.employeeId, target);
    if (bindError) return res.status(400).json({ error: bindError });
    // 防止管理员把自己降权或停用，导致系统再没有人能管
    if (target === req.auth?.username && (patch.systemRole !== undefined || patch.enabled === false)) {
      return res.status(400).json({ error: "不能修改自己的角色或停用自己的账号" });
    }

    const account = updateAccountMeta(target, patch);
    logSecurityEvent("account.update", req.auth?.username ?? "", clientIp(req), `修改 ${target}`);
    res.json(account);
  } catch (error) {
    handleError(res, error, "更新账号失败");
  }
});

authRouter.post("/accounts/:username/reset-password", requireRole("ADMIN"), (req, res) => {
  try {
    const target = req.params.username;
    const { newPassword } = (req.body ?? {}) as Record<string, unknown>;
    assertPasswordStrength(newPassword);
    setPassword(target, newPassword, true);
    logSecurityEvent("account.reset_password", req.auth?.username ?? "", clientIp(req), `重置 ${target}`);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "重置密码失败");
  }
});

authRouter.delete("/accounts/:username", requireRole("ADMIN"), (req, res) => {
  const target = req.params.username;
  if (target === req.auth?.username) {
    return res.status(400).json({ error: "不能删除自己的账号" });
  }
  const account = getAccount(target);
  if (account?.systemRole === "SUPER_ADMIN" && req.auth?.systemRole !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "只有超级管理员才能删除超级管理员账号" });
  }
  const ok = deleteAccount(target);
  if (!ok) return res.status(404).json({ error: "账号不存在" });
  logSecurityEvent("account.delete", req.auth?.username ?? "", clientIp(req), `删除 ${target}`);
  res.json({ success: true });
});

/** 强制踢下线某账号的所有会话 */
authRouter.post("/accounts/:username/revoke-sessions", requireRole("ADMIN"), (req, res) => {
  revokeAllSessions(req.params.username);
  logSecurityEvent("account.revoke_sessions", req.auth?.username ?? "", clientIp(req), req.params.username);
  res.json({ success: true });
});

// ---------------------------------------------------------------- 安全事件

authRouter.get("/security-events", requireRole("ADMIN"), (req, res) => {
  res.json(listSecurityEvents(Number(req.query.limit) || 200));
});

/** 供内部复用：从 Authorization 头解析会话（目前仅测试脚本用得到） */
export function peekSession(authorizationHeader: string) {
  const m = /^Bearer\s+(.+)$/i.exec((authorizationHeader ?? "").trim());
  return m ? resolveSession(m[1].trim()) : null;
}

/** 供 accounts 列表联查使用，避免暴露 passwordHash */
export { toPublicAccount };
