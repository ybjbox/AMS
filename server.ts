import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { EXCEL_THEMES, ThemeId } from "./server/themes.js";
import fs from "fs/promises";
import { pathToFileURL } from "url";

// In-memory theme storage (initialized with default themes)
let dynamicThemes = { ...EXCEL_THEMES };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Theme management APIs
  app.get("/api/themes", (req, res) => {
    res.json(dynamicThemes);
  });

  app.post("/api/themes", express.json(), (req, res) => {
    const { themes } = req.body;
    if (themes) {
      dynamicThemes = themes;
      res.json({ success: true, themes: dynamicThemes });
    } else {
      res.status(400).json({ error: "Invalid themes data" });
    }
  });

  // Script Template management APIs
  const TEMPLATES_DIR = path.join(process.cwd(), "server", "templates");

  app.get("/api/export-templates", async (req, res) => {
    try {
      await fs.mkdir(TEMPLATES_DIR, { recursive: true });
      const files = await fs.readdir(TEMPLATES_DIR);
      const templates = await Promise.all(
        files
          .filter(f => f.endsWith(".js"))
          .map(async f => ({
            name: f.replace(".js", ""),
            code: await fs.readFile(path.join(TEMPLATES_DIR, f), "utf-8")
          }))
      );
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to load templates" });
    }
  });

  app.post("/api/export-templates", express.json(), async (req, res) => {
    try {
      const { name, code } = req.body;
      if (!name || !code) return res.status(400).json({ error: "Name and code required" });
      
      const fileName = name.endsWith(".js") ? name : `${name}.js`;
      await fs.mkdir(TEMPLATES_DIR, { recursive: true });
      await fs.writeFile(path.join(TEMPLATES_DIR, fileName), code);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save template" });
    }
  });

  app.delete("/api/export-templates/:name", async (req, res) => {
    try {
      const fileName = `${req.params.name}.js`;
      await fs.unlink(path.join(TEMPLATES_DIR, fileName));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete template" });
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
        // 使用脚本模板
        try {
          const templatePath = path.join(TEMPLATES_DIR, `${templateName}.js`);
          // 使用 pathToFileURL 解决 Windows 路径问题，并添加时间戳防止缓存
          const moduleUrl = `${pathToFileURL(templatePath).href}?t=${Date.now()}`;
          const { default: applyTemplate } = await import(moduleUrl);
          
          if (typeof applyTemplate === 'function') {
            await applyTemplate(worksheet, exportData, config);
          } else {
            throw new Error("Template does not export a default function");
          }
        } catch (scriptError: any) {
          console.error("Script template error:", scriptError);
          // 如果脚本失败，回退到默认逻辑
          worksheet.addRow(["脚本执行失败: " + scriptError.message]);
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
