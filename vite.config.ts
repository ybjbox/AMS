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
