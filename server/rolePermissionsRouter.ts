/**
 * 角色能力矩阵的设置接口（仅 SUPER_ADMIN）。
 *
 * 编辑本身不能被矩阵关掉：这条策略在 authMiddleware 里是安全硬编码。
 * 保存时做 floor / 依赖校验；变更写审计，接口权限立即生效，侧栏在重新登录后刷新。
 */
import { Router, json, type Request } from "express";
import { clientIp, requireRole } from "./authMiddleware.ts";
import { writeAuditLog } from "./auditDb.ts";
import {
  getThresholds,
  matrixForUI,
  PermissionMatrixError,
  resetThresholds,
  saveThresholds,
} from "./rolePermissions.ts";
import type { ThresholdMap } from "./rolePermissions.ts";

export const rolePermissionsRouter = Router();

rolePermissionsRouter.use(requireRole("SUPER_ADMIN"));
// 项目没有全局 express.json()：本 Router 自己解析小体量 JSON
rolePermissionsRouter.use(json({ limit: "32kb" }));

rolePermissionsRouter.get("/", (_req, res) => {
  res.json(matrixForUI());
});

function diffThresholds(before: ThresholdMap, after: ThresholdMap): Record<string, string> {
  const diff: Record<string, string> = {};
  for (const code of Object.keys(after)) {
    if (before[code] !== after[code]) diff[code] = `${before[code] ?? "—"} → ${after[code]}`;
  }
  return diff;
}

function audit(req: Request, action: string, detail: unknown) {
  writeAuditLog({
    actor: req.auth?.username ?? "unknown",
    action,
    category: "安全",
    level: "WARN",
    status: 200,
    ip: clientIp(req),
    detail: JSON.stringify(detail).slice(0, 2000),
  });
}

rolePermissionsRouter.put("/", (req, res) => {
  try {
    const before = getThresholds();
    const thresholds = saveThresholds(req.body?.thresholds);
    audit(req, "settings.role_permissions.update", diffThresholds(before, thresholds));
    res.json({ thresholds, matrix: matrixForUI() });
  } catch (e) {
    if (e instanceof PermissionMatrixError) {
      return res.status(400).json({ error: e.message, issues: e.issues });
    }
    throw e;
  }
});

rolePermissionsRouter.post("/reset", (req, res) => {
  const before = getThresholds();
  const thresholds = resetThresholds();
  audit(req, "settings.role_permissions.reset", diffThresholds(before, thresholds));
  res.json({ thresholds, matrix: matrixForUI() });
});
