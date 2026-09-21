import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // .design-qa 是 Design QA 工具的本地产物目录（已在 .gitignore 里），不是项目源码
  { ignores: ['dist', 'node_modules', 'data', 'data-test', 'coverage', '.design-qa'] },
  // 基础规则覆盖全仓（含安全最敏感的 server/ 与 scripts/）
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,mjs,cjs,js}'],
    languageOptions: {
      ecmaVersion: 2022,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        // _ 前缀 = 刻意保留的占位形参（Express 错误中间件必须四形参、包装器必须同签名）；
        // catch 到的错误不引用是本仓惯用的「显式吞掉」，不算未用变量
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  // scripts/ 下的 verify-* 是一次性联调探针：不进构建、不上生产，
  // 那里宽松一点（any / 空 catch / 先赋初值再分支）换掉整片噪音，让 CI 门禁盯在真正的源码上
  {
    files: ['scripts/**/*.{ts,mjs,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  // React 专属规则只作用于前端源码
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  eslintConfigPrettier
);
