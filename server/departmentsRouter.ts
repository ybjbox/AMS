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
import { validateBody, departmentsTreeSchema, rolesBulkSchema } from "./validation.ts";

export const departmentsRouter = Router();
departmentsRouter.use(json({ limit: "5mb" }));

departmentsRouter.get("/", (_req, res) => {
  res.json({ departments: listDepartmentsTree(), roles: listRoles() });
});

/**
 * 入参不合法回 400（带中文原因），其余错误继续抛给全局错误处理。
 *
 * 注意「其余错误继续抛」的边界：部门树里的节点缺 name、职位的 departmentId 指向不存在的部门，
 * 原先都会在数据层里变成 TypeError / FOREIGN KEY constraint failed → 500（用户只看到"保存失败"，
 * 不知道自己哪一行填错）。这些是"用户能改对"的问题，现在由 validateBody 在入口就挡成 400。
 */
function writeError(res: import("express").Response, error: unknown): void {
  if (error instanceof DeptDataError) {
    res.status(400).json({ error: error.message });
    return;
  }
  throw error;
}

departmentsRouter.put("/tree", validateBody(departmentsTreeSchema), (req, res) => {
  const { departments } = req.body || {};
  if (!Array.isArray(departments)) return res.status(400).json({ error: "departments array is required" });
  try {
    res.json(replaceDepartmentsTree(departments));
  } catch (error) {
    writeError(res, error);
  }
});

departmentsRouter.put("/roles", validateBody(rolesBulkSchema), (req, res) => {
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) return res.status(400).json({ error: "roles array is required" });
  try {
    res.json(replaceRoles(roles));
  } catch (error) {
    writeError(res, error);
  }
});
