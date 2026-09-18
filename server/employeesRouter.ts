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
import { previewImport, buildTemplate, MAX_IMPORT_ROWS } from "./employeeImportDb.ts";
import { createImportJob, getImportJob, runImportJob } from "./importJobsDb.ts";
import { ROLE_LEVEL, type SessionContext } from "./authDb.ts";

export const employeesRouter = Router();
employeesRouter.use(json());

// ---------------------------------------------------------------- PII 读侧裁剪（第二梯队 #12）
//
// authGate 的默认读策略是「登录即可读」，但员工表挂着身份证、住址、手机号——
// 任何账号 GET /api/users 就能拖走全员 PII。这里在服务端按角色裁剪：
//   HR 及以上 → 全量；其余 → 身份证/住址清空、手机号掩码（自己的记录例外）。
// 写侧本就被默认策略限制在 HR+，所以编辑闭环（HR 读全量 → 改 → 回写）不受影响。

type EmployeeView = NonNullable<ReturnType<typeof getEmployee>>;

// 导出供回归测试断言（路由内消费方就在本文件）
export function canViewPii(auth: SessionContext | undefined, targetId?: string): boolean {
  if (!auth) return false;
  // 本人豁免：员工看自己的档案需要完整身份证（入职证明、合同等场景）
  if (targetId && auth.employeeId && auth.employeeId === targetId) return true;
  return ROLE_LEVEL[auth.systemRole] >= ROLE_LEVEL.HR;
}

function maskPhone(phone: string): string {
  if (phone.length >= 7) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return phone ? "****" : "";
}

export function redactPii(u: EmployeeView): EmployeeView {
  return {
    ...u,
    idCard: "",
    registeredAddress: "",
    currentAddress: "",
    phone: maskPhone(String(u.phone ?? "")),
  };
}

/** GET /api/users — 员工列表（支持 ?page&pageSize&keyword 服务端分页） */
employeesRouter.get("/", (req, res) => {
  try {
    const result = listEmployees(req.query);
    if (canViewPii(req.auth)) return res.json(result);
    res.json(
      Array.isArray(result)
        ? result.map((u) => u && redactPii(u))
        : { ...result, items: result.items.map((u) => u && redactPii(u)) }
    );
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

// POST /api/users/import/commit — 确认导入：立即返回 jobId，后台分块落库（#16 异步化）
employeesRouter.post("/import/commit", (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows 不能为空" });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `单次最多导入 ${MAX_IMPORT_ROWS} 行` });
    }
    const jobId = createImportJob(req.auth!.username, rows.length);
    // fire-and-forget：runImportJob 内部收敛所有异常并写进 job 状态
    void runImportJob(jobId, rows);
    res.status(202).json({ jobId });
  } catch (error) {
    serverErrorResponse(res, error);
  }
});

// GET /api/users/import/jobs/:id — 轮询导入任务进度（仅任务创建者或 ADMIN+）
employeesRouter.get("/import/jobs/:id", (req, res) => {
  const job = getImportJob(req.params.id);
  if (!job) return res.status(404).json({ error: "导入任务不存在" });
  if (job.username !== req.auth!.username && ROLE_LEVEL[req.auth!.systemRole] < ROLE_LEVEL.ADMIN) {
    return res.status(403).json({ error: "无权查看该导入任务" });
  }
  res.json(job);
});

// GET /api/users/:id — 员工详情（PII 同样按角色裁剪）
employeesRouter.get("/:id", (req, res) => {
  const user = getEmployee(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(canViewPii(req.auth, req.params.id) ? user : redactPii(user));
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

// GET /api/users/:id/contract-renewals — 续签历史（本人或 HR+；合同信息属 PII 口径）
employeesRouter.get("/:id/contract-renewals", (req, res) => {
  const user = getEmployee(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!canViewPii(req.auth, req.params.id)) {
    return res.status(403).json({ error: "无权查看该员工的合同信息" });
  }
  res.json(listRenewals(req.params.id));
});

// DELETE /api/users/:id — 删除员工
employeesRouter.delete("/:id", (req, res) => {
  const ok = deleteEmployee(req.params.id);
  if (!ok) return res.status(404).json({ error: "User not found" });
  res.json({ success: true });
});
