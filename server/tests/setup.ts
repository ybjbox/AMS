/**
 * server project 每个测试文件执行一次的夹具准备。
 *
 * 这些测试用的是**固定用户名**（branding-super、gate_hr、ceiling_target…），而删除账号会给
 * 用户名立墓碑（`accounts` 没有代理主键，username 就是全站归属键；不挡复用会让同名账号直接
 * 继承上一个人在的待办、审批余额与个人模型配置 —— 见 authDb 的 account_tombstones 注释）。
 *
 * 生产里这个拦截正是目的本身，并且有专测覆盖：`data-consistency-batch4.test.ts` 与
 * `scripts/verify-auth.mjs` 都断言「同名重建 → 409」。这里清的是**测试夹具状态**，
 * 不是给产品开口子：否则第二个开始的文件全会卡在「用户名不能复用」上。
 *
 * 刻意不 import ../db.ts：有些测试文件自己设 `process.env.DATA_DIR` 再动态 import 数据层
 * （import-async / backup-uploads 都要独立临时库）。本文件一旦被加载过的那条连接把它们
 * 的库指回 data-test，写进去的数据就会留在共用库里 —— 这里只按 env 直接开一条短连接。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR;
const file = dataDir ? path.join(dataDir, "ams.db") : "";

if (file && fs.existsSync(file)) {
  const db = new DatabaseSync(file);
  try {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_tombstones'").get()) {
      db.exec("DELETE FROM account_tombstones");
    }
  } finally {
    db.close();
  }
}
