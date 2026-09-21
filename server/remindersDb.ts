/**
 * 到期提醒扫描（服务端）— 取代此前跑在浏览器里的 useEmployeeReminders。
 *
 * 三件事必须发生在服务端：
 *  1. 没人打开浏览器时也要提醒：合同还有 7 天到期，不会等管理员上线；
 *  2. 收件人只能是 HR 及以上：客户端版本任何角色（含普通员工）打开页面都会为全员
 *     生成提醒，等于把同事的合同到期日广播出去；
 *  3. 阈值要有一份服务端真相：此前存 localStorage，换浏览器/换机器就回到默认值。
 *
 * 文案与归并键（refKey）与客户端版本逐字保持一致，v9 已归并好的那批未读提醒会被
 * 原地刷新而不是再生成一份。
 */
import { db } from "./db.ts";
import { getSetting, setSetting } from "./settingsDb.ts";
import { createTodo } from "./todosDb.ts";
import { createNotification } from "./notificationsDb.ts";
import { ROLE_LEVEL, type SystemRole } from "./authDb.ts";

const CONFIG_KEY = "reminderConfig";
const STATUS_KEY = "reminderStatus";

export interface ReminderConfig {
  /** 合同到期前多少天开始提醒 */
  contractExpiryDays: number;
  /** 试用期转正前多少天开始提醒 */
  probationConversionDays: number;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  contractExpiryDays: 30,
  probationConversionDays: 15,
};

export interface ReminderItem {
  kind: "contract" | "probation";
  employeeId: string;
  employeeName: string;
  dueDate: string;
  daysLeft: number;
}

export interface ReminderScanReport {
  scannedAt: string;
  items: ReminderItem[];
  recipients: string[];
  /** 新写入的待办条数（去重命中的旧待办不计入） */
  created: number;
}

export function getReminderConfig(): ReminderConfig {
  const stored = getSetting<Partial<ReminderConfig>>(CONFIG_KEY);
  // settings KV 里可能是任何形状（手改/旧版本），只认数字且限定范围
  const clamp = (value: unknown, fallback: number) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(365, Math.max(1, Math.round(n)));
  };
  return {
    contractExpiryDays: clamp(stored?.contractExpiryDays, DEFAULT_REMINDER_CONFIG.contractExpiryDays),
    probationConversionDays: clamp(
      stored?.probationConversionDays,
      DEFAULT_REMINDER_CONFIG.probationConversionDays
    ),
  };
}

export function setReminderConfig(patch: Partial<ReminderConfig>): ReminderConfig {
  const next = { ...getReminderConfig(), ...patch };
  setSetting(CONFIG_KEY, next);
  return next;
}

export function getReminderStatus(): { lastScanAt: string | null; lastReport: ReminderScanReport | null } {
  const stored = getSetting<{ lastScanAt?: string; lastReport?: ReminderScanReport }>(STATUS_KEY);
  return { lastScanAt: stored?.lastScanAt ?? null, lastReport: stored?.lastReport ?? null };
}

/** 提醒收件人 = 启用中的 HR 及以上账号。没有这样的账号时本轮什么都不写。 */
export function listReminderRecipients(): string[] {
  const rows = db
    .prepare("SELECT username, systemRole FROM accounts WHERE enabled = 1")
    .all() as unknown as Array<{ username: string; systemRole: string }>;
  return rows
    .filter((r) => ROLE_LEVEL[r.systemRole as SystemRole] >= ROLE_LEVEL.HR)
    .map((r) => r.username)
    .sort();
}

/** 'YYYY-MM-DD' → 距今天的天数（按日历日，避免 new Date('YYYY-MM-DD') 的 UTC 偏移） */
function daysUntil(iso: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** 入职日 + N 个月（同样按日历日算，转正日与客户端旧口径一致） */
function plusMonths(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3]));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 种子数据姓名形如「员工 33」，直接拼接会出现「员工 员工 33」，故按需补前缀 */
function nameLabel(name: string): string {
  return name.startsWith("员工") ? name : `员工 ${name}`;
}

interface EmployeeRow {
  id: string;
  name: string;
  status: string;
  contractExpiry: string;
  joinDate: string;
}

/** 找出本轮该提醒的人与事（纯计算，不发通知，便于单测） */
export function collectReminderItems(config = getReminderConfig()): ReminderItem[] {
  const employees = db
    .prepare(
      `SELECT id, name, status, contractExpiry, joinDate FROM employees
        WHERE status <> '离职'
        ORDER BY id`
    )
    .all() as unknown as EmployeeRow[];

  const items: ReminderItem[] = [];
  for (const emp of employees) {
    if (emp.contractExpiry) {
      const days = daysUntil(emp.contractExpiry);
      if (days !== null && days > 0 && days <= config.contractExpiryDays) {
        items.push({
          kind: "contract",
          employeeId: emp.id,
          employeeName: emp.name,
          dueDate: emp.contractExpiry,
          daysLeft: days,
        });
      }
    }
    if (emp.status === "试用期" && emp.joinDate) {
      const due = plusMonths(emp.joinDate, 3);
      const days = due ? daysUntil(due) : null;
      if (due && days !== null && days > 0 && days <= config.probationConversionDays) {
        items.push({
          kind: "probation",
          employeeId: emp.id,
          employeeName: emp.name,
          dueDate: due,
          daysLeft: days,
        });
      }
    }
  }
  return items;
}

const COPY: Record<ReminderItem["kind"], { title: string; type: "warning" | "info"; prefix: string }> = {
  contract: { title: "合同到期提醒", type: "warning", prefix: "contract" },
  probation: { title: "试用期转正提醒", type: "info", prefix: "probation" },
};

/** 某收件人当前未完成的自动提醒待办数（用它前后对比得出本轮真正新增的条数） */
function countOpenReminderTodos(recipient: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM todos
        WHERE createdBy = ? AND type IN ('contract','probation') AND completed = 0`
    )
    .get(recipient) as unknown as { n: number | bigint };
  return Number(row.n ?? 0);
}

/**
 * 执行一轮扫描：为每位收件人补待办 + 补通知。
 * 幂等：待办按 (createdBy, type, targetId) 未完成去重（todosDb 内建），
 * 通知按 refKey 原地刷新未读那条（notificationsDb 内建），所以每小时跑一次也不会堆积。
 */
export function scanReminders(config = getReminderConfig()): ReminderScanReport {
  const recipients = listReminderRecipients();
  const items = collectReminderItems(config);
  let created = 0;

  if (recipients.length > 0) {
    const watch = recipients[0];
    const before = countOpenReminderTodos(watch);
    for (const recipient of recipients) {
      for (const item of items) {
        const copy = COPY[item.kind];
        const message =
          item.kind === "contract"
            ? `${nameLabel(item.employeeName)} (${item.employeeId}) 的合同将于 ${item.dueDate} 到期（剩余 ${item.daysLeft} 天）`
            : `${nameLabel(item.employeeName)} (${item.employeeId}) 的试用期将于 ${item.dueDate} 结束（剩余 ${item.daysLeft} 天）`;

        createTodo({
          title: copy.title,
          description: message,
          dueDate: item.dueDate,
          type: item.kind,
          targetId: item.employeeId,
          createdBy: recipient,
          assignee: recipient,
        });
        createNotification({
          title: copy.title,
          message,
          type: copy.type,
          recipient,
          refKey: `${copy.prefix}:${item.employeeId}`,
        });
      }
    }
    created = Math.max(0, countOpenReminderTodos(watch) - before);
  }

  const report: ReminderScanReport = {
    scannedAt: new Date().toISOString(),
    items,
    recipients,
    created,
  };
  setSetting(STATUS_KEY, { lastScanAt: report.scannedAt, lastReport: report });
  return report;
}

/**
 * 定时扫描：默认每 6 小时一轮，REMINDER_SCAN_ENABLED=false 可关。
 * 与 startBackupScheduler 同一套写法（错误自吞、unref 不阻止进程退出）。
 */
export function startReminderScheduler(): ReturnType<typeof setInterval> | null {
  if ((process.env.REMINDER_SCAN_ENABLED ?? "true").toLowerCase() === "false") {
    console.log("[reminders] 到期提醒扫描已禁用（REMINDER_SCAN_ENABLED=false）");
    return null;
  }
  const parsed = Number(process.env.REMINDER_SCAN_INTERVAL_MS);
  const intervalMs = Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 6 * 60 * 60 * 1000;

  const run = () => {
    try {
      const report = scanReminders();
      if (report.items.length > 0) {
        console.log(
          "[reminders] 扫描完成：%d 条提醒，收件人 %d 个",
          report.items.length,
          report.recipients.length
        );
      }
    } catch (e) {
      console.error("[reminders] 定时扫描失败：", e);
    }
  };
  setTimeout(run, 5_000); // 启动后先跑一轮，不必等到下一个周期点
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[reminders] 到期提醒扫描已启动：每 ${Math.round((intervalMs / 3_600_000) * 10) / 10} 小时一轮`);
  return timer;
}
