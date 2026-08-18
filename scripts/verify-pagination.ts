/**
 * P2-3 回归：三列表接口（员工 / 文档 / 打卡记录）服务端分页 + 服务端筛选。
 *
 * 不启动 HTTP 服务，直接在数据层验证分页数学与向后兼容：
 *  - 传入 page/pageSize 返回 `{ items, total, page, pageSize, totalPages }` 信封；
 *  - 未传分页参数返回与旧版一致的完整数组（向后兼容全局员工 store / 文档打印）；
 *  - 分页数学（items 长度、末页、totalPages）、服务端筛选（keyword / folderId / 日期）。
 *
 * 运行：DATA_DIR 用独立临时目录，避免污染开发库。
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const DATA_DIR = mkdtempSync(path.join(tmpdir(), "ams-pg-"));
  process.env.DATA_DIR = DATA_DIR;
  console.log(`[verify-pagination] DATA_DIR=${DATA_DIR}`);

  const { listEmployees, db } = await import("../server/db.ts");
  const { listDocuments, createDocumentFromUpload } = await import("../server/documentsDb.ts");
  const { listRecords, replaceRecords } = await import("../server/attendanceDb.ts");
  // departments 表由迁移脚本建立（与真实启动 server.ts -> runMigrations 一致），
  // 此处直接调用迁移确保 JOIN 可用。
  const { runMigrations } = await import("../server/migrate.ts");
  runMigrations();

  // ---------- 播种测试数据 ----------
  // 员工：db.ts 的 seedIfEmpty 会播种 45 条（模块加载时）。
  const empTotal = (db.prepare("SELECT COUNT(*) AS c FROM employees").get() as any).c;
  check("员工种子数据存在", empTotal >= 1, `count=${empTotal}`);

  // 文档：直接落盘上传 25 条，其中 10 条归入 f1、15 条未归类。
  for (let i = 0; i < 10; i++) {
    createDocumentFromUpload({ name: `合同-${i}.pdf`, folderId: "f1", buffer: Buffer.from("x") });
  }
  for (let i = 0; i < 15; i++) {
    createDocumentFromUpload({ name: `简历-${i}.doc`, folderId: null, buffer: Buffer.from("y") });
  }
  const docTotal = (db.prepare("SELECT COUNT(*) AS c FROM documents").get() as any).c;
  check("文档共 25 条", docTotal === 25, `count=${docTotal}`);

  // 打卡记录：replaceRecords 整体写入 30 条（按员工/日期分散）。
  const recs: any[] = [];
  for (let i = 0; i < 30; i++) {
    const empNum = (i % 5) + 1; // 1..5
    recs.push({
      id: `R${i}`,
      employeeId: `EMP${String(empNum).padStart(4, "0")}`,
      employeeName: `员工 ${empNum}`,
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      time: "09:00:00",
    });
  }
  replaceRecords(recs);
  const recTotal = (db.prepare("SELECT COUNT(*) AS c FROM punch_records").get() as any).c;
  check("打卡记录共 30 条", recTotal === 30, `count=${recTotal}`);

  // ---------- 向后兼容：无分页参数返回数组 ----------
  const empArr = listEmployees({});
  check("员工无分页参数返回数组", Array.isArray(empArr), `type=${typeof empArr}`);
  check("员工完整数组长度匹配总数", (empArr as any[]).length === empTotal);

  const docArr = listDocuments({});
  check("文档无分页参数返回数组", Array.isArray(docArr), `type=${typeof docArr}`);
  check("文档完整数组长度匹配总数", (docArr as any[]).length === docTotal);

  const recArr = listRecords({});
  check("打卡记录无分页参数返回数组", Array.isArray(recArr), `type=${typeof recArr}`);
  check("打卡记录完整数组长度匹配总数", (recArr as any[]).length === recTotal);

  // ---------- 分页信封形状 ----------
  const emp1 = listEmployees({ page: 1, pageSize: 10 });
  check("员工分页返回信封对象", !Array.isArray(emp1) && "items" in emp1 && "total" in emp1 && "totalPages" in emp1);
  check("员工信封 total 匹配总数", emp1.total === empTotal);
  check("员工信封 totalPages 计算正确", emp1.totalPages === Math.ceil(empTotal / 10), `totalPages=${emp1.totalPages}`);
  check("员工第 1 页 items 长度=pageSize", emp1.items.length === 10, `len=${emp1.items.length}`);
  check("员工信封 page/pageSize 回显", emp1.page === 1 && emp1.pageSize === 10);

  // 末页（第 5 页，员工 45 条 -> 5 页，末页 5 条）
  const emp5 = listEmployees({ page: 5, pageSize: 10 });
  check("员工末页 items 长度=余数", emp5.items.length === empTotal - 40, `len=${emp5.items.length}`);

  // 超出末页：空 items 但 totalPages 不变
  const emp99 = listEmployees({ page: 99, pageSize: 10 });
  check("员工超末页 items 为空", emp99.items.length === 0, `len=${emp99.items.length}`);
  check("员工超末页 totalPages 不变", emp99.totalPages === emp1.totalPages);

  // pageSize 上限（MAX_PAGE_SIZE=200）：请求 9999 被夹到 200
  const empCap = listEmployees({ page: 1, pageSize: 9999 });
  check("员工 pageSize 上限夹紧到 200", empCap.pageSize === 200, `pageSize=${empCap.pageSize}`);

  // ---------- 文档分页 + folderId 服务端筛选 ----------
  const docF1 = listDocuments({ page: 1, pageSize: 50, folderId: "f1" });
  check("文档 folderId=f1 仅 10 条", docF1.total === 10, `total=${docF1.total}`);
  check("文档 folderId=f1 items 全属 f1", docF1.items.every((d: any) => d.folderId === "f1"));

  const docNone = listDocuments({ page: 1, pageSize: 50, folderId: "none" });
  check("文档 folderId=none 仅 15 条", docNone.total === 15, `total=${docNone.total}`);

  const docKw = listDocuments({ page: 1, pageSize: 50, keyword: "合同" });
  check("文档 keyword=合同 仅命中 10 条", docKw.total === 10, `total=${docKw.total}`);
  check("文档 keyword 命中项名含 合同", docKw.items.every((d: any) => d.name.includes("合同")));

  // ---------- 打卡记录分页 + 筛选 ----------
  const recP = listRecords({ page: 1, pageSize: 10 });
  check("打卡记录分页 total=30", recP.total === 30, `total=${recP.total}`);
  check("打卡记录第 1 页 items=10", recP.items.length === 10, `len=${recP.items.length}`);

  const recEmp = listRecords({ page: 1, pageSize: 50, employeeId: "EMP0001" });
  // employeeId=EMP0001 的记录：i % 5 == 0 -> i = 0,5,10,15,20,25 -> 6 条
  check("打卡记录按 employeeId 筛选=6 条", recEmp.total === 6, `total=${recEmp.total}`);
  check("打卡记录筛选项 employeeId 全为 EMP0001", recEmp.items.every((r: any) => r.employeeId === "EMP0001"));

  const recDate = listRecords({ page: 1, pageSize: 50, dateFrom: "2026-01-15", dateTo: "2026-01-31" });
  check("打卡记录按日期区间筛选非空", recDate.total > 0, `total=${recDate.total}`);
  check("打卡记录日期筛选项均在区间内", recDate.items.every((r: any) => r.date >= "2026-01-15" && r.date <= "2026-01-31"));

  // ---------- 汇总 ----------
  console.log(`\n[verify-pagination] PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("verify-pagination crashed:", e);
  process.exit(1);
});
