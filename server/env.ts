/**
 * 环境变量加载 — 必须作为 server.ts 的第一个 import。
 *
 * ESM 按导入顺序求值，放在首位才能保证 authDb 的首启种子逻辑
 * （读取 AMS_ADMIN_PASSWORD）等任何模块级 env 消费者之前就绪。
 * 优先级：真实进程环境变量 > .env.local > .env（dotenv 不覆盖已存在变量）。
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
