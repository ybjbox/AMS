/**
 * 列表分页通用工具（P2-3 修复）。
 *
 * 设计：列表接口在「传入 page/pageSize」时返回分页信封
 * `{ items, total, page, pageSize, totalPages }`；未传分页参数时
 * 返回与旧版一致的完整数组，保证既有前端调用（全局员工 store、文档打印等）
 * 向后兼容、不破坏。
 */

export const MAX_PAGE_SIZE = 200; // 单次最多返回 200 行，防一次性拖垮内存
export const DEFAULT_PAGE_SIZE = 50;

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
  /** 调用方是否真正请求了分页（page 与 pageSize 均为 >=1 的数字） */
  requested: boolean;
}

/** 从任意 query 对象（Express req.query 为字符串）解析分页参数 */
export function resolvePaging(query: Record<string, unknown> | null | undefined): Paging {
  const q = query || {};
  const rawPage = Number(q.page);
  const rawSize = Number(q.pageSize);
  const requested =
    Number.isFinite(rawPage) && rawPage >= 1 && Number.isFinite(rawSize) && rawSize >= 1;

  const pageSize = requested ? Math.min(Math.max(Math.floor(rawSize), 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const page = requested ? Math.max(Math.floor(rawPage), 1) : 1;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    requested,
  };
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function toListResult<T>(items: T[], total: number, p: Paging): ListResult<T> {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
