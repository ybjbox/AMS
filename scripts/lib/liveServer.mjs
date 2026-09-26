/**
 * 自包含服务端回归脚本的公共底座。
 *
 * 为什么要有它：这批脚本（鉴权网关、导出沙箱、审计落库、并发写、外键级联、保存失败契约）
 * 恰好是**只能由它们发现**的那类回归，但此前全都依赖「本机 3000 上有一个活服务
 * + data/ADMIN_CREDENTIALS.txt 里有口令」，因此进不了 CI —— CI 上 12 个自包含脚本全绿，
 * 而这 6 个守门脚本一次都不跑，改坏鉴权网关或沙箱照样合得进去。
 *
 * 现在每个脚本自己拉一个私有实例：临时 DATA_DIR + 随机端口 + AMS_ADMIN_PASSWORD 播种，
 * 跑完连进程带目录一起收掉。附带好处：
 * - 不再需要「把 admin 口令改回去、把种子态还原」这类收尾，脚本可重复运行；
 * - 破坏性用例（清空全库、删外键、批量改密）再也碰不到开发库；
 * - 端口是随机的，与本机常驻的 :3000 dev:watch 互不干扰。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * 测试用管理员口令。约束：不含 `!`（Windows cmd 会把 `!` 当延迟展开吃掉）、
 * 长度与字符类别满足 authDb.assertPasswordStrength。
 */
export const ADMIN_PW = "LiveVerify2026TempA";

function freePort() {
  // 3200–3999：避开 :3000 开发实例与 :3001 手工验证实例
  return 3200 + Math.floor(Math.random() * 800);
}

/**
 * 向内核确认端口空闲后再交给子进程绑定，比「随机猜一个」少一次撞车面
 * （猜中的端口若被别的监听者占用，表现为「服务未在 45000ms 内就绪」这种难读的失败）。
 */
async function pickFreePort() {
  for (let i = 0; i < 5; i++) {
    const port = freePort();
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => {
        probe.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  // 连续撞车（极端拥挤的 runner）时退回内核分配的任意空闲端口
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(freePort()));
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, timeoutMs) {
  const start = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return true;
    } catch {
      /* 还没起来 */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`服务未在 ${timeoutMs}ms 内就绪：${base}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * 拉起一个私有实例。
 *
 * @param opts.tag            临时目录前缀，便于排查
 * @param opts.seedAdminPassword 传 null 走「服务端随机生成 + ADMIN_CREDENTIALS.txt」路径
 *                              （鉴权脚本需要：那条路径才会带 mustChangePassword=1）
 * @param opts.autoLogin      false 时不替你登录，脚本自己走登录接口（同上原因）
 */
export async function bootServer({
  tag = "verify",
  readyTimeoutMs = 45000,
  seedAdminPassword = ADMIN_PW,
  autoLogin = true,
} = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `ams-${tag}-`));
  const port = await pickFreePort();
  const base = `http://127.0.0.1:${port}`;

  // 不覆盖外部已显式指定的值（方便 PORT=xxx node scripts/... 复现）
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "production", // 跳过 Vite 中间件：只要 API
    // 备份/提醒/企微同步这些调度器在回归里只是噪音与额外写入，统一关掉
    BACKUP_ENABLED: "false",
    REMINDER_SCAN_ENABLED: "false",
    WECOM_SYNC_ENABLED: "false",
    // seedAdminPassword=null 时要**显式给空串**：server/env.ts 用 dotenv 加载 .env.local，
    // 而 dotenv 不覆盖已存在的变量 —— 留空（不定义）会被本机 .env.local 里的
    // AMS_ADMIN_PASSWORD 抢先，随机口令那条播种路径（带 mustChangePassword=1）就永远测不到。
    AMS_ADMIN_PASSWORD: seedAdminPassword ?? "",
  };

  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: process.cwd(),
    env,
    // 不用 shell:true：那样 kill() 杀掉的是 cmd 包装进程，会留下孤儿占着端口
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));
  // 兜底：脚本中途抛错没走到 stop() 时，至少别留下占着端口的孤儿进程
  // （exit 钩子里只能做同步动作，child.kill 在 Windows/Linux 上都是发信号而已）
  process.once("exit", () => {
    try {
      child.kill();
    } catch {
      /* 已经退出了 */
    }
  });

  const stopped = { done: false };
  async function stop() {
    if (stopped.done) return;
    stopped.done = true;
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.killed) return resolve();
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 3000);
    });
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* 临时目录留在 tmp 里由系统回收，不该盖住断言结果 */
    }
  }

  try {
    await waitForHealth(base, readyTimeoutMs);
  } catch (e) {
    await stop();
    throw new Error(`${e.message}\n--- 服务输出 ---\n${log.slice(-4000)}`, { cause: e });
  }

  /** 登录后写入，之后 req() 默认带上它（要匿名就显式传 token:""） */
  const session = { token: "" };

  async function req(method, urlPath, body, token = session.token, headers = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined && h["Content-Type"] === undefined) h["Content-Type"] = "application/json";
    const res = await fetch(base + urlPath, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json, text, headers: res.headers };
  }

  if (autoLogin) {
    const login = await req("POST", "/api/auth/login", { username: "admin", password: seedAdminPassword }, "");
    if (login.status !== 200 || !login.body?.token) {
      await stop();
      throw new Error(`管理员登录失败：${login.status} ${login.text?.slice?.(0, 200)}`);
    }
    session.token = login.body.token;
  }

  return {
    base,
    port,
    dataDir,
    adminPassword: seedAdminPassword,
    token: session.token,
    req,
    stop,
    log: () => log,
  };
}

/** 统一的收尾：打印计数并给出退出码（CI 靠它判定红绿） */
export function summarize({ pass, fail, failures = [] }) {
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length) console.log("失败项：\n - " + failures.join("\n - "));
  return fail === 0 ? 0 : 1;
}
