/**
 * 同一个数据目录上的「还有谁活着」登记。
 *
 * 为什么需要：SQLite 的 WAL 只允许一个进程真正持有写路径。同一台机器上跑两个实例
 * （开发时 :3000 dev:watch 与验证用 :3001 共用 DATA_DIR 是常态）平时相安无事，
 * 但「在一台实例上恢复备份」会让另一台继续握着已被替换掉的旧 inode ——
 * 它之后的每一次写入都落到一个已 unlink 的文件上：不报错、不留日志、数据永久消失。
 *
 * 所以这里不禁止多实例（那是开发工作流本身），只做两件事：
 * 1. 启动时发现还有别人在同一个数据目录上，就在日志里明确告警；
 * 2. 恢复备份前检查，多于一个实例直接 409，而不是让用户以为恢复成功了。
 */
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./db.ts";

const HEARTBEAT_MS = 10_000;
/** 超过这个时间没刷新就认为那个进程已经死了（心跳 10 秒一次，留 4 个周期的余量） */
const STALE_MS = 45_000;

export interface InstanceInfo {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

function lockFile(port: number): string {
  return path.join(DATA_DIR, `.instance-${port}.json`);
}

let ownPort = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function writeBeat(port: number, host: string, startedAt: string): void {
  try {
    fs.writeFileSync(
      lockFile(port),
      JSON.stringify({ pid: process.pid, port, host, startedAt } satisfies InstanceInfo)
    );
  } catch (e) {
    // 心跳写不下去（只读卷/满盘）不该让服务起不来，只是少了一份互斥信息
    console.warn("[instance] 无法写入数据目录心跳文件：", e instanceof Error ? e.message : e);
  }
}

/** 开始在本数据目录上登记自己；重复调用只会更新端口 */
export function startInstanceHeartbeat(port: number, host: string): void {
  const startedAt = new Date().toISOString();
  ownPort = port;
  // 顺手清掉已判定为死亡的旧登记（不会碰还在刷新的实例）
  for (const f of fs.readdirSync(DATA_DIR).filter((n) => n.startsWith(".instance-") && n.endsWith(".json"))) {
    const p = path.join(DATA_DIR, f);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > STALE_MS) fs.rmSync(p, { force: true });
    } catch {
      /* 竞态或权限问题，留给下次 */
    }
  }
  writeBeat(port, host, startedAt);
  if (timer) clearInterval(timer);
  timer = setInterval(() => writeBeat(port, host, startedAt), HEARTBEAT_MS);
  if (typeof timer.unref === "function") timer.unref();
}

export function stopInstanceHeartbeat(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (!ownPort) return;
  try {
    fs.rmSync(lockFile(ownPort), { force: true });
  } catch {
    /* 进程正在退出，删不掉也会被下次的陈旧判定清掉 */
  }
  ownPort = 0;
}

/** 当前还在同一个数据目录上心跳的实例（含自己） */
export function liveInstances(): InstanceInfo[] {
  const out: InstanceInfo[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(DATA_DIR).filter((n) => n.startsWith(".instance-") && n.endsWith(".json"));
  } catch {
    return out;
  }
  for (const n of names) {
    const p = path.join(DATA_DIR, n);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > STALE_MS) continue;
      const info = JSON.parse(fs.readFileSync(p, "utf8")) as InstanceInfo;
      if (typeof info.port === "number") out.push(info);
    } catch {
      /* 读不到或不是 JSON：交给陈旧判定清理 */
    }
  }
  return out.sort((a, b) => a.port - b.port);
}

/** 除本进程外还在跑的实例 */
export function otherInstances(): InstanceInfo[] {
  return liveInstances().filter((i) => i.pid !== process.pid);
}
