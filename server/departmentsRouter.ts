/**
 * 组织架构 API（/api/departments/*）：
 *   GET /            — { departments: 树, roles: 列表 }
 *   PUT /tree        — 整树替换部门
 *   PUT /roles       — 整体替换职位
 */
import { Router, json } from "express";
import {
  DeptDataError,
  listDepartmentsTree,
  replaceDepartmentsTree,
  listRoles,
  replaceRoles,
} from "./departmentsDb.ts";

export const departmentsRouter = Router();
departmentsRouter.use(json({ limit: "5mb" }));

departmentsRouter.get("/", (_req, res) => {
  res.json({ departments: listDepartmentsTree(), roles: listRoles() });
});

/** 入参不合法回 400（带中文原因），其余错误继续抛给全局错误处理 */
function writeError(res: import("express").Response, error: unknown): void {
  if (error instanceof DeptDataError) {
    res.status(400).json({ error: error.message });
    return;
  }
  throw error;
}

departmentsRouter.put("/tree", (req, res) => {
  const { departments } = req.body || {};
  if (!Array.isArray(departments)) return res.status(400).json({ error: "departments array is required" });
  try {
    res.json(replaceDepartmentsTree(departments));
  } catch (error) {
    writeError(res, error);
  }
});

departmentsRouter.put("/roles", (req, res) => {
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) return res.status(400).json({ error: "roles array is required" });
  try {
    res.json(replaceRoles(roles));
  } catch (error) {
    writeError(res, error);
  }
});
