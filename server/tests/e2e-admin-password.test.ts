/**
 * e2e 口令解析的回归测试：仓库里不再有兜底口令，所以「解析顺序」本身要被钉住 ——
 * 环境变量优先 → 服务端首启写下的 ADMIN_CREDENTIALS.txt → 都没有则抛错说清缺什么。
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveAdminPassword } from "../../e2e/adminCredentials.ts";

const savedEnv = process.env.AMS_ADMIN_PASSWORD;
const savedDataDir = process.env.DATA_DIR;

afterEach(() => {
  if (savedEnv === undefined) delete process.env.AMS_ADMIN_PASSWORD;
  else process.env.AMS_ADMIN_PASSWORD = savedEnv;
  if (savedDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = savedDataDir;
});

function dirWithCredentialsFile(password: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ams-e2e-cred-"));
  writeFileSync(
    path.join(dir, "ADMIN_CREDENTIALS.txt"),
    `AMS 初始管理员账号\n用户名: admin\n密码:   ${password}\n请立即登录并修改密码\n`
  );
  return dir;
}

describe("resolveAdminPassword", () => {
  it("环境变量优先于凭据文件", () => {
    process.env.AMS_ADMIN_PASSWORD = "From-Env#1";
    process.env.DATA_DIR = dirWithCredentialsFile("From-File#2");
    expect(resolveAdminPassword()).toBe("From-Env#1");
  });

  it("没有环境变量时读服务端写下的密码行（含前后空白被清掉）", () => {
    delete process.env.AMS_ADMIN_PASSWORD;
    process.env.DATA_DIR = dirWithCredentialsFile("AmsXy9z123456789");
    expect(resolveAdminPassword()).toBe("AmsXy9z123456789");
  });

  it("两处都没有就抛错，而不是回退到某个固定口令", () => {
    delete process.env.AMS_ADMIN_PASSWORD;
    process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "ams-e2e-nocred-"));
    expect(() => resolveAdminPassword()).toThrow(/AMS_ADMIN_PASSWORD/);
  });
});
