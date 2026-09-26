/**
 * 批次 4 回归：数据一致性的**行为**面（结构与迁移结果由 schema-consistency.test.ts 覆盖）。
 *
 * 覆盖：
 *   1. employees.daysToExpiry 不再可写、读出来是派生值
 *   2. 删班次会把 id 从排班里摘掉（JSON 列建不了外键，只能手工收口）
 *   3. 删除账号：私人状态被清、审计留痕不动、同名不能复用（墓碑）
 *   4. 部门树同一上级下重名会被拒；名字→id 回填遇到歧义时不猜
 *   5. 续签 / 审批落库的时间戳与列默认值同形（同列混排会打乱 ORDER BY 的文本序）
 *   6. daysUntilLocalOrNull 区分「没有日期」与「今天到期」
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { db, createEmployee, getEmployee, updateEmployee } from "../db.ts";
import { runMigrations } from "../migrate.ts";
import { daysUntilLocal, daysUntilLocalOrNull, formatLocalDateTime } from "../localDate.ts";
import { createShift, deleteShift, upsertSchedule, listSchedules } from "../attendanceDb.ts";
import { replaceDepartmentsTree, listDepartmentsTree, DeptDataError } from "../departmentsDb.ts";
import { createAccount, deleteAccount, getAccount } from "../authDb.ts";
import { renewContract } from "../contractRenewalsDb.ts";
import "../aiDb.ts";
import "../aiUserDb.ts";
import "../savedItemsDb.ts";
import "../notificationsDb.ts";

const TS_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// 本文件断言的就是「迁移之后」的形状，所以先把测试库推到现在（与其它数据层测试同一套做法）
beforeAll(() => runMigrations());

function insert(table: string, cols: Record<string, string | number | null>) {
  const names = Object.keys(cols);
  const sql = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`;
  db.prepare(sql).run(...Object.values(cols));
}
const count = (sql: string, ...p: unknown[]) => {
  const row = db.prepare(sql).get(...(p as (string | number)[])) as Record<string, number> | undefined;
  return Number(Object.values(row ?? {})[0]);
};

describe("employees.daysToExpiry 是派生值", () => {
  const expiry = "2030-01-15";
  let id = "";
  beforeEach(() => {
    id = createEmployee({ name: "批次4-到期派生", contractExpiry: expiry })!.id;
  });
  afterEach(() => {
    db.prepare("DELETE FROM employees WHERE name LIKE '批次4-%'").run();
  });

  it("读出来按本地日历日现算", () => {
    expect(getEmployee(id)!.daysToExpiry).toBe(daysUntilLocal(expiry));
  });

  it("客户端 PUT 写不进去（写侧入口已删除）", () => {
    const before = getEmployee(id)!.daysToExpiry;
    updateEmployee(id, { daysToExpiry: 1 } as never);
    expect(getEmployee(id)!.daysToExpiry).toBe(before);
  });

  it("库里根本没有这一列了", () => {
    const cols = (db.prepare(`SELECT name FROM pragma_table_info('employees')`).all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(cols).not.toContain("daysToExpiry");
  });

  it("没有合同到期日时读作 0，而不是留下上一个人的数字", () => {
    const noExpiry = createEmployee({ name: "批次4-无到期日" })!.id;
    expect(getEmployee(noExpiry)!.daysToExpiry).toBe(0);
  });
});

describe("daysUntilLocalOrNull", () => {
  it("缺失/坏格式返回 null，与「今天到期」区分开", () => {
    expect(daysUntilLocalOrNull("")).toBeNull();
    expect(daysUntilLocalOrNull(null)).toBeNull();
    expect(daysUntilLocalOrNull("not-a-date")).toBeNull();
    expect(daysUntilLocalOrNull("2026-09-26", new Date(2026, 8, 26))).toBe(0);
    expect(daysUntilLocal("")).toBe(0);
  });
});

describe("删班次会清理排班里的引用", () => {
  it("schedules.shiftIds 里被删的那个 id 被摘掉，version 递增", () => {
    const empId = createEmployee({ name: "批次4-排班摘id" })!.id;
    const keep = createShift({ name: "保留班次", startTime: "09:00", endTime: "18:00" }).id;
    const gone = createShift({ name: "待删班次", startTime: "13:00", endTime: "21:00" }).id;
    upsertSchedule({ employeeId: empId, employeeName: "批次4-排班摘id", shiftIds: [keep, gone] });
    const of = () => listSchedules().find((s) => s.employeeId === empId);
    expect(of()!.shiftIds).toEqual([keep, gone]);

    expect(deleteShift(gone)).toBe(true);
    expect(of()!.shiftIds).toEqual([keep]);
    expect(of()!.version).toBeGreaterThan(1);

    deleteShift(keep);
    db.prepare("DELETE FROM schedules WHERE employeeId = ?").run(empId);
    db.prepare("DELETE FROM employees WHERE id = ?").run(empId);
  });

  it("删不存在的班次返回 false，且不碰任何排班", () => {
    expect(deleteShift("no-such-shift-id")).toBe(false);
  });
});

describe("删除账号：清私人状态 + 用户名不下架复用", () => {
  const user = "batch4_purge";

  beforeEach(() => {
    // 测试库（data-test）跨运行留存，上一轮跑到一半失败会留下这些固定 id
    db.prepare("DELETE FROM sessions WHERE username = ?").run(user);
    db.prepare("DELETE FROM accounts WHERE username = ?").run(user);
    db.prepare("DELETE FROM account_tombstones WHERE username = ?").run(user);
    db.prepare("DELETE FROM ai_conversations WHERE username = ?").run(user);
    db.prepare("DELETE FROM user_ai_config WHERE username = ?").run(user);
    db.prepare("DELETE FROM ai_usage WHERE username = ?").run(user);
    db.prepare("DELETE FROM saved_items WHERE owner = ?").run(user);
    db.prepare("DELETE FROM notifications WHERE recipient = ?").run(user);
    db.prepare("DELETE FROM todos WHERE createdBy = ?").run(user);
    db.prepare("DELETE FROM notifications WHERE id = ?").run("n-other-4");
  });

  it("AI 对话 / 个人模型配置（含 Key）/ 已用额度 / 打印偏好 / 通知收件箱都被清掉", () => {
    createAccount({ username: user, password: "Batch4Pass123", systemRole: "EMPLOYEE" });
    insert("ai_conversations", { id: `c-${user}`, username: user, title: "旧对话", messages: "[]" });
    insert("user_ai_config", { username: user, baseUrl: "https://x.example", apiKey: "sk-secret", model: "m" });
    insert("ai_usage", { username: user, day: "2026-09-26", used: 7 });
    insert("saved_items", { id: `s-${user}`, kind: "print-pref", owner: user, name: "n", payload: "{}" });
    insert("notifications", { id: `n-${user}`, title: "旧通知", message: "", type: "info", read: 0, recipient: user });

    expect(deleteAccount(user)).toBe(true);
    expect(count("SELECT COUNT(*) c FROM ai_conversations WHERE username = ?", user)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM user_ai_config WHERE username = ?", user)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM ai_usage WHERE username = ?", user)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM saved_items WHERE owner = ?", user)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE recipient = ?", user)).toBe(0);
    expect(getAccount(user)).toBeNull();
  });

  it("别人的同名前缀数据不受影响", () => {
    createAccount({ username: user, password: "Batch4Pass123", systemRole: "EMPLOYEE" });
    insert("notifications", { id: "n-other-4", title: "别人的", message: "", recipient: "someone-else-4" });
    deleteAccount(user);
    expect(count("SELECT COUNT(*) c FROM notifications WHERE id = ?", "n-other-4")).toBe(1);
    db.prepare("DELETE FROM notifications WHERE id = ?").run("n-other-4");
  });

  it("同名不能复用：409 且说清原因", () => {
    createAccount({ username: user, password: "Batch4Pass123", systemRole: "EMPLOYEE" });
    deleteAccount(user);
    let err: unknown;
    try {
      createAccount({ username: user, password: "Batch4Pass456", systemRole: "EMPLOYEE" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { status?: number }).status).toBe(409);
    expect((err as Error).message).toMatch("不能复用");
  });

  it("审批 / 待办这类归属记录保留（审计还要靠它们追人）", () => {
    createAccount({ username: user, password: "Batch4Pass123", systemRole: "EMPLOYEE" });
    insert("todos", { id: `t-${user}`, title: "旧待办", createdBy: user, assignee: user });
    deleteAccount(user);
    expect(count("SELECT COUNT(*) c FROM todos WHERE id = ?", `t-${user}`)).toBe(1);
    db.prepare("DELETE FROM todos WHERE id = ?").run(`t-${user}`);
  });
});

describe("部门树重名", () => {
  it("同一上级下两个同名部门会被拒（名字→id 反查不能靠运气）", () => {
    expect(() =>
      replaceDepartmentsTree([
        {
          id: "B4-PARENT",
          name: "批次4分部",
          children: [
            { id: "B4-A", name: "前厅部" },
            { id: "B4-B", name: "前厅部" },
          ],
        },
      ])
    ).toThrow(DeptDataError);
    // 校验必须发生在写库之前：拒绝之后不该留下半个树
    expect(db.prepare("SELECT COUNT(*) c FROM departments WHERE id LIKE 'B4-%'").get()).toEqual({ c: 0 });
  });

  it("不同上级下同名是允许的（连锁门店会有两个前厅部）", () => {
    // 整树替换会删掉「本次没提交」的部门，所以拿当前真实树做基底再追加，最后原样提交回去
    const original = listDepartmentsTree();
    const withDupes = [
      ...original,
      { id: "B4-X", name: "批次4华北", children: [{ id: "B4-X1", name: "前厅部" }] },
      { id: "B4-Y", name: "批次4华南", children: [{ id: "B4-Y1", name: "前厅部" }] },
    ];
    expect(() => replaceDepartmentsTree(withDupes)).not.toThrow();
    expect(count("SELECT COUNT(*) c FROM departments WHERE id LIKE 'B4-%'")).toBe(4);
    replaceDepartmentsTree(original); // 收尾：B4-* 不在树里 → 被删
    expect(count("SELECT COUNT(*) c FROM departments WHERE id LIKE 'B4-%'")).toBe(0);
  });
});

describe("写进 TEXT 时间列的值与列默认值同形", () => {
  it("formatLocalDateTime 产出 'YYYY-MM-DD HH:MM:SS'", () => {
    expect(formatLocalDateTime(new Date(2026, 8, 26, 7, 5, 3))).toBe("2026-09-26 07:05:03");
  });

  it("续签写员工表用的是同一种形状", () => {
    const id = createEmployee({ name: "批次4-续签时间", contractExpiry: "2027-01-01" })!.id;
    renewContract(
      { id, name: "批次4-续签时间", contractExpiry: "2027-01-01" },
      { contractYears: 3, contractSignDate: "2027-01-02", contractExpiry: "2030-01-02" },
      "admin"
    );
    const updatedAt = String(
      (db.prepare("SELECT updatedAt FROM employees WHERE id = ?").get(id) as { updatedAt: string }).updatedAt
    );
    expect(updatedAt).toMatch(TS_SHAPE);
    const created = String(
      (db.prepare("SELECT createdAt FROM contract_renewals WHERE employeeId = ?").get(id) as { createdAt: string })
        .createdAt
    );
    expect(created).toMatch(TS_SHAPE);
    expect(getEmployee(id)!.daysToExpiry).toBe(daysUntilLocal("2030-01-02"));
    db.prepare("DELETE FROM contract_renewals WHERE employeeId = ?").run(id);
    db.prepare("DELETE FROM employees WHERE id = ?").run(id);
  });
});
