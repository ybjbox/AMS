import { useEffect } from 'react';
import { useEmployeeStore } from '../store/employees';
import { useUserStore } from '../store/useUserStore';
import { useEmployeeReminders } from './useEmployeeReminders';

export function useInitData() {
  const userInfo = useUserStore(state => state.userInfo);
  const fetchUsers = useEmployeeStore(state => state.fetchUsers);

  useEffect(() => {
    if (userInfo) {
      fetchUsers();
    }
  }, [userInfo, fetchUsers]);

  // Handle employee reminders
  useEmployeeReminders();
}
