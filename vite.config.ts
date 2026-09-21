import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      // 构建产物分包策略：vendor 与业务代码分离。
      // 目的：浏览缓存命中率——业务代码频繁发版（hash 变化），
      // 而 react 等框架/库不常变，分离后可长期命中缓存（配合 assets immutable 头）。
      // 同时避免单 chunk 过大（>500KB）导致的首屏加载阻塞。
      rollupOptions: {
        output: {
          manualChunks: {
            // React 核心（全局依赖，最长命中）
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // 动画库（体积较大）
            'vendor-motion': ['motion'],
          },
        },
      },
    },
    test: {
      globals: true,
      projects: [
        {
          resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
          test: {
            name: 'client',
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/test/setup.ts',
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
          },
        },
        {
          resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
          test: {
            name: 'server',
            globals: true,
            environment: 'node',
            include: ['server/tests/**/*.test.ts'],
            // 独立数据目录，与开发库 data/ams.db 完全隔离
            env: { DATA_DIR: 'data-test' },
            // 全部用例共用 data-test 这一个 SQLite 文件：并行跑会互抢写锁（database is locked），
            // 全新库上还会两个进程同时 seed 撞 employees 主键。
            // Vitest 4 已删除 test.poolOptions —— 写了会被静默忽略（启动日志只提示一句
            // "poolOptions was removed"），串行必须用顶层 pool + maxWorkers: 1 表达。
            pool: 'forks',
            maxWorkers: 1,
          },
        },
      ],
    },
    server: {
      // 调试需要时可设 DISABLE_HMR=true 临时禁用前端 HMR（默认启用）
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
