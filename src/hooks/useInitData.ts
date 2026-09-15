import { useEffect } from 'react';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { useTodoStore } from '../store/useTodoStore';
import { useUserStore } from '../store/useUserStore';
import { useEmployeeReminders } from './useEmployeeReminders';

export function useInitData() {
  const userInfo = useUserStore((state) => state.userInfo);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);
  const fetchTodos = useTodoStore((state) => state.fetchTodos);

  useEffect(() => {
    if (userInfo) {
      fetchUsers();
      // 全局拉取待办：侧边栏未完成角标需要在任何页面都可用（不仅 Todos 页）
      fetchTodos();
    }
  }, [userInfo, fetchUsers, fetchTodos]);

  // Handle employee reminders
  useEmployeeReminders();
}
