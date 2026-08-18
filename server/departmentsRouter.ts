/**
 * 组织架构 API（/api/departments/*）：
 *   GET /            — { departments: 树, roles: 列表 }
 *   PUT /tree        — 整树替换部门
 *   PUT /roles       — 整体替换职位
 */
import { Router, json } from "express";
import { listDepartmentsTree, replaceDepartmentsTree, listRoles, replaceRoles } from "./departmentsDb.ts";

export const departmentsRouter = Router();
departmentsRouter.use(json({ limit: "5mb" }));

departmentsRouter.get("/", (_req, res) => {
  res.json({ departments: listDepartmentsTree(), roles: listRoles() });
});

departmentsRouter.put("/tree", (req, res) => {
  const { departments } = req.body || {};
  if (!Array.isArray(departments)) return res.status(400).json({ error: "departments array is required" });
  res.json(replaceDepartmentsTree(departments));
});

departmentsRouter.put("/roles", (req, res) => {
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) return res.status(400).json({ error: "roles array is required" });
  res.json(replaceRoles(roles));
});
