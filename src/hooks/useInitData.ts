import { useEffect } from 'react';
import { useUserStore } from '../store/users';
import { useAuth } from '../store/auth';
import { useEmployeeReminders } from './useEmployeeReminders';

export function useInitData() {
  const user = useAuth(state => state.user);
  const fetchUsers = useUserStore(state => state.fetchUsers);

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  // Handle employee reminders
  useEmployeeReminders();
}
