/**
 * 审计日志查询 API（/api/audit-logs），仅 ADMIN 及以上可访问（策略见 authMiddleware）。
 *
 * 刻意**不提供**任何删除 / 清空端点：审计表必须只增不改不删，
 * 唯一的收缩手段是 auditDb.pruneAuditLogs 的保留期清理，由服务启动时自动执行。
 * 前端「清空日志」按钮也一并去掉了，改为导出 CSV。
 */
import { Router } from "express";
import { serverErrorResponse } from "./errorHandler.ts";
import { localToday } from "./localDate.ts";
import {
  auditFacets,
  auditLogCount,
  exportAuditLogs,
  queryAuditLogs,
  type AuditQuery,
} from "./auditDb.ts";
import { requireRole } from "./authMiddleware.ts";

export const auditRouter = Router();
auditRouter.use(requireRole("ADMIN"));

function pickQuery(raw: Record<string, unknown>): AuditQuery {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    q: str(raw.q),
    level: str(raw.level),
    category: str(raw.category),
    actor: str(raw.actor),
    action: str(raw.action),
    result: str(raw.result),
    from: str(raw.from),
    to: str(raw.to),
    limit: Number(raw.limit) || 50,
    offset: Number(raw.offset) || 0,
  };
}

// GET /api/audit-logs — 分页 + 过滤查询
auditRouter.get("/", (req, res) => {
  try {
    const query = pickQuery(req.query as Record<string, unknown>);
    const { total, items, levels } = queryAuditLogs(query);
    res.json({
      total,
      items,
      levels,
      limit: query.limit,
      offset: query.offset,
      retentionDays: Number(process.env.AUDIT_RETENTION_DAYS) || 180,
    });
  } catch (e) {
    serverErrorResponse(res, e, "查询审计日志失败");
  }
});

// GET /api/audit-logs/facets — 过滤下拉框可选值
auditRouter.get("/facets", (_req, res) => {
  try {
    res.json({ ...auditFacets(), total: auditLogCount() });
  } catch (e) {
    serverErrorResponse(res, e, "读取过滤项失败");
  }
});

// GET /api/audit-logs/export — 导出 CSV（同样受 ADMIN 限制，且该导出动作本身会被审计）
auditRouter.get("/export", (req, res) => {
  try {
    const rows = exportAuditLogs(pickQuery(req.query as Record<string, unknown>));
    const header = [
      "时间", "等级", "分类", "操作", "操作人", "角色",
      "对象类型", "对象ID", "对象名称", "结果", "状态码", "IP", "变更字段", "详情", "耗时ms",
    ];
    // 公式注入防御：以 = + - @ 开头的单元格内容前置单引号，Excel 按文本处理
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [header.map(esc).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.at, r.level, r.category, r.action, r.actor, r.actorRole,
          r.targetType, r.targetId, r.targetName, r.result, r.status, r.ip,
          Array.isArray(r.changes) ? r.changes.join(" ") : "",
          r.detail, r.durationMs,
        ].map(esc).join(",")
      );
    }
    // BOM：让 Excel 直接双击打开不乱码
    const csv = `\uFEFF${lines.join("\r\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${encodeURIComponent(`审计日志-${localToday()}.csv`)}`
    );
    res.send(csv);
  } catch (e) {
    serverErrorResponse(res, e, "导出失败");
  }
});

// 明确拒绝一切删除意图，并给出原因（而不是落到 404 让人以为是路由写错了）
auditRouter.delete("*", (_req, res) => {
  res.status(405).json({
    error: "审计日志不可删除。如需收缩体积，请调整 AUDIT_RETENTION_DAYS 保留期由系统自动清理。",
    code: "AUDIT_APPEND_ONLY",
  });
});
