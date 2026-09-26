/**
 * 批次 4 回归：schema 单一来源 + v14 数据一致性收口的**结果**。
 *
 * 走子进程探针（server/tests/fixtures/v14-probe.ts）而不是在本文件里 import 数据层：
 * 探针要在自己的临时 DATA_DIR 上先把库「盖成 v13 的样子」再让模块加载，
 * 而 vitest 的 server project 是共用一个 db 单例的进程。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("./fixtures/v14-probe.ts", import.meta.url));

interface Row {
  id: string;
  createdAt: string;
  updatedAt?: string;
}
interface ProbeResult {
  SCHEMA_VERSION: number;
  legacy: {
    version: number;
    employeesCols: string[];
    todosDdl: string;
    notifDdl: string;
    rulesDdl: string;
    todos: Row[];
    notifications: Row[];
    rules: { id: string }[];
    forms: Row[];
    renewals: Row[];
  };
  upgraded: {
    version: number;
    employeesCols: string[];
    todosDdl: string;
    notifDdl: string;
    rulesDdl: string;
    todos: Row[];
    notifications: Row[];
    rules: { id: string }[];
    forms: Row[];
    renewals: Row[];
    todoIndexes: string[];
    notifIndexes: string[];
    rulesIndex: string[];
    leftover: string[];
  };
  twice: { todos: Row[]; notifications: Row[]; forms: Row[]; renewals: Row[] };
  defaultedAt: string;
  rulesAfterDeptDelete: string[];
  fkRejected: string;
}

function runProbe(): ProbeResult {
  const dataDir = mkdtempSync(path.join(tmpdir(), "ams-v14-"));
  try {
    const out = execFileSync(process.execPath, ["--import", "tsx", FIXTURE], {
      encoding: "utf8",
      env: { ...process.env, DATA_DIR: dataDir },
    });
    const line = out.split("\n").find((l) => l.startsWith("AMS_V14 "));
    if (!line) throw new Error("探针没有输出 AMS_V14 结果行\n" + out.slice(-4000));
    return JSON.parse(line.slice("AMS_V14 ".length)) as ProbeResult;
  } finally {
    // Windows 上刚被访问过的目录可能还留着句柄，删不掉不该让测试变红
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* 交给系统回收 tmp */
    }
  }
}

/** SQLite 的 datetime(x,'localtime') 等价实现：把「当 UTC 写的字面量」换成本地墙上时间。 */
function localizeWasUtc(raw: string): string {
  const d = new Date(/Z$/i.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

describe("v14 收口：旧库升级", () => {
  const r = runProbe();

  it("探针确实从 v13 形状出发", () => {
    expect(r.legacy.version).toBe(13);
    expect(r.legacy.employeesCols).toContain("daysToExpiry");
    expect(r.legacy.todosDdl).not.toContain("localtime");
    expect(r.legacy.notifDdl).not.toContain("localtime");
    expect(r.legacy.rulesDdl).not.toMatch(/FOREIGN KEY/i);
    expect(r.legacy.forms[0].createdAt).toMatch(/Z$/);
  });

  it("版本号落到 SCHEMA_VERSION，且没有留下临时表", () => {
    expect(r.upgraded.version).toBe(r.SCHEMA_VERSION);
    expect(r.upgraded.leftover).toEqual([]);
  });

  it("employees 不再存 daysToExpiry（剩余天数是派生值）", () => {
    expect(r.upgraded.employeesCols).not.toContain("daysToExpiry");
    expect(r.upgraded.employeesCols).toContain("contractExpiry");
  });

  it("todos / notifications 的列默认值已是本地时间，且索引都还在", () => {
    expect(r.upgraded.todosDdl).toContain("localtime");
    expect(r.upgraded.notifDdl).toContain("localtime");
    expect(r.upgraded.todoIndexes).toEqual(expect.arrayContaining(["idx_todos_createdBy", "idx_todos_assignee"]));
    expect(r.upgraded.notifIndexes).toContain("idx_notifications_recipient");
    expect(r.upgraded.rulesIndex).toContain("idx_dept_shift_rules_department");
  });

  it("存量时间戳换算成同一瞬间的本地时间（不是简单改字符串）", () => {
    for (const row of r.legacy.todos) {
      const after = r.upgraded.todos.find((t) => t.id === row.id)!;
      expect(after.createdAt).toBe(localizeWasUtc(row.createdAt));
      expect(after.updatedAt).toBe(localizeWasUtc(row.updatedAt!));
    }
    for (const row of r.legacy.notifications) {
      const after = r.upgraded.notifications.find((t) => t.id === row.id)!;
      expect(after.createdAt).toBe(localizeWasUtc(row.createdAt));
    }
  });

  it("Z 结尾的 ISO 时间戳也收敛到同一格式（同列混排会打乱文本序）", () => {
    expect(r.upgraded.forms[0].createdAt).toBe(localizeWasUtc(r.legacy.forms[0].createdAt));
    expect(r.upgraded.renewals[0].createdAt).toBe(localizeWasUtc(r.legacy.renewals[0].createdAt));
    for (const row of [...r.upgraded.forms, ...r.upgraded.renewals]) {
      expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
  });

  it("新建行走默认值时落的就是本地时间", () => {
    expect(r.defaultedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const asLocal = new Date();
    expect(Math.abs(new Date(r.defaultedAt.replace(" ", "T")).getTime() - asLocal.getTime())).toBeLessThan(5 * 60_000);
  });

  it("再跑一次迁移不会把时间又加一次（幂等是这条链路唯一可接受的行为）", () => {
    expect(r.twice.todos).toEqual(r.upgraded.todos);
    expect(r.twice.notifications).toEqual(r.upgraded.notifications);
    expect(r.twice.forms).toEqual(r.upgraded.forms);
    expect(r.twice.renewals).toEqual(r.upgraded.renewals);
  });

  it("班次规则：孤儿被清掉，外键真的生效", () => {
    expect(r.legacy.rules.map((x) => x.id)).toEqual(["R1", "R2"]);
    expect(r.upgraded.rules.map((x) => x.id)).toEqual(["R1"]); // R2 指向已不存在的部门
    expect(r.upgraded.rulesDdl).toMatch(/FOREIGN KEY/i);
    expect(r.rulesAfterDeptDelete).toEqual([]); // 删 D1 级联删掉 R1
    expect(r.fkRejected).toMatch(/FOREIGN KEY/i); // 给不存在的部门建规则会被拒
  });
});
