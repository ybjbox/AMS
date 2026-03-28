import axios from 'axios';
import { useTodoStore } from '../store/todos';

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
    if (error.response) {
      // Handle 401 Unauthorized globally
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // 使用现有的通知系统提示用户
        useTodoStore.getState().addNotification({
          title: '身份验证失败',
          message: '登录已过期，请重新登录',
          type: 'warning'
        });

        // 抛出自定义事件，交由 React Router 或顶层组件处理跳转
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
      return Promise.reject(error.response.data);
    }
    return Promise.reject(error);
  }
);

export default api;
