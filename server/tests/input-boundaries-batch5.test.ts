/**
 * 批次 5 回归（单元侧）：出网目标判定、LIKE 通配符转义、错误回显收敛、若干 schema 边界。
 * 端到端那一半（缺字段 400、行数上限、keyword=%）在 scripts/verify-validation.ts 里。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { escapeLike, likeContains, likeClause } from "../sqliteUtil.ts";
import { assertSafeOutboundUrl } from "../outbound.ts";
import { clientErrorResponse } from "../errorHandler.ts";
import { listEmployees, createEmployee, deleteEmployee } from "../db.ts";
import {
  chatMessagesSchema,
  exportEmployeesSchema,
  documentUpdateSchema,
  deptShiftRuleSchema,
  employeeCreateSchema,
} from "../validation.ts";

describe("LIKE 通配符转义", () => {
  it("escapeLike 把 % _ 与转义符本身都收起来", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("likeContains 先转义再包 %（顺序反了就等于没转义）", () => {
    expect(likeContains("a%b")).toBe("%a\\%b%");
  });

  it("likeClause 一定带 ESCAPE，否则反斜杠会被当普通字符", () => {
    expect(likeClause("e.name")).toBe("e.name LIKE ? ESCAPE '\\'");
  });

  it("库里搜 % 只能命中字面量，不再是「把全表给我」", () => {
    // 建两条：一条名字里真的带 %，一条不带
    const withPercent = createEmployee({ name: "甲乙%丙" })!;
    const plain = createEmployee({ name: "丁卯己" })!;
    // listEmployees 不带分页参数时返回数组（分页信封只在请求分页时出现）
    const search = (keyword: string): string[] => {
      const r = listEmployees({ keyword });
      if (!Array.isArray(r)) throw new Error("预期返回数组，实际拿到分页信封");
      return r.map((u) => u?.id ?? "");
    };
    try {
      expect(search("%")).toEqual([withPercent.id]); // 只命中字面量带 % 的那条
      expect(search("_____")).toEqual([]); // 5 个下划线不再匹配任意 5 字名
      expect(search("丁卯己")).toEqual([plain.id]);
    } finally {
      deleteEmployee(withPercent.id);
      deleteEmployee(plain.id);
    }
  });
});

describe("出网目标判定（先解析再判 IP）", () => {
  /**
   * vitest 的 server project 开了 `AMS_ALLOW_LOCAL_OUTBOUND=1`（出站集成测试要把
   * baseUrl 指到本机桩服务），所以这一组断言必须显式把开关关掉再测，
   * 否则"回环被挡"这条恰恰测不到。
   */
  const prev = { value: process.env.AMS_ALLOW_LOCAL_OUTBOUND, had: "AMS_ALLOW_LOCAL_OUTBOUND" in process.env };
  beforeEach(() => {
    delete process.env.AMS_ALLOW_LOCAL_OUTBOUND;
  });
  afterEach(() => {
    if (prev.had) process.env.AMS_ALLOW_LOCAL_OUTBOUND = prev.value;
    else delete process.env.AMS_ALLOW_LOCAL_OUTBOUND;
  });

  it("字面量回环 / 元数据 / 私网一律挡", async () => {
    for (const url of ["http://127.0.0.1:11434/v1", "http://169.254.169.254/latest", "http://localhost:8080", "http://[::1]/v1"]) {
      const r = await assertSafeOutboundUrl(url);
      expect(r.ok, url).toBe(false);
    }
  });

  it("测试用的开关只能放开回环/链路本地，私网仍按 blockPrivate 判", async () => {
    process.env.AMS_ALLOW_LOCAL_OUTBOUND = "1";
    expect((await assertSafeOutboundUrl("http://127.0.0.1:11434/v1")).ok).toBe(true);
    expect((await assertSafeOutboundUrl("http://10.1.2.3/v1")).ok).toBe(false);
    delete process.env.AMS_ALLOW_LOCAL_OUTBOUND;
    expect((await assertSafeOutboundUrl("http://127.0.0.1:11434/v1")).ok).toBe(false);
  });

  it("私网：默认挡，通知通道这类内网自用场景放开", async () => {
    expect((await assertSafeOutboundUrl("http://10.1.2.3/v1")).ok).toBe(false);
    expect((await assertSafeOutboundUrl("http://10.1.2.3/v1", { blockPrivate: false })).ok).toBe(true);
  });

  it("IPv4-mapped IPv6 不能拿来穿回环", async () => {
    // URL 会把 ::ffff:127.0.0.1 规范成 ::ffff:7f00:1，两种写法都得挡
    for (const url of ["http://[::ffff:127.0.0.1]/v1", "http://[::ffff:7f00:1]/v1"]) {
      const r = await assertSafeOutboundUrl(url);
      expect(r.ok, url).toBe(false);
    }
  });

  it("非 http/https 协议一律挡", async () => {
    expect((await assertSafeOutboundUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await assertSafeOutboundUrl("gopher://10.0.0.1/")).ok).toBe(false);
  });

  /**
   * DNS 走注入而不是真解析：本机挂着 TUN/透明代理时任何域名都"解析得出来"（fake-ip），
   * 拿真 DNS 写这条断言会得到环境相关的假绿。这里要的正是那条最要紧的性质 ——
   * **公网域名解析到内网 IP 必须被拒**（正是旧的按主机名判的版本挡不住的）。
   */
  it("公网域名解析到内网 / 无记录 → 拒（DNS 重绑定这一类）", async () => {
    const resolve = (ips: string[]) => async () => ips;
    expect(
      (await assertSafeOutboundUrl("https://llm.example.com/v1", { resolve: resolve(["127.0.0.1"]) })).ok
    ).toBe(false);
    expect(
      (await assertSafeOutboundUrl("https://llm.example.com/v1", { resolve: resolve(["169.254.169.254"]) })).ok
    ).toBe(false);
    expect(
      (await assertSafeOutboundUrl("https://llm.example.com/v1", { resolve: resolve(["10.1.2.3", "8.8.8.8"]) })).ok
    ).toBe(false); // 任一地址是内网就拒，不能"有一个公网地址就算过"
    expect((await assertSafeOutboundUrl("https://llm.example.com/v1", { resolve: resolve([]) })).ok).toBe(false);
    expect(
      (await assertSafeOutboundUrl("https://llm.example.com/v1", { resolve: resolve(["8.8.8.8"]) })).ok
    ).toBe(true);
  });

  it("公网域名走真解析：解析到公网 IP 才放行", async () => {
    const r = await assertSafeOutboundUrl("https://api.openai.com/v1");
    // 没有外网/被代理挡住的机器上会返回"解析失败"——那也是拒绝，不是放行
    if (r.ok) expect(r.addresses.length).toBeGreaterThan(0);
    else expect(r.reason).toMatch(/拒绝|解析|内网|本机/);
  });
});

describe("错误回显收敛", () => {
  const fakeRes = () => {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      headersSent: false,
      status(code: number) {
        out.status = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
        return res;
      },
    };
    return { res, out };
  };

  it("系统级错误（SqliteError / TypeError）→ 500 + 通用文案，不外泄表名列名", () => {
    const e = Object.assign(new Error("UNIQUE constraint failed: saved_items.kind, saved_items.owner"), {
      name: "SqliteError",
    });
    const { res, out } = fakeRes();
    clientErrorResponse(res as never, e);
    expect(out.status).toBe(500);
    expect((out.body as { error: string }).error).toBe("服务器内部错误");
  });

  it("业务错误仍原样回 400（用户要看得懂该改哪一行）", () => {
    const e = Object.assign(new Error("部门名称不能为空"), { name: "DeptDataError", status: 400 });
    const { res, out } = fakeRes();
    clientErrorResponse(res as never, e);
    expect(out.status).toBe(400);
    expect((out.body as { error: string }).error).toBe("部门名称不能为空");
  });
});

describe("入口 schema 的边界", () => {
  it("AI 消息：角色白名单、单条长度、总条数", () => {
    expect(chatMessagesSchema.safeParse({ messages: [{ role: "user", content: "你好" }] }).success).toBe(true);
    expect(chatMessagesSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatMessagesSchema.safeParse({ messages: [{ role: "user", content: 42 }] }).success).toBe(false);
    expect(chatMessagesSchema.safeParse({ messages: [{ role: "user", content: "字".repeat(20_001) }] }).success).toBe(false);
    expect(
      chatMessagesSchema.safeParse({
        messages: Array.from({ length: 51 }, (_, i) => ({ role: "user", content: `m${i}` })),
      }).success
    ).toBe(false);
  });

  it("导出：config 必填、至少一列、列对象不收未知结构", () => {
    expect(exportEmployeesSchema.safeParse({ data: [] }).success).toBe(false);
    expect(exportEmployeesSchema.safeParse({ config: { columns: [] } }).success).toBe(false);
    const okRes = exportEmployeesSchema.safeParse({
      config: { title: "花名册", columns: [{ header: "姓名", key: "name" }] },
    });
    expect(okRes.success).toBe(true);
    // data 缺省时补空数组，行为与旧的"只导出表头"一致
    if (okRes.success) expect(okRes.data.data).toEqual([]);
  });

  it("文档更新不再是「任何对象都过」", () => {
    expect(documentUpdateSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(documentUpdateSchema.safeParse({ name: "x".repeat(300) }).success).toBe(false);
    expect(documentUpdateSchema.safeParse({ folderId: null }).success).toBe(true);
  });

  it("工作时段：workdays 是数字数组，缺省补工作日五天", () => {
    const r = deptShiftRuleSchema.safeParse({
      departmentId: "1",
      name: "白班",
      startTime: "08:00",
      endTime: "17:00",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(
      deptShiftRuleSchema.safeParse({
        departmentId: "1",
        name: "x",
        startTime: "08:00",
        endTime: "17:00",
        workdays: "1,2,3",
      }).success
    ).toBe(false);
    expect(
      deptShiftRuleSchema.safeParse({
        departmentId: "1",
        name: "x",
        startTime: "08:00",
        endTime: "17:00",
        workdays: [1, 1, 2],
      }).success
    ).toBe(false);
  });

  it("员工姓名有上限（以前只有 100kb 的 body 限制）", () => {
    expect(employeeCreateSchema.safeParse({ name: "甲".repeat(61) }).success).toBe(false);
    expect(employeeCreateSchema.safeParse({ name: "甲".repeat(60) }).success).toBe(true);
  });
});
