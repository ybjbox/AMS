import { AttendanceRecord } from '../types';

export const attendanceService = {
  // Fetch attendance records with optional filters
  getRecords: async (): Promise<AttendanceRecord[]> => {
    // In a real app, this would call the Python backend:
    // return http.get<AttendanceRecord[]>('/attendance', { params });

    // For now, we return mock data as requested
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: '1',
            userId: 'U001',
            userName: '张三',
            department: '技术部',
            date: '2024-03-20',
            checkIn: '08:55',
            checkOut: '18:05',
            status: 'normal',
            workHours: 8,
          },
          {
            id: '2',
            userId: 'U002',
            userName: '李四',
            department: '市场部',
            date: '2024-03-20',
            checkIn: '09:15',
            checkOut: '18:30',
            status: 'late',
            workHours: 7.5,
          },
        ]);
      }, 500);
    });
  },

  // Upload Excel or Image for processing by Python backend
  uploadFile: async (file: File, type: 'excel' | 'image'): Promise<{ success: boolean; message: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    // This would send the file to the Python backend for processing
    // return http.post<{ success: boolean; message: string }>('/attendance/upload', formData, {
    //   headers: {
    //     'Content-Type': 'multipart/form-data',
    //   },
    // });

    // Mock response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, message: '文件上传成功，正在后台处理中...' });
      }, 1000);
    });
  },

  // Trigger automatic analysis rule calculation on the backend
  triggerAnalysis: async (): Promise<{ success: boolean; message: string }> => {
    // return http.post<{ success: boolean; message: string }>('/attendance/analyze', dateRange);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, message: '考勤分析任务已提交' });
      }, 800);
    });
  },
};
