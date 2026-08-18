/**
 * C3：打印专用灰阶令牌（从界面 zinc/gray 灰阶派生，集中定义，避免与界面灰阶漂移）。
 *
 * 使用方：
 * - 主文档打印（DocumentsPrintTemplate / PrintTemplates / constants.ts 的内联 style）：
 *   由 main.tsx 在启动时把本块注入到主文档 :root，故这些组件可直接用 var(--print-*)。
 * - 独立打印窗口（printHtml.ts 的 buildLabel/ContactCard/Roster/AddressBook）：
 *   因是单独 document，printHtml.ts 在生成 <style> 时内联同一份变量。
 *
 * 调整界面灰阶时，若希望打印同步，请更新此处（单一事实来源）。
 */
export const printTokensCss = `:root{
  --print-strong:#111827;
  --print-doc-title:#1f2937;
  --print-body:#6b7280;
  --print-soft:#9ca3af;
  --print-muted-fg:#64748b;
  --print-muted-bg:#f8fafc;
  --print-heading:#475569;
  --print-border:#d1d5db;
  --print-border-soft:#e5e7eb;
  --print-border-strong:#000;
}`;
