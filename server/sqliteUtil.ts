/**
 * SQLite 行读取工具（typescript-best-practices：boundary validation）。
 *
 * node:sqlite 的查询结果类型是 `Record<string, SQLOutputValue>`——SQLite 是
 * 弱类型边界，值可能是 null/number/bigint/string/Uint8Array。直接在业务代码里
 * `as any` 或逐字段断言会在数据意外时静默出错。
 *
 * 策略：在这一层做「边界解析」，业务代码拿到的是明确的 string/number；
 * 解析规则与 SQLite 自身的亲和性（affinity）一致：
 * - 字符串列读到 number（如 `"42"`）：宽容转换（返回 "42"）
 * - 数字列读到字符串/大整数：转为 number（超出安全整数时保留精度丢失警告值）
 * - null/undefined：由调用方选择默认值（提供 asString / asNullableString 等变体）
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { SQLOutputValue } from 'node:sqlite';

/** SQLite 查询结果行的类型化视图（边界类型，勿直接使用其字段值） */
export type DbRow = Record<string, SQLOutputValue>;

/** 必填字符串：null/undefined → ''（与旧 rowToX 的 `?? ''` 语义一致） */
export function asString(v: SQLOutputValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return String(v);
}

/** 可空字符串：null/undefined → null */
export function asNullableString(v: SQLOutputValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  return asString(v);
}

/**
 * LIKE 通配符转义。
 *
 * 用户输入的 `%` 与 `_` 在 SQLite 里是通配符，不转义有两重后果：
 * 1) 搜索语义错 —— 想搜姓名里真的带「%」的人搜不到，`?keyword=_` 会匹配所有单字符值；
 * 2) **`?keyword=%` 等于「把所有行都给我」** —— 走 listEmployees / listRecords /
 *    文档列表这些「不带 page 就返回全表」的路径，审计列表的 `?q=%` 更是直接全表扫
 *    最敏感的那张表（导出上限 1 万行含 before/after 快照）。
 * 绑定参数本身防的是注入，防不了这个 —— 通配符是 LIKE 的语义，不是值。
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%…%` 包含式匹配值（配合 likeClause 使用；单独用会漏掉 ESCAPE 而失效） */
export function likeContains(input: string): string {
  return `%${escapeLike(input)}%`;
}

/**
 * 生成 `列 LIKE ? ESCAPE '\'`。
 *
 * 把 ESCAPE 焊在子句里而不是指望调用方记得写：漏一次就等于转义白做，
 * 而且 `\\` 会被 SQLite 当成转义符吃掉，行为比不做转义更难懂。
 */
export function likeClause(column: string): string {
  return `${column} LIKE ? ESCAPE '\\'`;
}

/** 必填数字：null/undefined/非数字 → 0（与旧 `.get() as any` 的用法兼容） */
export function asNumber(v: SQLOutputValue | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 可空数字：null/undefined → null */
export function asNullableNumber(v: SQLOutputValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  return asNumber(v);
}

/** 布尔小整数（0/1）：与 SQLite 存储约定一致 */
export function asBool01(v: SQLOutputValue | undefined): number {
  return asNumber(v) ? 1 : 0;
}

/**
 * 单行查询辅助：把 `db.prepare(...).get(...)` 的结果收窄为 DbRow | undefined，
 * 供 rowToX 转换函数使用（消除调用处的 `as any` 断言）。
 */
export const getRow = (
  stmt: { get: (...args: never[]) => unknown },
  ...args: unknown[]
): DbRow | undefined => {
  const row = (stmt.get as (...a: unknown[]) => unknown)(...args);
  return row === null || row === undefined ? undefined : (row as DbRow);
};

/**
 * 多行查询辅助：把 `.all()` 结果收窄为 DbRow[]。
 */
export const allRows = (
  stmt: { all: (...args: never[]) => unknown },
  ...args: unknown[]
): DbRow[] => {
  const rows = (stmt.all as (...a: unknown[]) => unknown)(...args);
  return Array.isArray(rows) ? (rows as DbRow[]) : [];
};

/** COUNT(*) 结果读取帮助（SQLite 总是返回 number） */
export function asCount(v: SQLOutputValue | undefined): number {
  return asNumber(v);
}

// ---------- 慢查询监控（可观测性） ----------

/** 慢查询阈值（毫秒），可用 LOG_SLOW_QUERY_MS 环境变量调整 */
const SLOW_QUERY_MS = Number(process.env.LOG_SLOW_QUERY_MS) || 500;

/**
 * 包装 DatabaseSync 的 prepare，为每个语句挂耗时统计：
 * 超过 SLOW_QUERY_MS 的查询以结构化 JSON 输出到 stdout（与 accessLog 同格式）。
 *
 * 设计取舍：node:sqlite 无原生钩子，只能包一层 prepare。
 * 只在「执行」时计时（prepare 本身廉价），且只记录慢查询避免日志洪水。
 */
export function instrumentDatabase(db: DatabaseSync): void {
  const origPrepare = db.prepare.bind(db);
  db.prepare = ((sql: string, ..._params: SQLInputValue[]) => {
    const stmt = origPrepare(sql);

    const timed = <A extends SQLInputValue[], R>(fn: (...args: A) => R, kind: string): ((...args: A) => R) =>
      ((...args: A) => {
        const start = performance.now();
        const result = fn(...args);
        const elapsed = performance.now() - start;
        if (elapsed >= SLOW_QUERY_MS) {
          process.stdout.write(
            JSON.stringify({
              ts: new Date().toISOString(),
              method: 'sqlite',
              path: `${kind}:${sql.slice(0, 120).replace(/\s+/g, ' ')}`,
              status: 200,
              durationMs: Math.round(elapsed),
              slow: true,
            }) + '\n'
          );
        }
        return result;
      });

    return {
      get: timed(stmt.get.bind(stmt), 'get'),
      all: timed(stmt.all.bind(stmt), 'all'),
      run: timed(stmt.run.bind(stmt), 'run'),
    } as typeof stmt;
  }) as DatabaseSync['prepare'];
}
