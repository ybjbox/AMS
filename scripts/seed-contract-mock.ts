/**
 * 合同到期链的 mock 数据播种（**会写真实库**，默认干跑）。
 *
 * 为什么要有它：28 名员工的 `contractExpiry` / `contractSignDate` 全是空的，
 * 于是合同页的到期量级、红色「已过期」徽章、`/api/reminders` 的到期提醒、
 * 合同驱动的自动待办 —— 整条链在真实数据上从没活过，改没改坏都没法验证。
 *
 * 用法：
 *   node --import tsx scripts/seed-contract-mock.ts                # 干跑，只打印将写入什么
 *   node --import tsx scripts/seed-contract-mock.ts --apply        # 先快照，再写入，并跑一轮提醒扫描
 *   node --import tsx scripts/seed-contract-mock.ts --rescan       # 只重跑扫描，新增条目并入回滚记录
 *   node --import tsx scripts/seed-contract-mock.ts --rollback <ts> # 还原日期 + 清掉本次生成的待办与通知
 *
 * 三条硬规矩：
 *  1. 写入前 `VACUUM INTO` 出一份快照，并把每个员工被改前的值记进 JSON；
 *  2. **已经有真实到期日的人一律不动**（避免把哪天真的录进来的合同盖掉）；
 *  3. 只回滚自己生成的东西 —— 待办/通知按 id 精确删，不用 type 一把清。
 */
import fs from "fs";
import path from "path";
import { db } from "../server/db.ts";
import { scanReminders } from "../server/remindersDb.ts";

const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const SNAP_DIR = path.join(DATA_DIR, "contract-mock");
const TODAY = new Date();

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 在到期日基础上回推整年数得到签订日（本地日运算，避开 UTC 偏移） */
const minusYears = (dateStr: string, years: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return iso(new Date(y - years, m - 1, d));
};
const plusDays = (days: number) => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days);
  return iso(d);
};

/**
 * 四档分布（按工号排序后取前 N 个）：3 已过期 / 4 三十天内 / 19 正常 / 2 保持未登记。
 * 偏移量固定不随机 —— 同一个库跑两次得到同一批日期，回滚与复现才有意义。
 */
const BUCKETS: { label: string; offsets: number[] }[] = [
  { label: "已过期", offsets: [-120, -45, -3] },
  { label: "30 天内到期", offsets: [5, 12, 21, 29] },
  { label: "正常", offsets: Array.from({ length: 19 }, (_, i) => 90 + i * 20) },
];

interface Row {
  id: string;
  name: string;
  years: number;
  prevSign: string;
  prevExpiry: string;
  sign: string;
  expiry: string;
  bucket: string;
}

function plan(): { rows: Row[]; skipped: Row[]; untouched: string[] } {
  const emps = db
    .prepare(`SELECT id, name, contractYears, contractSignDate, contractExpiry FROM employees WHERE status <> '离职' ORDER BY id`)
    .all() as unknown as { id: string; name: string; contractYears: number | null; contractSignDate: string; contractExpiry: string }[];

  const rows: Row[] = [];
  const skipped: Row[] = [];
  const untouched: string[] = [];

  for (const e of emps) {
    const base = {
      id: e.id,
      name: e.name,
      years: Math.max(1, Math.round(Number(e.contractYears) || 1)),
      prevSign: e.contractSignDate ?? "",
      prevExpiry: e.contractExpiry ?? "",
    };
    if (e.contractExpiry) {
      // 已经有到期日 = 可能是真人真合同，绝不盖
      skipped.push({ ...base, sign: "", expiry: "", bucket: "已有到期日，跳过" });
      continue;
    }
    const offset = nextOffset(rows.length);
    if (offset === null) {
      untouched.push(e.id);
      continue;
    }
    const expiry = plusDays(offset.days);
    rows.push({ ...base, sign: minusYears(expiry, base.years), expiry, bucket: offset.label });
  }
  return { rows, skipped, untouched };
}

/** 已排到第几个 mock 位 —— 决定这个人落哪一档、偏移多少 */
function nextOffset(mockIndex: number): { days: number; label: string } | null {
  let acc = 0;
  for (const b of BUCKETS) {
    if (mockIndex < acc + b.offsets.length) return { days: b.offsets[mockIndex - acc], label: b.label };
    acc += b.offsets.length;
  }
  return null; // 超出四档配额 → 保持未登记
}

function show(title: string, rows: Row[]) {
  console.log(`\n${title}（${rows.length} 人）`);
  for (const r of rows) console.log(`  ${r.id}  ${r.name.padEnd(4)}  ${r.expiry || "—"}  签订 ${r.sign || "—"}  ${r.bucket}`);
}

const ts = () => new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

function apply() {
  const { rows, skipped, untouched } = plan();
  if (rows.length === 0) {
    console.log("没有需要补的人（全部已有到期日，或四档配额为 0）。");
    return;
  }
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const stamp = ts();
  const snap = path.join(SNAP_DIR, `pre-${stamp}.db`);
  db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);

  const before = new Set((db.prepare("SELECT id FROM todos").all() as unknown as { id: string }[]).map((r) => r.id));
  const beforeNotices = new Set(
    (db.prepare("SELECT id FROM notifications").all() as unknown as { id: string }[]).map((r) => r.id)
  );

  const upd = db.prepare("UPDATE employees SET contractSignDate = ?, contractExpiry = ?, updatedAt = datetime('now','localtime') WHERE id = ?");
  db.exec("BEGIN");
  for (const r of rows) upd.run(r.sign, r.expiry, r.id);
  db.exec("COMMIT");

  const report = scanReminders();

  const newTodos = (db.prepare("SELECT id FROM todos").all() as unknown as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !before.has(id));
  const newNotices = (db.prepare("SELECT id FROM notifications").all() as unknown as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !beforeNotices.has(id));

  fs.writeFileSync(
    path.join(SNAP_DIR, `rollback-${stamp}.json`),
    JSON.stringify({ stamp, at: new Date().toISOString(), prev: rows.map((r) => ({ id: r.id, sign: r.prevSign, expiry: r.prevExpiry })), newTodos, newNotices }, null, 2),
    "utf8"
  );

  show("已写入", rows);
  if (skipped.length) show("跳过（已有到期日）", skipped);
  console.log(`\n  保持未登记：${untouched.length} 人 ${untouched.join(', ')}`);
  console.log(`  快照：${snap}`);
  console.log(`  回滚：node --import tsx scripts/seed-contract-mock.ts --rollback ${stamp}`);
  console.log(`  提醒扫描：命中 ${report.items.length} 条 · 新生成待办 ${report.created} 条 · 收件人 ${report.recipients.length} 个`);
  console.log(`  本次新增 待办 ${newTodos.length} 条 / 通知 ${newNotices.length} 条`);
  const expiredMock = rows.filter((r) => r.bucket === "已过期");
  const reminded = new Set(report.items.map((i) => i.employeeId));
  const missed = expiredMock.filter((r) => !reminded.has(r.id));
  if (missed.length) {
    console.log(`\n  ⚠ 已过期但没进提醒的 ${missed.length} 人：${missed.map((m) => `${m.name}(${m.expiry})`).join("、")}`);
    console.log("    原因：collectReminderItems 只对 0 < 剩余 ≤ 阈值 的人生效，合同已经过期的人反而不再提醒。");
  }
}

/**
 * 只重跑一轮提醒扫描，并把这一轮新生成的待办/通知 id **追加**进最近一份回滚记录。
 *
 * 为什么需要：改了提醒规则（比如把已过期纳入提醒）之后要重新扫描才能看到效果，
 * 而新扫描产生的条目如果不记账，`--rollback` 就会漏删，真实库里留下孤儿待办。
 */
function rescan() {
  const files = fs.existsSync(SNAP_DIR) ? fs.readdirSync(SNAP_DIR).filter((f) => f.startsWith("rollback-") && f.endsWith(".json")) : [];
  if (files.length === 0) {
    console.error("✗ 没有找到回滚记录 —— 先用 --apply 播种，再考虑 --rescan");
    process.exit(1);
  }
  const latest = files.sort().at(-1)!;
  const file = path.join(SNAP_DIR, latest);
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { newTodos: string[]; newNotices: string[] };
  const before = new Set((db.prepare("SELECT id FROM todos").all() as unknown as { id: string }[]).map((r) => r.id));
  const beforeNotices = new Set(
    (db.prepare("SELECT id FROM notifications").all() as unknown as { id: string }[]).map((r) => r.id)
  );
  const report = scanReminders();
  const newTodos = (db.prepare("SELECT id FROM todos").all() as unknown as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !before.has(id));
  const newNotices = (db.prepare("SELECT id FROM notifications").all() as unknown as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !beforeNotices.has(id));
  data.newTodos = [...new Set([...data.newTodos, ...newTodos])];
  data.newNotices = [...new Set([...data.newNotices, ...newNotices])];
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log(
    `✓ 扫描完成：命中 ${report.items.length} 条 · 本轮新增 待办 ${newTodos.length} / 通知 ${newNotices.length}` +
      `（已并入 ${latest}，累计待办 ${data.newTodos.length} / 通知 ${data.newNotices.length}）`
  );
  for (const i of report.items) {
    console.log(`   ${i.daysLeft < 0 ? "已逾期" : "剩"} ${Math.abs(i.daysLeft)} 天  ${i.employeeName}  ${i.dueDate}`);
  }
}

function rollback(stamp: string) {
  const file = path.join(SNAP_DIR, `rollback-${stamp}.json`);
  if (!fs.existsSync(file)) {
    console.error(`✗ 找不到回滚文件：${file}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    prev: { id: string; sign: string; expiry: string }[];
    newTodos: string[];
    newNotices: string[];
  };
  const ids = data.prev.map((p) => p.id);
  const upd = db.prepare("UPDATE employees SET contractSignDate = ?, contractExpiry = ?, updatedAt = datetime('now','localtime') WHERE id = ?");
  const delTodo = db.prepare("DELETE FROM todos WHERE id = ?");
  const delNotice = db.prepare("DELETE FROM notifications WHERE id = ?");
  db.exec("BEGIN");
  for (const p of data.prev) upd.run(p.sign, p.expiry, p.id);
  for (const id of data.newTodos) delTodo.run(id);
  for (const id of data.newNotices) delNotice.run(id);
  // 记账之外再兜一层：服务端自己的定时扫描（进程内每 6 小时一轮）也会为这些人生成
  // 待办/通知，那部分不在本脚本的 id 账上。按"这批被 mock 的人 + 自动提醒类型"精确清，
  // 不碰 manual 待办，也不碰别人的合同提醒。
  const placeholders = ids.map(() => "?").join(",");
  const removedTodos = db
    .prepare(`DELETE FROM todos WHERE type IN ('contract','probation') AND targetId IN (${placeholders})`)
    .run(...ids).changes;
  // 通知没有 targetId，只有 refKey（`contract:<工号>` / `probation:<工号>`），
  // 所以按同样的工号集合精确删 —— 不能用 LIKE 'contract:%' 一把清，那会连别人的提醒一起删掉。
  const refKeys = ids.flatMap((id) => [`contract:${id}`, `probation:${id}`]);
  const refPlaceholders = refKeys.map(() => "?").join(",");
  const removedNotices = db
    .prepare(`DELETE FROM notifications WHERE refKey IN (${refPlaceholders})`)
    .run(...refKeys).changes;
  db.exec("COMMIT");
  console.log(
    `✓ 已还原 ${ids.length} 人的合同日期；清掉待办（记账 ${data.newTodos.length} + 按人 ${removedTodos}）、` +
      `通知（记账 ${data.newNotices.length} + 按人 ${removedNotices}）`
  );
  console.log(`  快照仍在 ${path.join(SNAP_DIR, `pre-${stamp}.db`)}（需要整库回退时用它）`);
}

const arg = process.argv[2];
if (arg === "--apply") {
  apply();
} else if (arg === "--rescan") {
  rescan();
} else if (arg === "--rollback") {
  rollback(process.argv[3] ?? "");
} else {
  const { rows, skipped, untouched } = plan();
  console.log("干跑（未写入）。加 --apply 才会真的写库。");
  show("将写入", rows);
  if (skipped.length) show("会跳过（已有到期日）", skipped);
  console.log(`\n  将保持未登记：${untouched.length} 人`);
}
