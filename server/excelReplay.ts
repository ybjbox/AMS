import type ExcelJS from "exceljs";
import type { SandboxOp } from "./scriptSandbox.ts";

/**
 * 把沙箱录制下来的操作序列回放到真实的 ExcelJS worksheet 上。
 *
 * 沙箱返回的全部是纯 JSON，这里再做一次白名单收口：
 * - 只认识固定的 op 类型，未知 op 直接忽略
 * - 只允许设置白名单内的行/列/单元格属性
 * - 行号列号一律钳制到 Excel 合法范围，防止构造超大区域打爆内存
 * - 单条 op 执行失败不影响整体导出（与原先脚本抛错即回退的行为保持一致的健壮性）
 */

const CELL_PROPS = new Set([
  "value",
  "font",
  "fill",
  "alignment",
  "border",
  "numFmt",
  "style",
  "note",
]);

const ROW_PROPS = new Set([
  "height",
  "font",
  "fill",
  "alignment",
  "border",
  "hidden",
  "outlineLevel",
]);

const COLUMN_PROPS = new Set([
  "width",
  "hidden",
  "outlineLevel",
  "numFmt",
  "font",
  "alignment",
  "style",
]);

const COLUMN_DEF_KEYS = new Set([
  "header",
  "key",
  "width",
  "hidden",
  "outlineLevel",
  "style",
  "numFmt",
  "font",
  "alignment",
]);

const MAX_ROW = 1048576;
const MAX_COL = 16384;
const MAX_COLUMN_DEFS = 1024;
const A1_RANGE = /^[A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6}$/;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function sanitizeColumns(raw: unknown): Partial<ExcelJS.Column>[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_COLUMN_DEFS).map((col) => {
    const out: Record<string, unknown> = {};
    if (col && typeof col === "object") {
      for (const [k, v] of Object.entries(col as Record<string, unknown>)) {
        if (!COLUMN_DEF_KEYS.has(k)) continue;
        if (k === "width") {
          out[k] = clampInt(v, 1, 255, 15);
        } else {
          out[k] = v;
        }
      }
    }
    return out as Partial<ExcelJS.Column>;
  });
}

/** getCell 的 key 允许是列序号或列名字符串 */
function sanitizeCellKey(raw: unknown): number | string {
  if (typeof raw === "number") return clampInt(raw, 1, MAX_COL, 1);
  const s = String(raw ?? "");
  if (/^\d+$/.test(s)) return clampInt(s, 1, MAX_COL, 1);
  return s.slice(0, 64);
}

export interface ReplayStats {
  applied: number;
  skipped: number;
}

export function applyTemplateOps(
  worksheet: ExcelJS.Worksheet,
  ops: SandboxOp[]
): ReplayStats {
  const rows = new Map<string, ExcelJS.Row>();
  const cells = new Map<string, ExcelJS.Cell>();
  let applied = 0;
  let skipped = 0;

  for (const op of ops) {
    if (!op || typeof op !== "object" || typeof op.op !== "string") {
      skipped++;
      continue;
    }
    try {
      switch (op.op) {
        case "setColumns": {
          worksheet.columns = sanitizeColumns(op.columns) as ExcelJS.Column[];
          break;
        }
        case "addRow": {
          const row = worksheet.addRow(op.value as any);
          if (typeof op.rowId === "string") rows.set(op.rowId, row);
          break;
        }
        case "insertRow": {
          const pos = clampInt(op.pos, 1, MAX_ROW, 1);
          const row = worksheet.insertRow(pos, op.value as any);
          if (typeof op.rowId === "string") rows.set(op.rowId, row);
          break;
        }
        case "getRow": {
          const num = clampInt(op.number, 1, MAX_ROW, 1);
          const row = worksheet.getRow(num);
          if (typeof op.rowId === "string") rows.set(op.rowId, row);
          break;
        }
        case "getCell": {
          const row = rows.get(String(op.rowId));
          if (!row) {
            skipped++;
            continue;
          }
          const cell = row.getCell(sanitizeCellKey(op.key) as any);
          if (typeof op.cellId === "string") cells.set(op.cellId, cell);
          break;
        }
        case "setRowProp": {
          if (!ROW_PROPS.has(String(op.prop))) {
            skipped++;
            continue;
          }
          const row = rows.get(String(op.rowId));
          if (!row) {
            skipped++;
            continue;
          }
          const value =
            op.prop === "height" ? clampInt(op.value, 1, 409, 15) : op.value;
          (row as any)[op.prop] = value;
          break;
        }
        case "setCellProp": {
          if (!CELL_PROPS.has(String(op.prop))) {
            skipped++;
            continue;
          }
          const cell = cells.get(String(op.cellId));
          if (!cell) {
            skipped++;
            continue;
          }
          (cell as any)[op.prop] = op.value;
          break;
        }
        case "setColumnProp": {
          if (!COLUMN_PROPS.has(String(op.prop))) {
            skipped++;
            continue;
          }
          const column = worksheet.getColumn(sanitizeCellKey(op.key) as any);
          const value = op.prop === "width" ? clampInt(op.value, 1, 255, 15) : op.value;
          (column as any)[op.prop] = value;
          break;
        }
        case "mergeCells": {
          const args = Array.isArray(op.args) ? op.args : [];
          if (args.length === 1 && typeof args[0] === "string") {
            const range = args[0].toUpperCase();
            if (!A1_RANGE.test(range)) {
              skipped++;
              continue;
            }
            worksheet.mergeCells(range);
          } else if (args.length === 4) {
            worksheet.mergeCells(
              clampInt(args[0], 1, MAX_ROW, 1),
              clampInt(args[1], 1, MAX_COL, 1),
              clampInt(args[2], 1, MAX_ROW, 1),
              clampInt(args[3], 1, MAX_COL, 1)
            );
          } else {
            skipped++;
            continue;
          }
          break;
        }
        default: {
          skipped++;
          continue;
        }
      }
      applied++;
    } catch {
      // 单条操作失败（例如重复合并单元格）不应中断整个导出
      skipped++;
    }
  }

  return { applied, skipped };
}
