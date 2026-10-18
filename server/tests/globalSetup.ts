/**
 * server project 开跑前把 data-test 整个删掉，让本地和 CI 从同一个起点出发。
 *
 * 为什么必须删：这个目录是**持久**夹具，历次测试创建的员工不会被回收。实测累积到 294 人时，
 * `attendance-verdicts-parity` 里那次全月装配（走的是生产逻辑，要遍历全库员工）从 975 ms
 * 涨到越过 vitest 默认的 5 秒超时 —— 而 CI 每次都是干净 runner，于是同一个 commit
 * 出现"CI 绿、本地红"，并且只会越来越红。这不是用例脆弱，是夹具被当成了缓存。
 *
 * 只删目录、不碰 `data/`（开发库）：路径由 server project 的 env.DATA_DIR 决定，这里取同名。
 */
import fs from "node:fs";
import path from "node:path";

export default function resetFixtureDir(): void {
  const dir = path.resolve(process.cwd(), "data-test");
  fs.rmSync(dir, { recursive: true, force: true });
}
