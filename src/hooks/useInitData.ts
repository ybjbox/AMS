import { useEffect } from 'react';
import { useUserStore as useUsersStore } from '../store/users';
import { useUserStore } from '../store/useUserStore';
import { useEmployeeReminders } from './useEmployeeReminders';

export function useInitData() {
  const userInfo = useUserStore(state => state.userInfo);
  const fetchUsers = useUsersStore(state => state.fetchUsers);

  useEffect(() => {
    if (userInfo) {
      fetchUsers();
    }
  }, [userInfo, fetchUsers]);

  // Handle employee reminders
  useEmployeeReminders();
}
