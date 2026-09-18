/**
 * 导出相关 API：Excel 导出（服务端 ExcelJS 生成 + 下载）、主题（/api/themes）、脚本模板（/api/export-templates）。
 */
import { http } from './api';

export interface ExcelTheme {
  id: string;
  name: string;
  titleFill: string;
  headerFill: string;
  headerFontColor: string;
  zebraFill: string;
}

export interface ExportTemplate {
  name: string;
  code: string;
}

/** 服务端契约（server.ts /api/export/employees）：columns 为 { header, key } */
export interface EmployeeExportConfig {
  title: string;
  columns: { header: string; key: string }[];
  includeResigned: boolean;
  themeId?: string;
  mode?: 'theme' | 'script';
  templateName?: string;
}

export const exportApi = {
  fetchThemes: (): Promise<Record<string, ExcelTheme>> => http.get('/themes'),

  saveThemes: (themes: Record<string, ExcelTheme>): Promise<{ success: boolean; themes: Record<string, ExcelTheme> }> =>
    http.post('/themes', { themes }),

  listTemplates: (): Promise<ExportTemplate[]> => http.get('/export-templates'),

  saveTemplate: (name: string, code: string): Promise<{ success: boolean; name: string }> =>
    http.post('/export-templates', { name, code }),

  deleteTemplate: (name: string): Promise<{ success: boolean }> =>
    http.delete(`/export-templates/${encodeURIComponent(name)}`),
};

/**
 * 导出员工花名册并触发浏览器下载。
 * 响应是 xlsx 二进制流（拦截器解包后为 Blob）；服务端出错时返回 JSON，
 * 这里按 type 识别并转成 Error，避免把错误 JSON 存成 .xlsx。
 */
export async function downloadEmployeeExport(
  data: Record<string, unknown>[],
  config: EmployeeExportConfig
): Promise<void> {
  const blob = await http.post<Blob>(
    '/export/employees',
    { data, config },
    { responseType: 'blob', timeout: 120000 }
  );
  if (blob.type.includes('application/json')) {
    let message = '导出失败';
    try {
      message = (JSON.parse(await blob.text()) as { error?: string }).error ?? message;
    } catch {
      /* 非 JSON 错误体按默认信息处理 */
    }
    throw new Error(message);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.title}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
