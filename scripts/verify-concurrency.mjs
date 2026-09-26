/**
 * P1-3 回归：考勤排班/打卡从「整表替换 DELETE ALL + INSERT」改为增量/upsert-only 之后，
 * 多人并发编辑不互相覆盖、单条增删不影响他人数据。
 *
 * 运行：node scripts/verify-concurrency.mjs（也包含在 npm run test:server 里）
 *
 * 关键风险：schedules/punch_records.employeeId 是 FK → employees(id) ON DELETE CASCADE，
 * 所以必须用真实存在的员工 id。脚本自起私有实例（临时 DATA_DIR），
 * 临时员工与它名下的排班/记录随目录一起消失 —— 不再需要"备份整表 + 还原"这类收尾
 * （那套收尾本身要求整表写入权限，正是它想验的那个洞）。
 */
import { bootServer, summarize } from "./lib/liveServer.mjs";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    failures.push(name + (extra ? ` -> ${extra}` : ""));
    console.log("  ✗ " + name + (extra ? "  -> " + extra : ""));
  }
}

async function main() {
  const { req, stop } = await bootServer({ tag: "concurrency" });

  const ta = await req("POST", "/api/users", { name: "测试员工A" });
  const tb = await req("POST", "/api/users", { name: "测试员工B" });
  const TA = ta.body.id;
  const TB = tb.body.id;
  ok("创建临时测试员工 T_A / T_B", !!TA && !!TB, `TA=${TA} TB=${TB}`);

  try {
    console.log("\n=== 1. 排班并发 upsert 不互相覆盖（修复前 DELETE ALL 会丢） ===");
    const base = (await req("GET", "/api/attendance/schedules")).body;
    // 两个用户基于同一份快照各自只追加自己那一条
    const aSubmit = [...base, { employeeId: TA, employeeName: "测试员工A", shiftIds: ["1"] }];
    const bSubmit = [...base, { employeeId: TB, employeeName: "测试员工B", shiftIds: ["1"] }];
    await req("PUT", "/api/attendance/schedules", { schedules: aSubmit });
    await req("PUT", "/api/attendance/schedules", { schedules: bSubmit });
    const after = (await req("GET", "/api/attendance/schedules")).body;
    ok(
      "并发编辑：T_A 与 T_B 排班均保留（无互相覆盖）",
      after.some((s) => s.employeeId === TA) && after.some((s) => s.employeeId === TB)
    );

    console.log("\n=== 2. 增量删除单个排班不影响他人 ===");
    await req("DELETE", `/api/attendance/schedules/${TA}`);
    const afterDel = (await req("GET", "/api/attendance/schedules")).body;
    ok(
      "删除 T_A 的排班后 T_B 仍在",
      !afterDel.some((s) => s.employeeId === TA) && afterDel.some((s) => s.employeeId === TB)
    );

    console.log("\n=== 3. 打卡记录并发 POST 不互相覆盖 ===");
    const recA = await req("POST", "/api/attendance/records", {
      employeeId: TA,
      employeeName: "测试员工A",
      date: "2026-01-01",
      time: "09:00:00",
    });
    const recB = await req("POST", "/api/attendance/records", {
      employeeId: TB,
      employeeName: "测试员工B",
      date: "2026-01-01",
      time: "09:00:00",
    });
    ok("两条打卡都建成功", recA.status === 201 && recB.status === 201, `${recA.status}/${recB.status}`);
    const afterRec = (await req("GET", "/api/attendance/records")).body;
    ok(
      "并发 POST：两条记录均保留",
      afterRec.some((r) => r.employeeId === TA) && afterRec.some((r) => r.employeeId === TB)
    );

    console.log("\n=== 4. 增量删除单条记录不影响他人 ===");
    const idA = afterRec.find((r) => r.employeeId === TA)?.id;
    await req("DELETE", `/api/attendance/records/${idA}`);
    const afterDelRec = (await req("GET", "/api/attendance/records")).body;
    ok(
      "删除 T_A 的记录后 T_B 仍在",
      !afterDelRec.some((r) => r.employeeId === TA) && afterDelRec.some((r) => r.employeeId === TB)
    );

    console.log("\n=== 5. PUT /records 是 upsert-only：未提及的行不会被删 ===");
    const beforeImport = (await req("GET", "/api/attendance/records")).body;
    const keepId = beforeImport.find((r) => r.employeeId === TB)?.id; // 本次清单里故意不提它
    const importData = [
      { id: "REC_IMP1", employeeId: TA, employeeName: "测试员工A", date: "2026-02-01", time: "08:30:00" },
      { id: "REC_IMP2", employeeId: TB, employeeName: "测试员工B", date: "2026-02-01", time: "08:30:00" },
    ];
    const putRes = await req("PUT", "/api/attendance/records", { records: importData });
    ok("批量写入返回 200", putRes.status === 200, `status ${putRes.status}`);
    const afterImport = (await req("GET", "/api/attendance/records")).body;
    const importedIds = new Set(importData.map((r) => r.id));
    ok("批量写入生效", afterImport.filter((r) => importedIds.has(r.id)).length === 2);
    ok(
      "只传 2 行不清空全库：未提及的既有记录仍在",
      !!keepId && afterImport.some((r) => r.id === keepId)
    );

    console.log("\n=== 6. 空清单被拒；整表清空只给 ADMIN+ ===");
    const empty = await req("PUT", "/api/attendance/records", { records: [] });
    ok("records: [] → 400", empty.status === 400, `status ${empty.status}`);
    // 拿一个真实 HR 会话来撞这道门槛：路由内 requireRole("ADMIN") 比默认写策略更严
    await req("POST", "/api/auth/accounts", { username: "cc_hr", password: "CcHr#Tmp2026-a", systemRole: "HR" });
    const hrLogin = await req("POST", "/api/auth/login", { username: "cc_hr", password: "CcHr#Tmp2026-a" }, "");
    const hrFirst = hrLogin.body?.token ?? "";
    const hrChanged = await req("POST", "/api/auth/change-password", { currentPassword: "CcHr#Tmp2026-a", newPassword: "CcHr#Tmp2026-b" }, hrFirst);
    const hrToken = hrChanged.body?.token || hrFirst;
    const purgeAsHr = await req("DELETE", "/api/attendance/records", undefined, hrToken);
    ok("HR 整表清空打卡记录 → 403", purgeAsHr.status === 403, `status ${purgeAsHr.status}`);
    const recordsIntact = (await req("GET", "/api/attendance/records")).body;
    ok("被拒的清空没有真的删任何东西", recordsIntact.length === afterImport.length, `${recordsIntact.length} 条`);

    // 本脚本造出来的行自己收掉（PUT 只加不减，不再靠整表替换顺手还原）
    for (const id of ["REC_IMP1", "REC_IMP2", keepId].filter(Boolean)) {
      await req("DELETE", `/api/attendance/records/${id}`);
    }
    const afterCleanup = (await req("GET", "/api/attendance/records")).body;
    ok("测试行已清理", afterCleanup.length === 0, `剩余 ${afterCleanup.length} 条`);
  } finally {
    // 临时员工与其排班/打卡随 CASCADE 一起消失；私有实例跑完连目录一起删
    await req("DELETE", `/api/users/${TA}`);
    await req("DELETE", `/api/users/${TB}`);
    await stop();
  }

  process.exit(summarize({ pass, fail, failures }));
}

main().catch((e) => {
  console.error("verify crashed:", e);
  process.exit(1);
});
