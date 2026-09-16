import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

/** 沙箱内同步代码最长执行时间（死循环由此拦截） */
const SYNC_TIMEOUT_MS = 3000;
/**
 * 沙箱内含异步在内的总执行时间。
 * 注意：若模板在 async 回调里写死循环，worker 线程会被完全占死，
 * 沙箱内的自检轮询也跑不起来，只能靠主线程的 HARD_KILL 兜底。
 */
const TOTAL_TIMEOUT_MS = 5000;
/** 主线程强制 terminate 的兜底时间，必须大于 TOTAL_TIMEOUT_MS */
const HARD_KILL_MS = 6000;
/** 单个模板允许产生的最大操作数 */
const MAX_OPS = 200000;

const WORKER_PATH = fileURLToPath(new URL("./sandboxWorker.mjs", import.meta.url));

export type SandboxOp = Record<string, any>;

export interface SandboxOutcome {
  ops: SandboxOp[];
  logs: string[];
}

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

/**
 * 在隔离沙箱中运行不可信的导出模板脚本。
 *
 * 脚本拿不到真实的 ExcelJS worksheet，只能操作沙箱内的录制器；
 * 返回值是一串纯 JSON 操作指令，由调用方（excelReplay）按白名单回放。
 */
export function runTemplateSandbox(
  code: string,
  data: unknown,
  config: unknown
): Promise<SandboxOutcome> {
  return new Promise((resolve, reject) => {
    let dataJson: string;
    let configJson: string;
    try {
      dataJson = JSON.stringify(data ?? []);
      configJson = JSON.stringify(config ?? {});
    } catch {
      reject(new SandboxError("导出数据无法序列化"));
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      void worker.terminate();
      fn();
    };

    const worker = new Worker(WORKER_PATH, {
      workerData: {
        code,
        dataJson,
        configJson,
        maxOps: MAX_OPS,
        syncTimeoutMs: SYNC_TIMEOUT_MS,
        totalTimeoutMs: TOTAL_TIMEOUT_MS,
      },
      // 沙箱线程不继承父进程环境变量与 argv，避免泄漏密钥
      env: {},
      argv: [],
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: 192,
        maxYoungGenerationSizeMb: 32,
        codeRangeSizeMb: 32,
        stackSizeMb: 4,
      },
      stdin: false,
      stdout: true,
      stderr: true,
    });

    const killTimer = setTimeout(() => {
      finish(() => reject(new SandboxError("模板执行超时，已强制终止")));
    }, HARD_KILL_MS);

    worker.on("message", (msg: unknown) => {
      if (!msg || typeof msg !== "object") {
        finish(() => reject(new SandboxError("沙箱返回了无效数据")));
        return;
      }
      // Worker 消息为跨线程序列化数据：逐字段窄化读取
      const m = msg as { ok?: unknown; error?: unknown; payload?: unknown };
      if (m.ok !== true) {
        finish(() => reject(new SandboxError(String(m.error ?? "模板执行失败"))));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(m.payload));
      } catch {
        finish(() => reject(new SandboxError("沙箱结果解析失败")));
        return;
      }
      const p = parsed && typeof parsed === "object" ? (parsed as { ops?: unknown; logs?: unknown }) : {};
      const ops = Array.isArray(p.ops) ? p.ops : [];
      const logs = Array.isArray(p.logs) ? p.logs.map((l: unknown) => String(l)) : [];
      finish(() => resolve({ ops, logs }));
    });

    worker.on("error", (err) => {
      finish(() => reject(new SandboxError("沙箱异常: " + err.message)));
    });

    worker.on("exit", (code) => {
      if (settled) return;
      finish(() => reject(new SandboxError(`沙箱意外退出（code ${code}）`)));
    });
  });
}
