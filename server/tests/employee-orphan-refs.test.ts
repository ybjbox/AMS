/**
 * 删除员工后的遗留提醒引用回归（第 14 批）：
 *  1. deleteEmployee 会连带清掉指向该员工的待办与周期提醒通知；
 *  2. v13 迁移把历史上已经变成孤儿的引用清掉，且不动仍指向在册员工的那些。
 *
 * 运行环境：vitest server project，DATA_DIR=data-test。用例自建数据并自清。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, createEmployee, deleteEmployee } from "../db.ts";
import { pruneOrphanReminderRefs, runMigrations } from "../migrate.ts";

const GONE = "EMP9001";
const GONE2 = "EMP9002";

function count(sql: string, ...args: unknown[]): number {
  const row = db.prepare(sql).get(...(args as never[])) as { c: number | bigint };
  return Number(row.c);
}

function seedTodo(targetId: string | null, title: string): void {
  db.prepare(
    "INSERT INTO todos (id, title, type, targetId, createdBy, assignee) VALUES (?, ?, 'contract', ?, 'admin', 'admin')"
  ).run(`todo-${title}`, title, targetId);
}

function seedNotification(refKey: string, title: string): void {
  db.prepare("INSERT INTO notifications (id, title, message, recipient, refKey) VALUES (?, ?, '', 'admin', ?)").run(
    `notif-${title}`,
    title,
    refKey
  );
}

beforeAll(() => {
  runMigrations();
});

afterAll(() => {
  db.prepare("DELETE FROM todos WHERE createdBy = 'admin' AND id LIKE 'todo-%'").run();
  db.prepare("DELETE FROM notifications WHERE id LIKE 'notif-%'").run();
  db.prepare("DELETE FROM employees WHERE id IN (?, ?)").run(GONE, GONE2);
});

describe("deleteEmployee 的连带清理", () => {
  it("指向该员工的待办与周期提醒通知一并删除", () => {
    const emp = createEmployee({ name: "遗留引用测试" })!;
    seedTodo(emp.id, "遗留-待办");
    seedNotification(`contract:${emp.id}`, "遗留-合同提醒");
    seedNotification(`probation:${emp.id}`, "遗留-转正提醒");
    seedNotification("contract:EMP0001", "遗留-他人合同");

    expect(count("SELECT COUNT(*) c FROM todos WHERE targetId = ?", emp.id)).toBe(1);
    deleteEmployee(emp.id);

    expect(count("SELECT COUNT(*) c FROM todos WHERE targetId = ?", emp.id)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE refKey = ?", `contract:${emp.id}`)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE refKey = ?", `probation:${emp.id}`)).toBe(0);
    // 别人的归并键不能跟着遭殃
    expect(count("SELECT COUNT(*) c FROM notifications WHERE refKey = 'contract:EMP0001'")).toBe(1);
    db.prepare("DELETE FROM notifications WHERE refKey = 'contract:EMP0001'").run();
  });
});

describe("v13 存量孤儿清理", () => {
  it("只删指向不存在员工的引用，在册员工的引用保留，且可重复执行", () => {
    seedNotification(`contract:${GONE}`, "孤儿-合同");
    seedNotification(`probation:${GONE2}`, "孤儿-转正");
    seedNotification("", "手工-无归并键");
    seedNotification("doc-share:whatever", "其他前缀");
    seedTodo(GONE, "孤儿-待办");

    pruneOrphanReminderRefs();

    expect(count("SELECT COUNT(*) c FROM notifications WHERE refKey = ?", `contract:${GONE}`)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE refKey = ?", `probation:${GONE2}`)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM todos WHERE targetId = ?", GONE)).toBe(0);
    // 无归并键与不同前缀的通知不属于本迁移的射程
    expect(count("SELECT COUNT(*) c FROM notifications WHERE title = ?", "手工-无归并键")).toBe(1);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE title = ?", "其他前缀")).toBe(1);

    pruneOrphanReminderRefs(); // 幂等
    expect(count("SELECT COUNT(*) c FROM notifications WHERE title = ?", "其他前缀")).toBe(1);
  });
});
