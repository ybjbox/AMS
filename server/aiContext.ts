import { db } from "./db.ts";

/**
 * 轻量 RAG（检索增强）：把业务库的聚合数据取出来，拼进 system prompt，
 * 让 AI 助手能基于现有行政数据回答，而不是凭空编造。
 *
 * 安全原则：
 * - 只取「计数 / 维度名」级别的摘要，绝不 dump 个人敏感字段（身份证、薪资、手机号）。
 * - 每张表的查询都用 try/catch 包住，表结构或列名不一致时静默降级（返回空），不抛错中断对话。
 * - 表名都是硬编码常量（非用户输入），字符串插值安全。
 */

/** 安全计数：表不存在或查询失败返回 null */
function safeCount(table: string): number | null {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as
      | { c: number }
      | undefined;
    return row ? row.c : null;
  } catch {
    return null;
  }
}

/** 安全取行：失败返回空数组，最多 limit 行 */
function safeRows(sql: string, limit = 50): unknown[] {
  try {
    return (db.prepare(sql).all() as unknown[]).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * 构造业务数据上下文文本。
 * @param _messages 当前对话（预留给未来做「问题相关的定向检索」）
 * @param username  当前登录账号，用于提示数据权限范围
 */
export async function buildDataContext(
  _messages: unknown[],
  username?: string
): Promise<string> {
  const parts: string[] = [];

  const accounts = safeCount("accounts");
  const employees = safeCount("employees");
  const departments = safeCount("departments");
  const documents = safeCount("documents");
  const todos = safeCount("todos");
  const punchRecords = safeCount("punch_records");
  const notifications = safeCount("notifications");

  parts.push("【组织概览】");
  if (typeof accounts === "number") parts.push(`- 系统账号总数：${accounts}`);
  if (typeof employees === "number") parts.push(`- 员工档案数：${employees}`);
  if (typeof departments === "number") parts.push(`- 部门数：${departments}`);
  if (typeof punchRecords === "number")
    parts.push(`- 考勤打卡记录数：${punchRecords}`);
  if (typeof todos === "number") parts.push(`- 待办事项数：${todos}`);
  if (typeof documents === "number") parts.push(`- 文档数：${documents}`);
  if (typeof notifications === "number")
    parts.push(`- 通知数：${notifications}`);

  // 部门维度（departments 表有 name 列）
  const deptRows = safeRows(
    "SELECT name FROM departments ORDER BY name"
  ) as Array<{ name?: string }>;
  if (deptRows.length) {
    parts.push("\n【部门列表】");
    for (const d of deptRows) {
      parts.push(`- ${d.name || "未命名"}`);
    }
  }

  if (username) {
    parts.push(
      `\n【当前用户】登录账号：${username}。回答时遵守数据权限：普通员工仅能查看本人相关数据，不要臆测他人的隐私字段。`
    );
  }

  return parts.join("\n");
}
