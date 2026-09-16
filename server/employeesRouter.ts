/**
 * 员工管理 CRUD API — 数据存储于 SQLite（server/db.ts）。
 * 返回结构与前端 src/services/userApi.ts 约定一致：直接返回实体或数组。
 */
import { Router, json, raw } from "express";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "./db.ts";
import { validateBody, employeeCreateSchema, employeeUpdateSchema } from "./validation.ts";
import { serverErrorResponse } from "./errorHandler.ts";
import { listRenewals, renewContract } from "./contractRenewalsDb.ts";
import { previewImport, commitImport, buildTemplate } from "./employeeImportDb.ts";

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

// ---- 批量导入（P1）：注意注册在 /:id 之前，避免 "import" 被当作员工 id ----

// GET /api/users/import/template — 下载导入模板（xlsx）
employeesRouter.get("/import/template", async (_req, res) => {
  try {
    const buffer = await buildTemplate();
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent("员工导入模板.xlsx")
    );
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// POST /api/users/import — 上传 xlsx（binary body）→ 解析 + 校验 + 预览
employeesRouter.post("/import", raw({ type: "*/*", limit: "10mb" }), async (req, res) => {
  try {
    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: "未接收到文件内容" });
    }
    const preview = await previewImport(buffer);
    res.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: `解析失败：${message}` });
  }
});

// POST /api/users/import/commit — 确认导入（服务端二次校验后落库）
employeesRouter.post("/import/commit", (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows 不能为空" });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: "单次最多导入 500 行" });
    }
    const result = commitImport(rows);
    res.status(201).json(result);
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

// POST /api/users/:id/renew-contract — 合同续签（HR+ 写策略）
employeesRouter.post("/:id/renew-contract", (req, res) => {
  try {
    const user = getEmployee(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { contractYears, contractSignDate, contractExpiry } = req.body || {};
    if (!contractYears || Number(contractYears) < 1 || Number(contractYears) > 30) {
      return res.status(400).json({ error: "合同年限应为 1-30 年" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(contractSignDate || ""))) {
      return res.status(400).json({ error: "签订日期格式应为 YYYY-MM-DD" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(contractExpiry || ""))) {
      return res.status(400).json({ error: "到期日期格式应为 YYYY-MM-DD" });
    }
    if (String(contractExpiry) <= String(contractSignDate)) {
      return res.status(400).json({ error: "到期日期应晚于签订日期" });
    }

    const renewal = renewContract(user, {
      contractYears: Number(contractYears),
      contractSignDate: String(contractSignDate),
      contractExpiry: String(contractExpiry),
    }, req.auth?.username ?? "");
    res.status(201).json(renewal);
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// GET /api/users/:id/contract-renewals — 续签历史
employeesRouter.get("/:id/contract-renewals", (req, res) => {
  const user = getEmployee(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(listRenewals(req.params.id));
});

// DELETE /api/users/:id — 删除员工
employeesRouter.delete("/:id", (req, res) => {
  const ok = deleteEmployee(req.params.id);
  if (!ok) return res.status(404).json({ error: "User not found" });
  res.json({ success: true });
});
