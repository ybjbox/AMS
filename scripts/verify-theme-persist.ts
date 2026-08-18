/**
 * P1-6 主题持久化回归：直接 import 数据层，在临时 DATA_DIR 上验证
 * 「主题配置落 SQLite，重启（新连接读同一文件）后仍在」。
 * 不依赖起 HTTP 服务，也不污染项目真实库。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), "ams-theme-"));
  process.env.DATA_DIR = tmp;

  try {
    const { getThemes, setThemes, getSetting, setSetting, SETTINGS_KEY_THEMES } =
      await import("../server/settingsDb.ts");
    const { DATA_DIR } = await import("../server/db.ts");
    const dbPath = path.join(DATA_DIR, "ams.db");

    console.log("[1] 全新库初始状态");
    check("初始 themes 为空（未播种）", getThemes() === undefined);
    check("任意 key 缺失返回 undefined", getSetting("nope") === undefined);

    console.log("[2] 写入主题并验证内存可读");
    const custom = { custom1: { name: "测试主题", titleFill: "FFFF0000", headerFill: "FF00FF00", headerFontColor: "FFFFFFFF", zebraFill: "FFF0F0F0" } };
    setThemes(custom);
    check("写入后 getThemes 返回相同对象", eq(getThemes(), custom));

    console.log("[3] 验证确已落盘（绕过单例，直连文件模拟重启）");
    const reopen = new DatabaseSync(dbPath);
    const row = reopen.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY_THEMES) as
      | { value: string }
      | undefined;
    check("磁盘上 settings 表存在该 key", !!row, `row=${JSON.stringify(row)}`);
    check("磁盘 JSON 与写入一致", !!row && eq(JSON.parse(row.value), custom));
    reopen.close();

    console.log("[4] 覆盖写入");
    const custom2 = { ...custom, custom2: { name: "第二主题", titleFill: "FF0000FF" } };
    setThemes(custom2);
    check("覆盖后 getThemes 返回新值", eq(getThemes(), custom2));

    console.log("[5] 任意 JSON 往返");
    const payload = { a: 1, b: [1, 2, 3], c: { d: null, e: "中文" }, f: true };
    setSetting("misc", payload);
    check("标量/嵌套对象往返一致", eq(getSetting("misc"), payload));

    console.log("[6] 模拟进程重启：用全新连接读取已提交数据");
    const restart = new DatabaseSync(dbPath);
    const after = restart.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY_THEMES) as
      | { value: string }
      | undefined;
    check("重启后主题仍在磁盘", !!after && eq(JSON.parse(after.value), custom2));
    const miscAfter = restart.prepare("SELECT value FROM settings WHERE key = ?").get("misc") as
      | { value: string }
      | undefined;
    check("重启后 misc 配置仍在", !!miscAfter && eq(JSON.parse(miscAfter.value), payload));
    restart.close();

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail > 0) process.exit(1);
  } finally {
    // 尽力清理临时库；Windows 上 WAL 锁可能导致删除失败，属正常现象，忽略。
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
