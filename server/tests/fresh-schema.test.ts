/**
 * 数据层「独立可用」回归测试（CI 首次红的那批问题的根因兜底）：
 *   1. 全新库 + 只 import 员工/提醒模块：员工 CRUD 与提醒扫描都要能跑通
 *      —— 曾经 db.ts 无条件 LEFT JOIN departments、todos/notifications 只在迁移里建表，
 *      于是测试文件顺序一变就 no such table；
 *   2. 部门名按 departmentId 实时联查，部门表缺席时才回落到 employees.department 缓存列。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmployee, deleteEmployee, getEmployee, db } from "../db.ts";
import "../departmentsDb.ts"; // 本文件的第二条用例要读写 departments 表，依赖由建它的模块提供

const PROBE = fileURLToPath(new URL("./fixtures/fresh-db-probe.ts", import.meta.url));

interface ProbeResult {
  createdId: string | null;
  department: string | null;
  keywordHits: number;
  catchesExpiring: boolean;
  tables: string[];
  deleted: boolean;
}

function runProbeOnFreshDb(): ProbeResult {
  const dataDir = mkdtempSync(path.join(tmpdir(), "ams-fresh-"));
  const out = execFileSync(process.execPath, ["--import", "tsx", PROBE], {
    encoding: "utf8",
    env: { ...process.env, DATA_DIR: dataDir },
  });
  const line = out.split("\n").find((l) => l.startsWith("AMS_PROBE "));
  if (!line) throw new Error("探针没有输出 AMS_PROBE 结果行");
  return JSON.parse(line.slice("AMS_PROBE ".length)) as ProbeResult;
}

describe("核心数据层不依赖其它模块的建表顺序", () => {
  it("全新 DATA_DIR 上只加载员工/提醒模块也能建、查、删并生成提醒", () => {
    const r = runProbeOnFreshDb();
    expect(r.tables).not.toContain("departments"); // 前提：这一库里确实没有部门表，探针才算成立
    expect(r.createdId).toMatch(/^EMP\d{4}$/);
    expect(r.department).toBe("探针部"); // 无部门表时回落缓存列，而不是抛错或清空
    expect(r.keywordHits).toBe(2); // 「新库」命中探针与临期探针两条
    expect(r.catchesExpiring).toBe(true); // 提醒扫描在新库上照常识别临期合同
    expect(r.deleted).toBe(true);
    // todos / notifications 由各自的模块建，不再等 migrate
    expect(r.tables).toContain("todos");
    expect(r.tables).toContain("notifications");
  });
});

describe("部门名读侧口径", () => {
  const deptId = "DEPT-join-probe";
  let empId = "";

  beforeAll(() => {
    // 只插一条临时部门：replaceDepartmentsTree 会整树重写，共用库里会打到别的用例。
    // 先清再来 —— 上一次跑到一半失败时留下的行会让 INSERT 撞 UNIQUE。
    db.prepare("DELETE FROM departments WHERE id = ?").run(deptId);
    db.prepare("INSERT INTO departments (id, name, parentId) VALUES (?, ?, NULL)").run(deptId, "联查测试部");
    empId = createEmployee({ name: "部门联查探针", status: "在职" })!.id;
    db.prepare("UPDATE employees SET departmentId = ?, department = ? WHERE id = ?").run(
      deptId,
      "陈旧缓存名",
      empId
    );
  });

  afterAll(() => {
    // 断言失败也要收尾：共用库里留下探针员工/部门会污染别的用例
    if (empId) deleteEmployee(empId);
    db.prepare("DELETE FROM departments WHERE id = ?").run(deptId);
  });

  it("读的是部门表实时名，不是 employees.department 陈旧缓存", () => {
    expect(getEmployee(empId)?.department).toBe("联查测试部");

    db.prepare("UPDATE departments SET name = ? WHERE id = ?").run("联查测试部·已改名", deptId);
    expect(getEmployee(empId)?.department).toBe("联查测试部·已改名");
    // 缓存列此时仍是旧值，正好证明读侧没用它
    expect(
      (db.prepare("SELECT department AS c FROM employees WHERE id = ?").get(empId) as { c: string }).c
    ).toBe("陈旧缓存名");
  });
});
