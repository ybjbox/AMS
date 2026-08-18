/**
 * P1-3 回归：验证考勤排班/打卡从「整表替换 DELETE ALL + INSERT」改为增量接口后，
 * 多人并发编辑不再互相覆盖、单条增删不影响他人数据。
 *
 * 关键风险：schedules/punch_records.employeeId 有 FK → employees(id) ON DELETE CASCADE，
 * 因此测试必须使用真实存在的员工 id。脚本会创建两个临时员工 T_A / T_B，
 * 全程只用它们的 id 做写入，并在结束时删除（CASCADE 自动清理其排班/记录），
 * 对库中的真实业务数据零侵入（records 导入测试额外做了备份+还原）。
 */
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + (extra ? "  -> " + extra : ""));
  }
}

async function req(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, body: json };
}

// 读取 admin 口令并登录（处理首次强制改密）
function readAdminPassword() {
  try {
    const txt = fs.readFileSync("data/ADMIN_CREDENTIALS.txt", "utf8");
    const m = txt.match(/密码:\s*(.+)/);
    return m ? m[1].trim() : "admin";
  } catch {
    return "admin";
  }
}

async function main() {
  const adminPw = readAdminPassword();
  const login = await req("POST", "/api/auth/login", {
    body: { username: "admin", password: adminPw },
  });
  if (login.status !== 200 || !login.body.token) {
    console.error("登录失败：", login.status, JSON.stringify(login.body));
    process.exit(1);
  }
  let TOKEN = login.body.token;
  const mustChange = !!login.body.user?.mustChangePassword;
  if (mustChange) {
    const cp = await req("POST", "/api/auth/change-password", {
      token: TOKEN,
      body: { currentPassword: adminPw, newPassword: "TempChangePwd123" },
    });
    TOKEN = cp.body.token;
  }

  // 创建两个临时测试员工（真实存在的 id，满足 FK 约束）
  const ta = await req("POST", "/api/users", {
    token: TOKEN,
    body: { id: "T_A", name: "测试员工A" },
  });
  const tb = await req("POST", "/api/users", {
    token: TOKEN,
    body: { id: "T_B", name: "测试员工B" },
  });
  const TA = ta.body.id;
  const TB = tb.body.id;
  ok("创建临时测试员工 T_A / T_B", !!TA && !!TB, `TA=${TA} TB=${TB}`);

  // 备份真实数据（records 导入测试会整表替换，需还原）
  const backupSchedules = (await req("GET", "/api/attendance/schedules", { token: TOKEN })).body;
  const backupRecords = (await req("GET", "/api/attendance/records", { token: TOKEN })).body;

  try {
    console.log("\n=== 1. 排班并发 upsert 不互相覆盖（修复前 DELETE ALL 会丢） ===");
    const base = (await req("GET", "/api/attendance/schedules", { token: TOKEN })).body;
    // 用户 A 基于同一快照只追加 T_A
    const aSubmit = [...base, { employeeId: TA, employeeName: "测试员工A", shiftIds: ["1"] }];
    // 用户 B 基于同一快照只追加 T_B
    const bSubmit = [...base, { employeeId: TB, employeeName: "测试员工B", shiftIds: ["1"] }];
    await req("PUT", "/api/attendance/schedules", { token: TOKEN, body: { schedules: aSubmit } });
    await req("PUT", "/api/attendance/schedules", { token: TOKEN, body: { schedules: bSubmit } });
    const after = (await req("GET", "/api/attendance/schedules", { token: TOKEN })).body;
    ok(
      "并发编辑：A 的 T_A 与 B 的 T_B 排班均保留（无互相覆盖）",
      after.some((s) => s.employeeId === TA) && after.some((s) => s.employeeId === TB)
    );

    console.log("\n=== 2. 增量删除单个排班不影响他人 ===");
    await req("DELETE", `/api/attendance/schedules/${TA}`, { token: TOKEN });
    const afterDel = (await req("GET", "/api/attendance/schedules", { token: TOKEN })).body;
    ok(
      "删除 T_A 后 T_B 仍在",
      !afterDel.some((s) => s.employeeId === TA) && afterDel.some((s) => s.employeeId === TB)
    );

    console.log("\n=== 3. 打卡记录并发 POST 不互相覆盖 ===");
    await req("POST", "/api/attendance/records", {
      token: TOKEN,
      body: { id: "REC_A1", employeeId: TA, employeeName: "测试员工A", date: "2026-01-01", time: "09:00:00" },
    });
    await req("POST", "/api/attendance/records", {
      token: TOKEN,
      body: { id: "REC_B1", employeeId: TB, employeeName: "测试员工B", date: "2026-01-01", time: "09:00:00" },
    });
    const afterRec = (await req("GET", "/api/attendance/records", { token: TOKEN })).body;
    ok(
      "并发 POST：REC_A1 与 REC_B1 均保留",
      afterRec.some((r) => r.id === "REC_A1") && afterRec.some((r) => r.id === "REC_B1")
    );

    console.log("\n=== 4. 增量删除单条记录不影响他人 ===");
    await req("DELETE", `/api/attendance/records/REC_A1`, { token: TOKEN });
    const afterDelRec = (await req("GET", "/api/attendance/records", { token: TOKEN })).body;
    ok(
      "删除 REC_A1 后 REC_B1 仍在",
      !afterDelRec.some((r) => r.id === "REC_A1") && afterDelRec.some((r) => r.id === "REC_B1")
    );

    console.log("\n=== 5. 整表替换（Excel 导入语义）仍生效，且可还原 ===");
    const importData = [
      { id: "REC_IMP1", employeeId: TA, employeeName: "测试员工A", date: "2026-02-01", time: "08:30:00" },
      { id: "REC_IMP2", employeeId: TB, employeeName: "测试员工B", date: "2026-02-01", time: "08:30:00" },
    ];
    await req("PUT", "/api/attendance/records", { token: TOKEN, body: { records: importData } });
    const afterImport = (await req("GET", "/api/attendance/records", { token: TOKEN })).body;
    ok("导入后仅含导入的 2 条（DELETE ALL + INSERT 生效）", afterImport.length === 2);
    // 还原真实记录
    await req("PUT", "/api/attendance/records", { token: TOKEN, body: { records: backupRecords } });
    const afterRestore = (await req("GET", "/api/attendance/records", { token: TOKEN })).body;
    ok("导入后已还原原始记录数量", afterRestore.length === backupRecords.length);
  } finally {
    // 还原排班：先清空再 upsert 备份，避免测试员工的排班残留
    await req("DELETE", "/api/attendance/schedules", { token: TOKEN });
    await req("PUT", "/api/attendance/schedules", { token: TOKEN, body: { schedules: backupSchedules } });
    // 删除临时员工（CASCADE 清理其排班/记录/异常）
    await req("DELETE", `/api/users/${TA}`, { token: TOKEN });
    await req("DELETE", `/api/users/${TB}`, { token: TOKEN });
    // 恢复 admin 种子态
    if (mustChange) {
      await req("POST", "/api/auth/accounts/admin/reset-password", { token: TOKEN, body: { newPassword: adminPw } });
    }
  }

  console.log(`\n结果：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
