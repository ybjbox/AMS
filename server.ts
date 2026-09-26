import "./server/env.ts";
import crypto from "node:crypto";
import express from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { EXCEL_THEMES } from "./server/themes.ts";
import { runMigrations } from "./server/migrate.ts";
import { db, optimizeDb } from "./server/db.ts";
import { accessLog, installProcessGuards } from "./server/accessLog.ts";
import { authGate, pruneSecurityEvents } from "./server/authMiddleware.ts";
import { probeHealth } from "./server/health.ts";
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
import { otherInstances, startInstanceHeartbeat, stopInstanceHeartbeat } from "./server/instanceLock.ts";
import { remindersRouter } from "./server/remindersRouter.ts";
import { startReminderScheduler } from "./server/remindersDb.ts";
import { wecomRouter } from "./server/wecomRouter.ts";
import { startWeComSyncScheduler } from "./server/wecomSync.ts";
import { startImportJobSweeper } from "./server/importJobsDb.ts";
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
import { businessFormRouter } from "./server/businessFormRouter.ts";
import { savedItemsRouter } from "./server/savedItemsRouter.ts";
import { brandingRouter } from "./server/brandingRouter.ts";
import { validateBody, exportEmployeesSchema } from "./server/validation.ts";

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
    // - script-src：**生产模式下用一次性 nonce，不再放行 'unsafe-inline'**（批次 5）。
    //   'unsafe-inline' 与 nonce 同时存在时浏览器会忽略 unsafe-inline，所以"注入任意脚本"
    //   从"能跑"变成"必须有 nonce"。整份 index.html 里只有一个内联 <script>（主题启动脚本，
    //   首屏前上色），由下面的 sendSpa 逐个补 nonce；开发模式仍放行内联（Vite HMR 需要）。
    const isDev = process.env.NODE_ENV !== "production";
    const cspNonce = crypto.randomBytes(12).toString("base64");
    (res as import("express").Response & { locals: Record<string, unknown> }).locals.cspNonce = cspNonce;
    const connectSrc = isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${cspNonce}'`;
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        scriptSrc,
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

  // 反向代理后面才需要设 TRUST_PROXY（跳数，或 true=信任所有）。不设时 Express 一律不读
  // X-Forwarded-For，clientIp() 因此永远拿到 socket 地址 —— 按旧文档配了 Nginx 之后，
  // 审计日志与登录暴破限流看到的会全是代理那一个 IP。
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy && trustProxy !== "false") {
    app.set("trust proxy", trustProxy === "true" ? true : Number(trustProxy) || 1);
  }

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
  app.use("/api/form", businessFormRouter);
  app.use("/api/saved-items", savedItemsRouter);
  app.use("/api/branding", brandingRouter);
  app.use("/api/reminders", remindersRouter);
  app.use("/api/wecom", wecomRouter);
  app.use("/api/system", systemRouter);
  app.use("/api/announcements", announcementsRouter);
  app.use("/api/stats", statsRouter);
  // ===== 接线结束 =====

  // API routes
  app.get("/api/health", (req, res) => {
    // 状态码本身要能反映"还能不能服务"：库打不开时返回 503，容器探活才会真的失败。
    // 判定与响应体收敛在 server/health.ts，理由见那个文件的头注释。
    const { code, body } = probeHealth(APP_VERSION);
    res.status(code).json(body);
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

  app.post("/api/export/employees", express.json(), validateBody(exportEmployeesSchema), async (req, res) => {
    try {
      const { data, config } = req.body;
      const { title, columns, includeResigned, themeId = 'default', mode = 'theme', templateName } = config;

      // 业务逻辑：过滤离职人员
      let exportData = data;
      if (!includeResigned) {
        exportData = data.filter((item: { status?: string }) => item.status !== "离职" && item.status !== "inactive");
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
        } catch (scriptError) {
          console.error("Script template error:", scriptError);
          worksheet.addRow(["脚本执行失败: " + (scriptError instanceof Error ? scriptError.message : String(scriptError))]);
        }
      } else {
        // 使用传统主题模式
        const theme = dynamicThemes[themeId] ?? dynamicThemes.default;
        const argb = (key: string) => String(theme[key] ?? "");

        // 动态定义列
        worksheet.columns = columns.map((col: { header: string; key: string }) => ({
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
          fgColor: { argb: argb("titleFill") },
        };

        // 设置表头样式 (现在是第2行)
        const headerRow = worksheet.getRow(2);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: argb("headerFontColor") } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: argb("headerFill") },
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
                  fgColor: { argb: argb("zebraFill") },
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
    // 懒加载：vite 是构建期依赖（devDependencies）。顶层静态 import 会让"生产运行时"也必须有它，
    // 于是 Docker 的 runner 阶段只能连开发依赖一起装（见 Dockerfile）。
    const { createServer: createViteServer } = await import("vite");
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
    // index:false —— index.html 只由下面的 sendSpa 出（它要往里补 CSP nonce）；
    // 否则直接命中 /index.html 的那条响应没有 nonce，内联的主题脚本会被 CSP 挡掉。
    const sendSpa = (req: express.Request, res: express.Response) => {
      const indexPath = path.join(distPath, "index.html");
      let html: string;
      try {
        html = fs.readFileSync(indexPath, "utf8");
      } catch (e) {
        res.status(500).json({ error: "前端产物不可用（先 npm run build）" });
        console.error("[static] 读取 index.html 失败：", e);
        return;
      }
      const nonce = String(res.locals.cspNonce ?? "");
      res.type("html").setHeader("Cache-Control", "no-cache");
      // 前瞻 (?=[\s>]) 而不是 (\s)：主题启动脚本写成 `<script>` 紧跟换行，
      // 只匹配 `<script ` 会漏掉它 —— 而漏掉的后果不是报错，是这段脚本被 CSP 静默拦掉、
      // 主题退回默认值，页面照样起得来，所以 e2e 全绿也发现不了（实测踩过）。
      res.send(nonce ? html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`) : html);
    };
    app.get(["/", "/index.html"], sendSpa);
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(res, filePath) {
          if (/[/\\]assets[/\\]/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (!filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', sendSpa);
  }

  // 统一错误兜底（AUDIT P3-1）：必须注册在所有路由/中间件之后，
  // 任何未被捕获的同步抛错都会收敛成 JSON，不再吐 HTML 错误页。
  app.use(errorHandler);

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  installProcessGuards();
    // 数据目录互斥登记：不禁止多实例（:3000 开发与 :3001 验证共用是常态），
    // 但必须让"恢复备份会让另一台实例的写入静默丢失"这件事在日志里看得见。
    startInstanceHeartbeat(PORT, HOST);
    const others = otherInstances();
    if (others.length > 0) {
      console.warn(
        `[instance] 同一个数据目录上还有 ${others.length} 个实例在跑（端口 ${others
          .map((o) => o.port)
          .join("、")}）。恢复备份会被这些实例拒 409：请先停掉它们，否则它们的写入会落到已被替换的旧库文件上。`
      );
    }
    if (HOST === "0.0.0.0") {
      console.warn(
        "[security] HOST=0.0.0.0：服务正暴露给所有网络接口，请确认这是受信任的部署环境"
      );
    }
  });

  // 常驻后台任务：定时备份（BACKUP_ENABLED=false 可关）、到期提醒扫描
  //（REMINDER_SCAN_ENABLED=false 可关，默认每 6 小时一轮）、审计保留期清理、上传孤儿扫描
  //（默认关闭，设 UPLOADS_ORPHAN_SCAN_MS 开启）。均自带错误吞噬，不会拖垮服务。
  startBackupScheduler();
  startReminderScheduler();
  // 企业微信打卡同步：默认关（配置页开关 + WECOM_SYNC_ENABLED=false 总闸），
  // 因为可信 IP 是硬门槛——没配好之前一次接口都不该发。
  startWeComSyncScheduler();
  // 导入/同步任务台账对账：上一代进程留下的 running 行必须判中断，否则前端会一直轮询；
  // 顺带按保留期清理终态行（这张表只增不删的话，定时同步每天都要留几条）。
  startImportJobSweeper();
  // 保留期清理：审计日志 + 安全事件。
  // 原来 pruneAuditLogs() 只在启动时跑一次 —— 长期不重启的容器里"180 天保留"形同虚设，
  // 而 security_events 压根没有删除路径（每个失效 token 的请求都要留一行）。
  const sweepRetention = () => {
    try {
      pruneAuditLogs();
      pruneSecurityEvents();
    } catch (e) {
      console.warn("[retention] 保留期清理失败：", e);
    }
  };
  sweepRetention();
  const retentionTimer = setInterval(sweepRetention, 24 * 60 * 60 * 1000);
  if (typeof retentionTimer.unref === "function") retentionTimer.unref();
  startOrphanUploadScan();

  // PRAGMA optimize（sqlite-best-practices）：定期更新查询规划器统计。
  // 轻量（无变更时 no-op），每小时一次足够；退出时再跑一次收尾。
  const optimizeTimer = setInterval(optimizeDb, 60 * 60 * 1000);
  if (typeof optimizeTimer.unref === "function") optimizeTimer.unref();
  const shutdown = () => {
    stopInstanceHeartbeat();
    try {
      // 退出前把 WAL 落回主库：docker stop 只有 10 秒窗口，留着几 MB WAL 意味着
      // 下一次启动要先重放，而备份走的是 VACUUM INTO（只读主库）——不该把已提交数据留在外面
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* 库已经不可用时不该挡住退出 */
    }
    optimizeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
