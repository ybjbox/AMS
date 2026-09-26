/**
 * 每轮运行换一个用户名后缀。
 *
 * 删除账号会把那个用户名**永久下架**（`account_tombstones`，批次 4）：username 是本系统唯一的
 * 归属键（审批 applicant、待办 assignee、打印偏好 owner、AI 对话与个人模型配置都按它查），
 * 同名重建会让新账号直接继承上一个人在的待办、审批余额和 API Key。
 *
 * e2e 原先用固定名 + 每轮删号，正是被这条规则挡住的那种用法 —— 拦截本身有专测覆盖
 * （`scripts/verify-auth.mjs` 与 `server/tests/data-consistency-batch4.test.ts` 都断言
 * 「同名重建 → 409」），所以这里不去擦墓碑，而是像真实使用一样换名。
 */
const RUN_ID =
  process.env.AMS_E2E_RUN ??
  `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;

/** 拼出合规（[a-zA-Z0-9._-]{3,32}）且本轮唯一的用户名 */
export function acct(base: string): string {
  return `${base}-${RUN_ID}`.slice(0, 32);
}
