#!/usr/bin/env node
/**
 * 校验 dist/ 确实是**生产构建**。构建退出码为 0 不等于产物是生产版：
 * 如果 `npm run build` 那一步的 NODE_ENV 是 development，vite 会把 `import.meta.env.DEV`
 * 折成 true（dev-only 的 UI 分支被编进包里），并把 **react-dom 开发版运行时**打进去。
 * 界面照常能用，所以这种包不会在任何功能测试里暴露出来。
 *
 * 2026-10-18 ECS 上线时真踩过：`export NODE_ENV=development` 写在脚本顶部是为了让 npm ci
 * 不推导 --omit=dev，却顺带把构建也带进了开发模式。实测代价 dist 5.1M（应为 4.4M）、
 * 最大 chunk 533558 字节（应为 378060），且登录页向匿名访客显示
 * 「开发模式 · 初始凭据见服务端启动日志」。
 *
 * 用 Node 而不是 shell：这条断言既要在 Linux 服务器上跑，也要在 Windows 开发机上跑。
 *
 * 用法：node deploy/assert-prod-build.mjs [dist 目录]     非 0 退出 = 不是生产构建，别上线
 */
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2] || "dist";
const assets = path.join(dist, "assets");

if (!fs.existsSync(assets) || !fs.statSync(assets).isDirectory()) {
  console.log(`assert-prod-build: 找不到 ${assets} —— 构建没产出任何资源`);
  process.exit(1);
}

/** 有多少个资源文件里出现了这个片段（按字节找，字体等二进制文件也不会被误解码） */
function countHits(needle) {
  let hits = 0;
  for (const name of fs.readdirSync(assets)) {
    const p = path.join(assets, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > 32 * 1024 * 1024) continue;
    if (fs.readFileSync(p).includes(needle)) hits++;
  }
  return hits;
}

let fail = 0;

// 1) 正向标志：生产版 React 的错误前缀只出现在 min 版里
if (countHits("Minified React error") > 0) {
  console.log("  ✓ 生产版 React（命中 Minified React error）");
} else {
  console.log("  ✗ 产物里没有「Minified React error」：打进去的不是生产版 React 运行时");
  fail = 1;
}

// 2) 反向：开发版 React 运行时绝不能出现
if (countHits("react-dom.development") > 0) {
  console.log("  ✗ 产物里含 react-dom.development：构建时 NODE_ENV 不是 production");
  fail = 1;
} else {
  console.log("  ✓ 无 react-dom.development");
}

// 3) 反向：dev 中间件的入口引用只会出现在源码态 index.html 里
//    （vite build 无论什么模式都会把它改写成 hash 引用，所以这条判的是
//     "服务在发源码态页面"那一类故障，与 1、2 判的构建模式互补）
const html = fs.readFileSync(path.join(dist, "index.html"), "utf-8");
if (/@vite\/client|\/src\/main\.tsx/.test(html)) {
  console.log("  ✗ index.html 引用了 vite dev 入口（/@vite/client 或 /src/main.tsx）");
  fail = 1;
} else {
  console.log("  ✓ index.html 引用的是打包后的 hash 产物");
}

if (fail) {
  console.log("assert-prod-build: 判定为**非生产构建**，拒绝上线");
  process.exit(1);
}
console.log(`assert-prod-build: 通过（${dist}）`);
