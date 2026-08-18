// 一次性脚本：把 admin 的 passwordHash 就地重置为指定口令（默认 123456），不删数据、不动其他表。
// 同时清空锁定状态（failedAttempts/lockedUntil），确保重置后能立即登录。
// 用法：node scripts/reset-admin-password.mjs [新口令]
import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const newPassword = process.argv[2] || "123456";

// 与 server/authDb.ts 完全一致的 scrypt 参数
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), hash.toString("base64")].join("$");
}

function verifyPassword(password, stored) {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = +parts[1], r = +parts[2], p = +parts[3];
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const dbPath = "data/ams.db";
if (!fs.existsSync(dbPath)) {
  console.error("未找到 data/ams.db，无法重置。");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT username, passwordHash FROM accounts WHERE username='admin'").get();
if (!row) {
  console.error("accounts 表中不存在 admin 账号，无法重置。");
  process.exit(1);
}

const newHash = hashPassword(newPassword);
db.prepare(
  "UPDATE accounts SET passwordHash=?, mustChangePassword=0, failedAttempts=0, lockedUntil=0 WHERE username='admin'"
).run(newHash);

// 回读校验
const updated = db.prepare("SELECT passwordHash, mustChangePassword, failedAttempts, lockedUntil FROM accounts WHERE username='admin'").get();
const ok = verifyPassword(newPassword, updated.passwordHash);
console.log("ADMIN_FOUND: true");
console.log("NEW_HASH_PREFIX:", newHash.slice(0, 12) + "...");
console.log("VERIFY_NEW_PASSWORD: " + (ok ? "PASS" : "FAIL"));
console.log("mustChangePassword_reset: " + updated.mustChangePassword);
console.log("lock_cleared: " + (updated.failedAttempts === 0 && updated.lockedUntil === 0));
console.log(ok ? "DONE: admin 口令已就地重置。" : "ERROR: 校验未通过，请检查。");
db.close();
process.exit(ok ? 0 : 1);
