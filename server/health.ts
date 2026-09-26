/**
 * 探针用的健康判定（`GET /api/health`）。
 *
 * 单独成模块只为了一个理由：状态码必须能反映"这个实例还能不能服务"，
 * 而这条判断以前恒返回 200（只把 body 的 status 改成 degraded）——
 * Docker/compose 的探活读的是 r.ok，于是磁盘满、库坏了容器仍然 healthy，
 * `restart: unless-stopped` 永远等不到它介入。
 *
 * 严格与详细分家：这里保持最小面（不泄露路径/表名/版本细节，它挂在公开白名单上），
 * 磁盘剩余、备份是否还活着、schema 版本等运维信息在 /api/system/diagnostics（仅管理员）。
 */
import { db } from "./db.ts";

export interface HealthBody {
  status: "ok" | "degraded";
  db: "up" | "down";
  uptimeSec: number;
  memMB: number;
  version: string;
}

/** 一次探活：状态码 + 响应体。轻量（单条 SELECT 1），不做重量级查询。 */
export function probeHealth(version: string): { code: number; body: HealthBody } {
  const mem = process.memoryUsage();
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }
  return {
    code: dbOk ? 200 : 503,
    body: {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      uptimeSec: Math.round(process.uptime()),
      memMB: Math.round(mem.heapUsed / 1024 / 1024),
      version,
    },
  };
}
