/**
 * 员工管理 CRUD API — 数据存储于 SQLite（server/db.ts）。
 * 返回结构与前端 src/services/userApi.ts 约定一致：直接返回实体或数组。
 */
import { Router, json } from "express";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "./db.ts";
import { validateBody, employeeCreateSchema, employeeUpdateSchema } from "./validation.ts";
import { serverErrorResponse } from "./errorHandler.ts";

export const employeesRouter = Router();
employeesRouter.use(json());

// GET /api/users — 员工列表（支持 ?page&pageSize&keyword 服务端分页）
employeesRouter.get("/", (req, res) => {
  try {
    res.json(listEmployees(req.query));
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// GET /api/users/:id — 员工详情
employeesRouter.get("/:id", (req, res) => {
  const user = getEmployee(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// POST /api/users — 新增员工（zod 校验 name 必填与字段类型）
employeesRouter.post("/", validateBody(employeeCreateSchema), (req, res) => {
  try {
    res.status(201).json(createEmployee(req.body));
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// PUT /api/users/:id — 更新员工（全字段可选）
employeesRouter.put("/:id", validateBody(employeeUpdateSchema), (req, res) => {
  try {
    if (!getEmployee(req.params.id)) return res.status(404).json({ error: "User not found" });
    res.json(updateEmployee(req.params.id, req.body || {}));
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// DELETE /api/users/:id — 删除员工
employeesRouter.delete("/:id", (req, res) => {
  const ok = deleteEmployee(req.params.id);
  if (!ok) return res.status(404).json({ error: "User not found" });
  res.json({ success: true });
});
