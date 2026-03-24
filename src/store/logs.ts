import { create } from 'zustand';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: string;
  source?: string;
}

interface LogStore {
  logs: LogEntry[];
  addLog: (level: LogLevel, message: string, details?: string, source?: string) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [
    {
      id: '1',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      level: 'INFO',
      message: '系统启动成功',
      source: 'System'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      level: 'WARN',
      message: '检测到未知的登录尝试',
      source: 'AuthService'
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      level: 'ERROR',
      message: '数据库连接超时',
      details: 'Connection timeout after 5000ms',
      source: 'Database'
    }
  ],
  addLog: (level, message, details, source) => set((state) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      source
    };
    return { logs: [newLog, ...state.logs].slice(0, 1000) }; // Keep last 1000 logs
  }),
  clearLogs: () => set({ logs: [] })
}));

export const addSystemLog = (level: LogLevel, message: string, details?: string, source?: string) => {
  useLogStore.getState().addLog(level, message, details, source);
};
