import axios from 'axios';

// 创建 axios 实例
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
});

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 自动从 localStorage 中获取 token (兼容项目中使用的 app_auth_token)
    const token = localStorage.getItem('app_auth_token') || localStorage.getItem('token');
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 统一解构并返回 response.data
    return response.data;
  },
  (error) => {
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        // 清除本地的 token 并跳转到登录页
        localStorage.removeItem('app_auth_token');
        localStorage.removeItem('token');
        window.location.href = '/login';
      } else {
        // 其他错误，统一进行 console 打印
        console.error(`[API Error] ${status}:`, error.response.data);
        
        // message 错误提示 
        // (此处使用 alert 模拟，实际项目中可替换为 antd/element-plus 的 message.error)
        const errorMsg = error.response.data?.message || error.response.data?.msg || `请求发生错误 (${status})`;
        alert(errorMsg);
      }
    } else {
      // 处理断网或请求超时等情况
      console.error('[Network Error]:', error.message);
      alert('网络连接异常，请检查网络设置');
    }
    
    return Promise.reject(error);
  }
);

export default request;
