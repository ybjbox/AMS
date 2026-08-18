/**
 * 认证数据层 —— 账号、口令、会话。
 *
 * 设计要点（安全相关，改动前请先读完）：
 * 1. 口令用 scrypt 加盐哈希存储，永不落明文；校验走 timingSafeEqual，避免计时侧信道。
 * 2. 会话 token 是 32 字节随机串，数据库里只存它的 SHA-256。
 *    —— 即使 ams.db 被拖走，攻击者也无法据此伪造出有效的 Authorization 头。
 * 3. 会话有「空闲过期」和「绝对过期」双重上限，滑动续期只在空闲窗口内生效。
 * 4. 登录失败按账号计数并指数级锁定，抵御在线暴力破解。
 * 5. 改密 / 禁用账号会吊销该账号全部会话。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, DATA_DIR } from "./db.ts";

// ---------------------------------------------------------------- 常量

/** 会话空闲过期：8 小时没有任何请求即失效 */
const IDLE_TTL_MS = 8 * 60 * 60 * 1000;
/** 会话绝对过期：无论多活跃，7 天后必须重新登录 */
const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 剩余空闲时间低于该比例时才写库续期，避免每个请求都写盘 */
const RENEW_THRESHOLD = 0.5;

/** 连续失败多少次开始锁定 */
const LOCK_AFTER_FAILURES = 5;
/** 锁定基准时长，每多失败一次翻倍，上限 30 分钟 */
const LOCK_BASE_MS = 60 * 1000;
const LOCK_MAX_MS = 30 * 60 * 1000;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
/** 128 * N * r ≈ 16MB，留足余量 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** 角色等级，数字越大权限越高。中间件的策略比较依赖它 */
export const ROLE_LEVEL: Record<SystemRole, number> = {
  EMPLOYEE: 1,
  HR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export function isSystemRole(v: unknown): v is SystemRole {
  return typeof v === "string" && (SYSTEM_ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------- 建表

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    username          TEXT PRIMARY KEY,
    employeeId        TEXT,
    displayName       TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    passwordHash      TEXT NOT NULL,
    systemRole        TEXT NOT NULL DEFAULT 'EMPLOYEE',
    enabled           INTEGER NOT NULL DEFAULT 1,
    mustChangePassword INTEGER NOT NULL DEFAULT 0,
    failedAttempts    INTEGER NOT NULL DEFAULT 0,
    lockedUntil       INTEGER NOT NULL DEFAULT 0,
    lastLoginAt       TEXT,
    passwordChangedAt TEXT DEFAULT (datetime('now','localtime')),
    createdAt         TEXT DEFAULT (datetime('now','localtime')),
    updatedAt         TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    tokenHash         TEXT PRIMARY KEY,
    username          TEXT NOT NULL,
    createdAt         INTEGER NOT NULL,
    lastSeenAt        INTEGER NOT NULL,
    idleExpiresAt     INTEGER NOT NULL,
    absoluteExpiresAt INTEGER NOT NULL,
    ip                TEXT DEFAULT '',
    userAgent         TEXT DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
  CREATE INDEX IF NOT EXISTS idx_accounts_employee ON accounts(employeeId);
`);

// ---------------------------------------------------------------- 口令哈希

/** 生成 `scrypt$N$r$p$salt$hash` 格式的口令摘要 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/** 恒定时间校验口令。任何解析异常一律当作校验失败，不抛出 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const actual = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * 即使账号不存在也跑一次 scrypt，让「用户名不存在」和「密码错误」耗时一致，
 * 防止攻击者靠响应时间枚举有效用户名。
 */
const DUMMY_HASH = hashPassword(crypto.randomBytes(24).toString("hex"));
export function burnPasswordTime(password: string): void {
  verifyPassword(password, DUMMY_HASH);
}

// ---------------------------------------------------------------- 账号

export interface AccountRow {
  username: string;
  employeeId: string | null;
  displayName: string;
  email: string;
  passwordHash: string;
  systemRole: SystemRole;
  enabled: number;
  mustChangePassword: number;
  failedAttempts: number;
  lockedUntil: number;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 对外暴露的账号视图，一定不含 passwordHash */
export interface PublicAccount {
  username: string;
  employeeId: string | null;
  displayName: string;
  email: string;
  systemRole: SystemRole;
  enabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function toPublicAccount(row: AccountRow): PublicAccount {
  return {
    username: row.username,
    employeeId: row.employeeId,
    displayName: row.displayName,
    email: row.email,
    systemRole: row.systemRole,
    enabled: !!row.enabled,
    mustChangePassword: !!row.mustChangePassword,
    locked: row.lockedUntil > Date.now(),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

export function getAccount(username: string): AccountRow | null {
  const row = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
  return row ? (row as unknown as AccountRow) : null;
}

export function listAccounts(): PublicAccount[] {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY username").all() as unknown as AccountRow[];
  return rows.map(toPublicAccount);
}

export interface CreateAccountInput {
  username: string;
  password: string;
  systemRole?: SystemRole;
  employeeId?: string | null;
  displayName?: string;
  email?: string;
  mustChangePassword?: boolean;
}

export function createAccount(input: CreateAccountInput): PublicAccount {
  const username = String(input.username ?? "").trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new AuthError(400, "用户名只能包含字母、数字、点、下划线、连字符，长度 3-32");
  }
  assertPasswordStrength(input.password);
  if (getAccount(username)) throw new AuthError(409, "用户名已存在");

  const role: SystemRole = isSystemRole(input.systemRole) ? input.systemRole : "EMPLOYEE";
  db.prepare(
    `INSERT INTO accounts (username, employeeId, displayName, email, passwordHash, systemRole, mustChangePassword)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    username,
    input.employeeId ?? null,
    input.displayName ?? username,
    input.email ?? "",
    hashPassword(input.password),
    role,
    input.mustChangePassword ? 1 : 0
  );
  return toPublicAccount(getAccount(username)!);
}

export function deleteAccount(username: string): boolean {
  revokeAllSessions(username);
  return db.prepare("DELETE FROM accounts WHERE username = ?").run(username).changes > 0;
}

/** 口令强度下限。刻意不强制特殊字符——长度比字符类别更有效 */
export function assertPasswordStrength(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 10) {
    throw new AuthError(400, "密码长度至少 10 位");
  }
  if (password.length > 200) {
    throw new AuthError(400, "密码过长");
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AuthError(400, "密码需同时包含字母和数字");
  }
}

/** 修改口令：成功后吊销该账号全部会话，强制所有设备重新登录 */
export function setPassword(username: string, newPassword: string, mustChange = false): void {
  assertPasswordStrength(newPassword);
  const changes = db
    .prepare(
      `UPDATE accounts
          SET passwordHash = ?, mustChangePassword = ?, failedAttempts = 0, lockedUntil = 0,
              passwordChangedAt = datetime('now','localtime'), updatedAt = datetime('now','localtime')
        WHERE username = ?`
    )
    .run(hashPassword(newPassword), mustChange ? 1 : 0, username).changes;
  if (changes === 0) throw new AuthError(404, "账号不存在");
  revokeAllSessions(username);
}

export function updateAccountMeta(
  username: string,
  patch: { systemRole?: SystemRole; enabled?: boolean; displayName?: string; email?: string; employeeId?: string | null }
): PublicAccount {
  const current = getAccount(username);
  if (!current) throw new AuthError(404, "账号不存在");

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.systemRole !== undefined) {
    if (!isSystemRole(patch.systemRole)) throw new AuthError(400, "非法的系统角色");
    sets.push("systemRole = ?");
    args.push(patch.systemRole);
  }
  if (patch.enabled !== undefined) {
    sets.push("enabled = ?");
    args.push(patch.enabled ? 1 : 0);
  }
  if (patch.displayName !== undefined) {
    sets.push("displayName = ?");
    args.push(String(patch.displayName));
  }
  if (patch.email !== undefined) {
    sets.push("email = ?");
    args.push(String(patch.email));
  }
  if (patch.employeeId !== undefined) {
    sets.push("employeeId = ?");
    args.push(patch.employeeId);
  }
  if (sets.length > 0) {
    sets.push("updatedAt = datetime('now','localtime')");
    db.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE username = ?`).run(...args, username);
  }
  // 降权或停用必须立刻生效，否则旧会话仍带着老角色畅通无阻
  if (patch.systemRole !== undefined || patch.enabled === false) {
    revokeAllSessions(username);
  }
  return toPublicAccount(getAccount(username)!);
}

// ---------------------------------------------------------------- 登录节流

export function getLockRemainingMs(row: AccountRow): number {
  return Math.max(0, row.lockedUntil - Date.now());
}

export function recordLoginFailure(username: string): number {
  const row = getAccount(username);
  if (!row) return 0;
  const failed = row.failedAttempts + 1;
  let lockedUntil = row.lockedUntil;
  if (failed >= LOCK_AFTER_FAILURES) {
    const over = failed - LOCK_AFTER_FAILURES;
    const duration = Math.min(LOCK_BASE_MS * 2 ** over, LOCK_MAX_MS);
    lockedUntil = Date.now() + duration;
  }
  db.prepare("UPDATE accounts SET failedAttempts = ?, lockedUntil = ? WHERE username = ?").run(
    failed,
    lockedUntil,
    username
  );
  return Math.max(0, lockedUntil - Date.now());
}

export function recordLoginSuccess(username: string): void {
  db.prepare(
    `UPDATE accounts
        SET failedAttempts = 0, lockedUntil = 0, lastLoginAt = datetime('now','localtime')
      WHERE username = ?`
  ).run(username);
}

// ---------------------------------------------------------------- 会话

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export interface SessionContext {
  username: string;
  systemRole: SystemRole;
  employeeId: string | null;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
}

export interface IssuedSession {
  /** 明文 token，只在签发这一刻存在，之后数据库里只有它的哈希 */
  token: string;
  expiresAt: number;
}

export function createSession(username: string, ip = "", userAgent = ""): IssuedSession {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const idleExpiresAt = now + IDLE_TTL_MS;
  const absoluteExpiresAt = now + ABSOLUTE_TTL_MS;

  db.prepare(
    `INSERT INTO sessions (tokenHash, username, createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt, ip, userAgent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sha256(token), username, now, now, idleExpiresAt, absoluteExpiresAt, ip, String(userAgent).slice(0, 300));

  purgeExpiredSessions();
  return { token, expiresAt: Math.min(idleExpiresAt, absoluteExpiresAt) };
}

/**
 * 校验 token 并返回会话上下文。
 * 角色、启用状态都从 accounts 实时读取，保证改权限、停用能立刻生效。
 */
export function resolveSession(token: string): SessionContext | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = db.prepare("SELECT * FROM sessions WHERE tokenHash = ?").get(tokenHash) as
    | {
        tokenHash: string;
        username: string;
        createdAt: number;
        lastSeenAt: number;
        idleExpiresAt: number;
        absoluteExpiresAt: number;
      }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (now >= row.idleExpiresAt || now >= row.absoluteExpiresAt) {
    db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(tokenHash);
    return null;
  }

  const account = getAccount(row.username);
  if (!account || !account.enabled) {
    db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(tokenHash);
    return null;
  }

  // 滑动续期：只在空闲窗口消耗过半时写库，且不越过绝对过期时间
  const remaining = row.idleExpiresAt - now;
  if (remaining < IDLE_TTL_MS * RENEW_THRESHOLD) {
    const nextIdle = Math.min(now + IDLE_TTL_MS, row.absoluteExpiresAt);
    db.prepare("UPDATE sessions SET lastSeenAt = ?, idleExpiresAt = ? WHERE tokenHash = ?").run(
      now,
      nextIdle,
      tokenHash
    );
  }

  return {
    username: account.username,
    systemRole: account.systemRole,
    employeeId: account.employeeId,
    displayName: account.displayName,
    email: account.email,
    mustChangePassword: !!account.mustChangePassword,
  };
}

export function revokeSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(sha256(token));
}

export function revokeAllSessions(username: string): void {
  db.prepare("DELETE FROM sessions WHERE username = ?").run(username);
}

export function purgeExpiredSessions(): void {
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE idleExpiresAt <= ? OR absoluteExpiresAt <= ?").run(now, now);
}

// ---------------------------------------------------------------- 错误类型

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------- 首次播种

/**
 * 首启创建 admin 账号。
 * 口令优先取环境变量 AMS_ADMIN_PASSWORD；没有就随机生成，写到 data/ADMIN_CREDENTIALS.txt
 * 并在控制台高亮打印 —— 绝不使用「admin/123456」这类可猜测的固定弱口令。
 */
function seedAdminIfEmpty(): void {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM accounts").get() as { c: number }).c;
  if (count > 0) return;

  const envPassword = process.env.AMS_ADMIN_PASSWORD;
  const generated = !envPassword;
  // base64url 去掉易混淆字符，保证同时含字母与数字以通过强度校验
  const password =
    envPassword || `Ams${crypto.randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}9`;

  db.prepare(
    `INSERT INTO accounts (username, displayName, email, passwordHash, systemRole, mustChangePassword)
     VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?)`
  ).run("admin", "系统管理员", "admin@example.com", hashPassword(password), generated ? 1 : 0);

  if (generated) {
    const file = path.join(DATA_DIR, "ADMIN_CREDENTIALS.txt");
    const body =
      `AMS 初始管理员账号\n` +
      `生成时间: ${new Date().toISOString()}\n` +
      `用户名: admin\n` +
      `密码:   ${password}\n\n` +
      `请立即登录并修改密码，随后删除本文件。\n` +
      `如需自定义初始密码，可在首次启动前设置环境变量 AMS_ADMIN_PASSWORD。\n`;
    try {
      fs.writeFileSync(file, body, { mode: 0o600 });
    } catch (e) {
      console.warn("[auth] 无法写入初始凭据文件:", e);
    }
    console.log(
      "\n" +
        "=".repeat(64) +
        `\n[auth] 已创建初始管理员账号\n` +
        `        用户名: admin\n` +
        `        密码:   ${password}\n` +
        `        （同时写入 ${file}，首次登录后请立即修改并删除该文件）\n` +
        "=".repeat(64) +
        "\n"
    );
  } else {
    console.log("[auth] 已使用 AMS_ADMIN_PASSWORD 创建初始管理员账号 admin");
  }
}

seedAdminIfEmpty();
purgeExpiredSessions();
