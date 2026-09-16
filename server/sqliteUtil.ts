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
