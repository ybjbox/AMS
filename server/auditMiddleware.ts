/**
 * 审计网关（P1-5）—— 统一记录所有写操作，不需要每个路由手写埋点。
 *
 * 挂载方式：app.use("/api", authGate) 之后紧跟 app.use("/api", auditGate)。
 * 放在 authGate 之后是刻意的：这样 req.auth 已经解析好，能知道「谁」在操作；
 * 而被 authGate 拦掉的 401/403 由 logSecurityEvent 负责留痕（已桥接进同一张表）。
 *
 * 三个关键时序问题及处理：
 * 1. **body 还没解析**。express.json() 挂在各 router 内部，晚于本中间件执行，
 *    所以请求体只能在 res 的 finish 回调里读——那时 body 已经被解析好了。
 * 2. **params 还没解析**。同理 req.params 此刻为空，目标 id 改用路径正则捕获。
 * 3. **before 快照必须在业务处理前取**。所以 next() 之前同步查一次数据库快照，
 *    finish 时再查一次作为 after，二者做字段级 diff。
 */
import type { RequestHandler, Request, Response, NextFunction } from "express";
import { writeAuditLog, type AuditLevel } from "./auditDb.ts";
import { getEmployee } from "./db.ts";
import { listDepartmentsTree, listRoles } from "./departmentsDb.ts";
import { getDocumentRaw } from "./documentsDb.ts";
import { getTodoRaw } from "./todosDb.ts";
import { getNotificationRaw } from "./notificationsDb.ts";
import { db } from "./db.ts";

// ---------------------------------------------------------------- 工具

function clientIp(req: Request): string {
  return (req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 按 HTTP 方法推导动作后缀 */
function verb(method: string): string {
  switch (method) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return "read";
  }
}

/** 把可能很大的请求体压成「能看懂但不撑爆表」的摘要 */
function compactBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body ?? null;
  if (Array.isArray(body)) {
    return body.length > 5 ? `[共 ${body.length} 项]` : body;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = v.length > 5 ? `[共 ${v.length} 项]` : v;
    } else if (typeof v === "string" && v.length > 200) {
      out[k] = `[${v.length} 字符]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- 快照解析器

function shiftSnapshot(id: string) {
  return db.prepare("SELECT * FROM shifts WHERE id = ?").get(id) ?? null;
}
function scheduleSnapshot(employeeId: string) {
  return db.prepare("SELECT * FROM schedules WHERE employeeId = ?").get(employeeId) ?? null;
}
function recordSnapshot(id: string) {
  return db.prepare("SELECT * FROM punch_records WHERE id = ?").get(id) ?? null;
}
function folderSnapshot(id: string) {
  return db.prepare("SELECT * FROM folders WHERE id = ?").get(id) ?? null;
}
function documentSetSnapshot(id: string) {
  return db.prepare("SELECT * FROM document_sets WHERE id = ?").get(id) ?? null;
}

// ---------------------------------------------------------------- 路由 → 动作映射表

interface Descriptor {
  /** 匹配 path（已剥掉 /api）；第一个捕获组作为 targetId */
  pattern: RegExp;
  /** 命中的方法，缺省表示所有写方法 */
  methods?: string[];
  /** 动作名；给字符串时会自动拼上 .create/.update/.delete */
  action: string | ((method: string, path: string) => string);
  category: string;
  targetType: string;
  /** 取业务对象快照，用于 before/after 差异比对 */
  snapshot?: (id: string) => unknown;
  /** 从快照里提取可读名称 */
  nameOf?: (snap: unknown) => string;
  level?: AuditLevel;
}

/** 从审计快照对象中安全提取字符串字段（缺失/非字符串时返回空串）。 */
function pickField(snap: unknown, key: string): string {
  if (snap && typeof snap === "object" && key in snap) {
    const v = (snap as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}

const DESCRIPTORS: Descriptor[] = [
  // ---- 员工（最敏感：薪资、身份证、合同都挂在这里）----
  {
    pattern: /^\/users\/([^/]+)\/?$/,
    action: "employee",
    category: "员工",
    targetType: "employee",
    snapshot: (id) => getEmployee(id),
    nameOf: (s) => pickField(s, "name"),
  },
  { pattern: /^\/users\/?$/, action: "employee", category: "员工", targetType: "employee" },

  // ---- 组织架构（整树替换，快照存整棵树的摘要）----
  {
    pattern: /^\/departments\/tree\/?$/,
    action: () => "department.replace_tree",
    category: "组织架构",
    targetType: "departmentTree",
    snapshot: () => listDepartmentsTree(),
  },
  {
    pattern: /^\/departments\/roles\/?$/,
    action: () => "role.replace",
    category: "组织架构",
    targetType: "roleList",
    snapshot: () => listRoles(),
  },

  // ---- 文档 ----
  // 流式上传（P2-4）：元数据在 query，文件名由路由写入 req.body.name，finish 时补全审计名称
  {
    pattern: /^\/documents\/upload\/?$/,
    action: "document",
    category: "文档",
    targetType: "document",
  },
  {
    pattern: /^\/documents\/([^/]+)\/?$/,
    action: "document",
    category: "文档",
    targetType: "document",
    snapshot: (id) => getDocumentRaw(id),
    nameOf: (s) => pickField(s, "name"),
  },
  { pattern: /^\/documents\/?$/, action: "document", category: "文档", targetType: "document" },
  {
    pattern: /^\/folders\/([^/]+)\/?$/,
    action: "folder",
    category: "文档",
    targetType: "folder",
    snapshot: folderSnapshot,
    nameOf: (s) => pickField(s, "name"),
  },
  { pattern: /^\/folders\/?$/, action: "folder", category: "文档", targetType: "folder" },
  {
    pattern: /^\/document-sets\/([^/]+)\/?$/,
    action: "documentSet",
    category: "文档",
    targetType: "documentSet",
    snapshot: documentSetSnapshot,
    nameOf: (s) => pickField(s, "name"),
  },
  {
    pattern: /^\/document-sets\/?$/,
    action: "documentSet",
    category: "文档",
    targetType: "documentSet",
  },

  // ---- 待办与通知（P2-7）----
  {
    pattern: /^\/todos\/([^/]+)\/?$/,
    action: "todo",
    category: "待办",
    targetType: "todo",
    snapshot: (id) => getTodoRaw(id),
    nameOf: (s) => pickField(s, "title"),
  },
  { pattern: /^\/todos\/?$/, action: "todo", category: "待办", targetType: "todo" },
  {
    pattern: /^\/notifications\/([^/]+)\/?$/,
    action: "notification",
    category: "通知",
    targetType: "notification",
    snapshot: (id) => getNotificationRaw(id),
    nameOf: (s) => pickField(s, "title"),
  },
  { pattern: /^\/notifications\/?$/, action: "notification", category: "通知", targetType: "notification" },

  // 文件下载属于「数据出境」动作，GET 也要留痕
  {
    pattern: /^\/files\/([^/]+)\/?$/,
    methods: ["GET"],
    action: () => "document.download",
    category: "文档",
    targetType: "document",
    snapshot: (id) => getDocumentRaw(id),
    nameOf: (s) => pickField(s, "name"),
  },

  // ---- 考勤 ----
  {
    pattern: /^\/attendance\/shifts\/([^/]+)\/?$/,
    action: "shift",
    category: "考勤",
    targetType: "shift",
    snapshot: shiftSnapshot,
    nameOf: (s) => pickField(s, "name"),
  },
  { pattern: /^\/attendance\/shifts\/?$/, action: "shift", category: "考勤", targetType: "shift" },
  {
    pattern: /^\/attendance\/schedules\/([^/]+)\/?$/,
    action: "schedule",
    category: "考勤",
    targetType: "schedule",
    snapshot: scheduleSnapshot,
    nameOf: (s) => pickField(s, "employeeName"),
  },
  {
    pattern: /^\/attendance\/schedules\/?$/,
    action: (m) => (m === "DELETE" ? "schedule.clear_all" : "schedule.bulk_upsert"),
    category: "考勤",
    targetType: "schedule",
  },
  {
    pattern: /^\/attendance\/records\/([^/]+)\/?$/,
    action: "punchRecord",
    category: "考勤",
    targetType: "punchRecord",
    snapshot: recordSnapshot,
    nameOf: (s) => pickField(s, "employeeName"),
  },
  {
    pattern: /^\/attendance\/records\/?$/,
    action: (m) => (m === "DELETE" ? "punchRecord.clear_all" : "punchRecord.bulk_replace"),
    category: "考勤",
    targetType: "punchRecord",
  },
  {
    pattern: /^\/attendance\/analyze\/?$/,
    action: () => "attendance.analyze",
    category: "考勤",
    targetType: "anomaly",
  },

  // ---- 导出（会吐出身份证等敏感字段，属于高价值审计对象）----
  {
    pattern: /^\/export\/employees\/?$/,
    methods: ["POST"],
    action: () => "export.employees",
    category: "导出",
    targetType: "employeeList",
  },
  {
    pattern: /^\/export-templates\/([^/]+)\/?$/,
    action: "template",
    category: "模板",
    targetType: "scriptTemplate",
  },
  { pattern: /^\/export-templates\/?$/, action: "template", category: "模板", targetType: "scriptTemplate" },
  { pattern: /^\/audit-logs\/export\/?$/, methods: ["GET"], action: () => "audit.export", category: "系统", targetType: "auditLog" },

  // ---- 系统 ----
  { pattern: /^\/themes\/?$/, action: "theme", category: "系统", targetType: "theme" },
];

/** 这些路径不进审计网关：/auth/* 已由 logSecurityEvent 记录（并桥接到同一张表），避免重复 */
const SKIP = [/^\/auth\b/, /^\/health\b/];

function resolveDescriptor(
  method: string,
  path: string
): { desc: Descriptor; targetId: string } | null {
  for (const desc of DESCRIPTORS) {
    if (desc.methods) {
      if (!desc.methods.includes(method)) continue;
    } else if (!MUTATING.has(method)) {
      continue;
    }
    const m = desc.pattern.exec(path);
    if (m) return { desc, targetId: m[1] ? decodeURIComponent(m[1]) : "" };
  }
  return null;
}

// ---------------------------------------------------------------- 网关

export const auditGate: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const path = req.path || "/";
  const method = req.method.toUpperCase();

  if (SKIP.some((p) => p.test(path))) return next();

  const matched = resolveDescriptor(method, path);
  // 未命中映射表的写操作也要记（宁可多记，不能漏记），只是动作名比较泛化
  if (!matched && !MUTATING.has(method)) return next();

  const desc = matched?.desc;
  const targetId = matched?.targetId ?? "";
  const started = Date.now();

  // 业务处理前取一次快照
  let before: unknown = null;
  try {
    if (desc?.snapshot) before = desc.snapshot(targetId);
  } catch {
    before = null;
  }

  // 捕获错误响应体，便于在日志里看到失败原因
  const originalJson = res.json.bind(res);
  let errorMessage = "";
  res.json = ((payload: unknown) => {
    if (payload && typeof payload === "object" && "error" in payload) {
      const errVal = (payload as { error?: unknown }).error;
      if (typeof errVal === "string") errorMessage = errVal;
    }
    return originalJson(payload as Parameters<typeof originalJson>[0]);
  }) as Response["json"];

  res.on("finish", () => {
    try {
      const status = res.statusCode;
      const success = status < 400;

      // 只有成功的写操作才值得再查一次 after；DELETE 成功后目标已不存在
      let after: unknown = null;
      if (success && desc?.snapshot && method !== "DELETE") {
        try {
          after = desc.snapshot(targetId);
        } catch {
          after = null;
        }
      }

      const action =
        typeof desc?.action === "function"
          ? desc.action(method, path)
          : desc
            ? `${desc.action}.${verb(method)}`
            : `api.${verb(method)}`;

      const body = compactBody(req.body);
      const bodyName =
        req.body && typeof req.body === "object" && "name" in req.body && typeof (req.body as { name?: unknown }).name === "string"
          ? (req.body as { name: string }).name
          : "";
      const targetName =
        (desc?.nameOf?.(after) || desc?.nameOf?.(before) || "") || bodyName;

      writeAuditLog({
        actor: req.auth?.username ?? "anonymous",
        actorRole: req.auth?.systemRole ?? "",
        action,
        category: desc?.category ?? "其他",
        method,
        path,
        targetType: desc?.targetType ?? "",
        targetId,
        targetName,
        status,
        ip: clientIp(req),
        ua: req.get("user-agent") ?? "",
        // 没有快照解析器时，用请求体摘要充当「变更内容」
        before: before ?? undefined,
        after: after ?? (before ? undefined : body),
        detail: success ? describe(action, req, body) : errorMessage || `请求失败 ${status}`,
        durationMs: Date.now() - started,
      });
    } catch (e) {
      console.warn("[audit] 记录写操作失败:", e);
    }
  });

  next();
};

/** 给几类高价值动作补一句人话描述，日志列表里一眼能看懂 */
function describe(action: string, req: Request, body: unknown): string {
  const b = (req.body ?? {}) as Record<string, any>;
  switch (action) {
    case "export.employees":
      return `导出 ${Array.isArray(b.data) ? b.data.length : "?"} 条员工数据（${
        b.config?.includeResigned ? "含离职" : "不含离职"
      }，标题「${b.config?.title ?? ""}」）`;
    case "department.replace_tree":
      return `提交部门树，共 ${Array.isArray(b.departments) ? b.departments.length : 0} 个顶层节点`;
    case "role.replace":
      return `提交职位列表，共 ${Array.isArray(b.roles) ? b.roles.length : 0} 项`;
    case "punchRecord.bulk_replace":
      return `整表导入打卡记录 ${Array.isArray(b.records ?? b) ? (b.records ?? b).length : 0} 条`;
    case "schedule.bulk_upsert":
      return `批量提交排班 ${Array.isArray(b.schedules ?? b) ? (b.schedules ?? b).length : 0} 条`;
    case "attendance.analyze":
      return "触发考勤异常分析";
    case "document.download":
      return "下载文档文件";
    default:
      return typeof body === "object" && body ? "" : String(body ?? "");
  }
}
