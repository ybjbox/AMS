/**
 * 「整库被换掉」之后的界面重载。
 *
 * 为什么恢复备份必须重载：换掉的是整个 SQLite 文件，而除备份列表外的每个 store 都还揣着
 * 恢复前的内存态（员工/部门/合同/文档的 fetchData 首次成功后就被 initialized 短路，
 * 2026-09-26 审查 B4）。不重载就会出现「toast 说已恢复、界面仍是旧数据」，
 * 用户据此再点一次保存，就把恢复前的状态写回了刚回滚好的库 —— 从显示不一致升级成真实回退。
 *
 * 单列成模块（而不是在面板里直接 window.location.reload()）是为了能被单测断言"确实安排了重载"。
 */

/** 留一点时间让成功 toast 被看见，再重载 */
export const RELOAD_AFTER_RESTORE_MS = 1500;

export function scheduleAppReload(delayMs: number = RELOAD_AFTER_RESTORE_MS): number {
  return window.setTimeout(() => window.location.reload(), delayMs);
}
