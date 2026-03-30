import axios, { AxiosRequestConfig } from 'axios';

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
    const token = localStorage.getItem('token');
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
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: {
          title: '网络请求失败',
          message: '请检查网络或联系管理员',
          type: 'error'
        }
      }));
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized globally
    if (error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // 抛出自定义事件，交由顶层组件处理通知
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: {
          title: '身份验证失败',
          message: '登录已过期，请重新登录',
          type: 'warning'
        }
      }));

      // 抛出自定义事件，交由 React Router 或顶层组件处理跳转
      window.dispatchEvent(new CustomEvent('auth-expired'));
    }
    
    return Promise.reject(error.response.data || error.response || error);
  }
);

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => api.get(url, config),
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => api.post(url, data, config),
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => api.put(url, data, config),
  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => api.delete(url, config),
};
