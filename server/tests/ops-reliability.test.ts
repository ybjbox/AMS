/**
 * 运维可靠性回归（批次 3）。全部在临时 DATA_DIR 的子进程里跑，
 * 不碰 data-test 也不碰开发库——这里要验的恰恰是"文件与卷"层面的行为。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROBE = fileURLToPath(new URL("./fixtures/ops-probe.ts", import.meta.url));

interface ProbeResult {
  healthUp: number;
  healthDown: number;
  healthBackUp: number;
  templatesInDataDir: boolean;
  customSurvivesSeed: boolean;
  bundleSeeded: boolean;
  writtenOnDisk: boolean;
  prunedByCount: number;
  remainAfterCountPrune: number;
  prunedByBytes: number;
  keepsNewest: boolean;
  atLeastOneKept: boolean;
  freeBytesPositive: boolean;
  seesOtherInstance: boolean;
  ignoresStaleInstance: boolean;
  selfFileRemoved: boolean;
}

function runProbe(): ProbeResult {
  const dataDir = mkdtempSync(path.join(tmpdir(), "ams-ops-"));
  const out = execFileSync(process.execPath, ["--import", "tsx", PROBE], {
    encoding: "utf8",
    env: { ...process.env, DATA_DIR: dataDir },
  });
  const line = out.split("\n").find((l) => l.startsWith("AMS_PROBE "));
  if (!line) throw new Error("探针没有输出 AMS_PROBE 结果行");
  return JSON.parse(line.slice("AMS_PROBE ".length)) as ProbeResult;
}

describe("探针状态码", () => {
  it("库可用 200 / 库不可用 503，恢复连接后又回到 200", () => {
    const r = runProbe();
    expect(r.healthUp).toBe(200);
    // 这一条治的是"容器一直 healthy 地写着失败"：探针只看 r.ok，状态码不表态就等于永远通过
    expect(r.healthDown).toBe(503);
    expect(r.healthBackUp).toBe(200);
  });
});

describe("导出脚本模板住在数据卷里", () => {
  it("模板目录指向 DATA_DIR，管理员改过的那份不会被镜像种子覆盖", () => {
    const r = runProbe();
    expect(r.templatesInDataDir).toBe(true);
    expect(r.customSurvivesSeed).toBe(true);
    expect(r.writtenOnDisk).toBe(true);
  });
});

describe("备份滚动清理", () => {
  it("retentionDays=0 时份数上限仍然生效（每份都带快照，不设上界会写满磁盘）", () => {
    const r = runProbe();
    expect(r.prunedByCount).toBe(5);
    expect(r.remainAfterCountPrune).toBe(3);
  });

  it("按总量清理时保留最新的、至少保一份", () => {
    const r = runProbe();
    expect(r.prunedByBytes).toBeGreaterThanOrEqual(1);
    expect(r.keepsNewest).toBe(true);
    expect(r.atLeastOneKept).toBe(true);
  });

  it("能读到卷上剩余空间（备份前的容量预检依赖它）", () => {
    expect(runProbe().freeBytesPositive).toBe(true);
  });
});

describe("同一数据目录上的多实例可见", () => {
  it("看得见别人的心跳、忽略已死的陈旧登记，退出时收掉自己的", () => {
    const r = runProbe();
    // 恢复备份要靠这份清单决定 409：看不见别的实例就等于放任"另一台静默丢写"
    expect(r.seesOtherInstance).toBe(true);
    expect(r.ignoresStaleInstance).toBe(true);
    expect(r.selfFileRemoved).toBe(true);
  });
});
