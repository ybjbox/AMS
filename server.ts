import "./server/env.ts";
import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { EXCEL_THEMES } from "./server/themes.ts";
import { runMigrations } from "./server/migrate.ts";
import { db, optimizeDb } from "./server/db.ts";
import { accessLog, installProcessGuards } from "./server/accessLog.ts";
import { authGate } from "./server/authMiddleware.ts";
import { auditGate } from "./server/auditMiddleware.ts";
import { errorHandler } from "./server/errorHandler.ts";
import { getThemes, setThemes } from "./server/settingsDb.ts";
import {
  listTemplates,
  readTemplate,
  writeTemplate,
  deleteTemplate,
  TemplateError,
} from "./server/templateStore.ts";
import { systemRouter } from "./server/systemRouter.ts";
import { announcementsRouter } from "./server/announcementsRouter.ts";
import { statsRouter } from "./server/statsRouter.ts";
import { runTemplateSandbox } from "./server/scriptSandbox.ts";
import { applyTemplateOps } from "./server/excelReplay.ts";
import { startBackupScheduler } from "./server/backupDb.ts";
import { pruneAuditLogs } from "./server/auditDb.ts";
import { startOrphanUploadScan } from "./server/uploadsCleanup.ts";
import { authRouter } from "./server/authRouter.ts";
import { employeesRouter } from "./server/employeesRouter.ts";
import { departmentsRouter } from "./server/departmentsRouter.ts";
import { attendanceRouter } from "./server/attendanceRouter.ts";
import {
  foldersRouter,
  documentsRouter,
  documentSetsRouter,
  filesRouter,
} from "./server/documentsRouter.ts";
import { todosRouter } from "./server/todosRouter.ts";
import { notificationsRouter } from "./server/notificationsRouter.ts";
import { notifyRouter } from "./server/notifyRouter.ts";
import { approvalsRouter } from "./server/approvalsRouter.ts";
import { auditRouter } from "./server/auditRouter.ts";
import { backupRopter } from "./server/backupRopter.ts";
import { aiRouter } from "./server/aiRouter.ts";
import { noticeRouter } from "./server/wechatNoticeRouter.ts";

// In-memory theme storage (initialized with default themes, startup 时从 settings 回填)
let dynamicThemes: Record<string, Record<string, unknown>> = { ...EXCEL_THEMES };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 请求体统一错误收敛：模板相关 TemplateError 自带 status，其余交给 errorHandler 兜底 */
function sendTemplateError(res: express.Response, e: unknown): boolean {
  if (e instanceof TemplateError) {
    res.status(e.status).json({ error: e.message });
    return true;
  }
  return false;
}

/** 应用版本：从 package.json 读取一次（健康检查暴露） */
const APP_VERSION: string = (() => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

async function startServer() {
  const app = express();

  // gzip/br 压缩（无依赖注入，默认配置）：大幅降低 CSS/JS/JSON 的传输体积
  app.use(compression());

  // 安全响应头（OWASP security-headers）：
  // - nosniff：阻止 MIME 嗅探引发的脚本执行
  // - X-Frame-Options: DENY：防点击劫持（内部系统无需被 iframe 嵌套）
  // - Referrer-Policy：限制 referrer 泄露
  // - CSP：同源策略（允许内联样式/脚本以兼容现有构建产物与主题注入）
  //   注意：Vite 开发模式需要 inline script（HMR 客户端），故 CSP 仅在语义上宽松；
  //   若未来需要严格 CSP，可用 nonce 方案逐步收紧。
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    // CSP 说明：
    // - style-src 放行 fonts.googleapis.com：打印字体（仅打印场景）
    // - connect-src 开发模式放行 ws:（Vite HMR）；生产模式收紧为 self
    const isDev = process.env.NODE_ENV !== "production";
    const connectSrc = isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        connectSrc,
        "frame-ancestors 'none'",
      ].join("; ")
    );
    next();
  });
  const PORT = Number(process.env.PORT) || 3000;
  // 安全默认只绑本机回环（AUDIT P0-2）；Docker/局域网部署显式设 HOST=0.0.0.0
  const HOST = process.env.HOST || "127.0.0.1";

  // ===== 全栈后端接线（调试环境搭建时补齐，2026-09-14 安全对齐批次完善）=====
  // 1) 幂等数据库迁移（按 user_version 判重），必须先于业务模块使用数据库执行。
  runMigrations();

  // 2) 主题持久化回填（AUDIT P1-6）：settings 表里有就用管理员的，否则默认主题。
  dynamicThemes = getThemes() ?? { ...EXCEL_THEMES };

  // 3) 鉴权闸门：按设计必须挂在所有 /api 业务路由之前（见 server/authMiddleware.ts 头部）。
  //    公开白名单：GET /api/health、POST /api/auth/login；其余接口默认"登录可读、HR 可写"。
  // 请求日志（可观测性）：记录慢请求与失败响应（JSON 行到 stdout）
  app.use(accessLog());
  app.use("/api", authGate);
  // 4) 审计网关（AUDIT P1-5）：必须紧跟 authGate——req.auth 已就绪，写操作自动留痕。
  app.use("/api", auditGate);

  // 5) 业务路由挂载。employeesRouter 挂在 /api/users——与该 Router 头部注释、
  //    auditMiddleware 的路径映射表、前端 userApi 的调用路径三方一致（作者原始约定）；
  //    folders/documents/document-sets/files 尚无前端调用方，挂载路径为按命名约定推定，可调整。
  app.use("/api/auth", authRouter);
  app.use("/api/users", employeesRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/folders", foldersRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/document-sets", documentSetsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/todos", todosRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/notify", notifyRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/backup", backupRopter);
  app.use("/api/ai", aiRouter);
  app.use("/api/notice", noticeRouter);
  app.use("/api/system", systemRouter);
  app.use("/api/announcements", announcementsRouter);
  app.use("/api/stats", statsRouter);
  // ===== 接线结束 =====

  // API routes
  app.get("/api/health", (req, res) => {
    // 增强健康检查：供负载均衡/监控探针与运维排障使用。
    // 注意：保持轻量（不做重量级查询），且不泄露敏感信息。
    const mem = process.memoryUsage();
    let dbOk = true;
    try {
      db.prepare("SELECT 1").get();
    } catch {
      dbOk = false;
    }
    res.json({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      uptimeSec: Math.round(process.uptime()),
      memMB: Math.round(mem.heapUsed / 1024 / 1024),
      version: APP_VERSION,
    });
  });

  // Theme management APIs（读写穿透 settings 表，重启不丢）
  app.get("/api/themes", (req, res) => {
    res.json(dynamicThemes);
  });

  app.post("/api/themes", express.json(), (req, res) => {
    const { themes } = req.body;
    if (
      !themes ||
      typeof themes !== "object" ||
      Array.isArray(themes) ||
      Object.keys(themes).length === 0
    ) {
      res.status(400).json({ error: "Invalid themes data" });
      return;
    }
    try {
      setThemes(themes); // 失败会抛出（settingsDb 约定：调用方决定 500）
      dynamicThemes = themes;
      res.json({ success: true, themes: dynamicThemes });
    } catch (error) {
      console.error("[themes] 持久化失败：", error);
      res.status(500).json({ error: "Failed to persist themes" });
    }
  });

  // Script Template management APIs——一律走 templateStore 白名单（AUDIT P0-1/P1-1 修复），
  // 禁止旧版的裸 fs.writeFile/unlink（路径穿越写/删任意文件）。
  app.get("/api/export-templates", async (req, res, next) => {
    try {
      res.json(await listTemplates());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/export-templates", express.json(), async (req, res, next) => {
    try {
      const { name, code } = req.body;
      const safeName = await writeTemplate(name, code);
      res.json({ success: true, name: safeName });
    } catch (error) {
      if (!sendTemplateError(res, error)) next(error);
    }
  });

  app.delete("/api/export-templates/:name", async (req, res, next) => {
    try {
      await deleteTemplate(req.params.name);
      res.json({ success: true });
    } catch (error) {
      if (!sendTemplateError(res, error)) next(error);
    }
  });

  app.post("/api/export/employees", express.json(), async (req, res) => {
    try {
      const { data, config } = req.body;
      const { title, columns, includeResigned, themeId = 'default', mode = 'theme', templateName } = config;

      // 业务逻辑：过滤离职人员
      let exportData = data;
      if (!includeResigned) {
        exportData = data.filter((item: any) => item.status !== "离职" && item.status !== "inactive");
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("员工列表");

      if (mode === 'script' && templateName) {
        // 使用脚本模板：模板代码在隔离沙箱中运行（Worker + vm + 资源上限），
        // 只能操作录制器产出纯 JSON 操作指令，再由 excelReplay 白名单回放到真实 worksheet。
        // 任何失败都降级为一行错误信息，不中断导出（与旧版行为一致的健壮性）。
        try {
          const code = await readTemplate(templateName);
          const { ops, logs } = await runTemplateSandbox(code, exportData, config);
          const stats = applyTemplateOps(worksheet, ops);
          if (logs.length) console.log(`[export] 模板日志: ${logs.join(" | ")}`);
          console.log(`[export] 模板回放: 应用 ${stats.applied} 条，跳过 ${stats.skipped} 条`);
        } catch (scriptError: any) {
          console.error("Script template error:", scriptError);
          worksheet.addRow(["脚本执行失败: " + (scriptError?.message ?? String(scriptError))]);
        }
      } else {
        // 使用传统主题模式
        const theme = (dynamicThemes as any)[themeId] || dynamicThemes.default;

        // 动态定义列
        worksheet.columns = columns.map((col: any) => ({
          header: col.header,
          key: col.key,
          width: col.key === "department" || col.key === "role" ? 25 : 15,
        }));

        // 添加大标题行
        worksheet.insertRow(1, [title]);
        worksheet.mergeCells(1, 1, 1, columns.length);
        const titleRow = worksheet.getRow(1);
        titleRow.height = 40;
        titleRow.getCell(1).font = { size: 18, bold: true };
        titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        titleRow.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: theme.titleFill },
        };

        // 设置表头样式 (现在是第2行)
        const headerRow = worksheet.getRow(2);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: theme.headerFontColor } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: theme.headerFill },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });
        headerRow.height = 25;

        // 添加数据 (从第3行开始)
        worksheet.addRows(exportData);

        // 设置单元格边框和对齐
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 2) {
            row.eachCell((cell) => {
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
              cell.alignment = { vertical: "middle", horizontal: "left" };
            });

            // 隔行变色
            if (rowNumber % 2 === 1) {
              row.eachCell((cell) => {
                cell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: theme.zebraFill },
                };
              });
            }
          }
        });
      }

      // 写入 Buffer 并发送
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${encodeURIComponent(title)}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Export failed" });
    }
  });

  // 开发/测试专用：故意抛错的错误路由，验证 errorHandler 的 JSON 500 兜底
  //（scripts/verify-error-handler.ts 依赖；仅在显式设置 AMS_DEV_ERROR_ROUTE=1 时注册）
  if (process.env.AMS_DEV_ERROR_ROUTE === "1") {
    app.get("/api/_dev_error", () => {
      throw new Error("intentional dev error for errorHandler verification");
    });
  }

  // Catch-all for unhandled API routes to prevent Vite from returning index.html
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // robots.txt：SPA fallback 会把未知路径返回 index.html，导致爬虫读到 HTML。
    // 内部系统策略：显式 Disallow（避免员工/合同数据被搜索引擎索引）。
    app.get('/robots.txt', (req, res) => {
      res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    });
    // 静态资源缓存策略：Vite 构建产物带内容哈希（index-XXXX.js），可长缓存 immutable；
    // 根路径落盘的其它静态文件（如未来 public/ 资源）用保守的 1 天缓存。
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          if (/[/\\]assets[/\\]/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (!filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'), {
        headers: { 'Cache-Control': 'no-cache' },
      });
    });
  }

  // 统一错误兜底（AUDIT P3-1）：必须注册在所有路由/中间件之后，
  // 任何未被捕获的同步抛错都会收敛成 JSON，不再吐 HTML 错误页。
  app.use(errorHandler);

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  installProcessGuards();
    if (HOST === "0.0.0.0") {
      console.warn(
        "[security] HOST=0.0.0.0：服务正暴露给所有网络接口，请确认这是受信任的部署环境"
      );
    }
  });

  // 常驻后台任务：定时备份（BACKUP_ENABLED=false 可关）、审计保留期清理、上传孤儿扫描
  //（默认关闭，设 UPLOADS_ORPHAN_SCAN_MS 开启）。均自带错误吞噬，不会拖垮服务。
  startBackupScheduler();
  pruneAuditLogs();
  startOrphanUploadScan();

  // PRAGMA optimize（sqlite-best-practices）：定期更新查询规划器统计。
  // 轻量（无变更时 no-op），每小时一次足够；退出时再跑一次收尾。
  const optimizeTimer = setInterval(optimizeDb, 60 * 60 * 1000);
  if (typeof optimizeTimer.unref === "function") optimizeTimer.unref();
  process.on("SIGINT", () => { optimizeDb(); process.exit(0); });
  process.on("SIGTERM", () => { optimizeDb(); process.exit(0); });
}

startServer();
