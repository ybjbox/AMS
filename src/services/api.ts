import axios, { AxiosRequestConfig } from 'axios';
import { STORAGE_KEYS, EVENT_KEYS } from '../config/constants';
import { ApiErrorResponse } from '../types';

// Create an Axios instance with default configuration
const api = axios.create({
  // In development, Vite proxy will handle this if configured, or it will hit the same host.
  // In production, Nginx will proxy /api to the Python backend.
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling common errors
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (!error.response) {
      // Handle network errors or server downtime
      window.dispatchEvent(
        new CustomEvent(EVENT_KEYS.API_ERROR, {
          detail: {
            title: '网络请求失败',
            message: '请检查网络或联系管理员',
            type: 'error',
          },
        })
      );
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized globally
    if (error.response.status === 401) {
      // 关键：只有「持有 token 时收到的第一个 401」才广播事件。
      // 否则 401 → API_ERROR → addNotification(POST /notifications) → 401 会形成无限弹 toast 循环
      const hadToken = !!localStorage.getItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_INFO);

      if (hadToken) {
        // 抛出自定义事件，交由顶层组件处理通知
        window.dispatchEvent(
          new CustomEvent(EVENT_KEYS.API_ERROR, {
            detail: {
              title: '身份验证失败',
              message: '登录已过期，请重新登录',
              type: 'warning',
            },
          })
        );

        // 抛出自定义事件，交由 React Router 或顶层组件处理跳转
        window.dispatchEvent(new CustomEvent(EVENT_KEYS.AUTH_EXPIRED));
      }
    }

    const errorData = (error.response?.data || error.response || error) as ApiErrorResponse;
    return Promise.reject(errorData);
  }
);

export const http = {
  // 拦截器已把 AxiosResponse 解包为 response.data（下层类型系统无法自动推断），
  // 因此这里显式断言为 T（axios 1.18+ 的返回类型变更引入）。
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => api.get(url, config) as Promise<T>,
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    api.post(url, data, config) as Promise<T>,
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
    api.put(url, data, config) as Promise<T>,
  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => api.delete(url, config) as Promise<T>,
};

/**
 * 二进制上传（raw body）：axios 实例的拦截器与默认 Content-Type 都面向 JSON，
 * Excel 导入这类"整份文件直传"走 fetch，避免 base64 内存放大（见 AUDIT P2-4）。
 * 目前消费方：员工导入 /api/users/import、考勤导入 /api/attendance/records/import。
 */
export async function sendBinary<T>(url: string, blob: Blob): Promise<T> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: blob,
  });
  if (!res.ok) {
    let err: unknown;
    try {
      err = await res.json();
    } catch {
      err = { error: `HTTP ${res.status}` };
    }
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * 直接下载链接（审计 CSV 导出、备份文件下载）无法走 axios 拦截器，
 * 用 access_token 查询参数携带凭据。后端 authGate 仅对文件下载类端点放行 query token。
 */
export function withAuthToken(url: string): string {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}
