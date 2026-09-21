/**
 * 子进程探针：在一个全新的 DATA_DIR 上，只 import 员工与提醒相关模块（不跑迁移、
 * 不 import departmentsDb / authDb / todosDb），验证 core 数据层不依赖别的模块的建表顺序。
 * 由 fresh-schema.test.ts 拉起，供 CI 上「测试文件顺序变了就 no such table」这类问题兜底。
 */
import { createEmployee, getEmployee, listEmployees, deleteEmployee, db } from "../../db.ts";
import { collectReminderItems, scanReminders } from "../../remindersDb.ts";

const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const created = createEmployee({
  name: "新库探针",
  status: "在职",
  department: "探针部",
  contractExpiry: "2099-01-01",
});
const expiring = createEmployee({ name: "新库探针-临期", status: "在职", contractExpiry: soon })!;
const readBack = getEmployee(created!.id);
const listed = listEmployees({ keyword: "新库" });
scanReminders({ contractExpiryDays: 30, probationConversionDays: 15 }); // 只需证明新库上不抛错
const collectedIds = collectReminderItems({ contractExpiryDays: 30, probationConversionDays: 15 }).map(
  (i) => i.employeeId
);
const deleted = deleteEmployee(created!.id);
deleteEmployee(expiring.id);

console.log(
  "AMS_PROBE " +
    JSON.stringify({
      createdId: created?.id ?? null,
      department: readBack?.department ?? null,
      keywordHits: Array.isArray(listed) ? listed.length : 0,
      catchesExpiring: collectedIds.includes(expiring.id),
      tables: (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name),
      deleted,
    })
);
