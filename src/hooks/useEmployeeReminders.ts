import { useEffect, useRef } from 'react';
import { useAuth } from '../store/auth';
import { useUserStore } from '../store/users';
import { useTodoStore } from '../store/todos';

export function useEmployeeReminders() {
  const user = useAuth(state => state.user);
  const users = useUserStore(state => state.users);
  
  const contractExpiryDays = useTodoStore(state => state.settings.contractExpiryDays);
  const probationConversionDays = useTodoStore(state => state.settings.probationConversionDays);
  
  const hasCheckedReminders = useRef(false);

  useEffect(() => {
    if (!user || users.length === 0 || hasCheckedReminders.current) return;

    hasCheckedReminders.current = true;

    const timer = setTimeout(() => {
      const today = new Date();
      
      const { notifications, addTodo, addNotification } = useTodoStore.getState();
      
      users.forEach(emp => {
        if (emp.status === '离职') return;

        if (emp.contractExpiry) {
          const expiryDate = new Date(emp.contractExpiry);
          const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays > 0 && diffDays <= contractExpiryDays) {
            const title = '合同到期提醒';
            const message = `员工 ${emp.name} (${emp.id}) 的合同将于 ${emp.contractExpiry} 到期（剩余 ${diffDays} 天）`;
            
            addTodo({
              title,
              description: message,
              dueDate: emp.contractExpiry,
              type: 'contract',
              targetId: emp.id
            });

            const hasNotification = notifications.some(n => n.title === title && n.message === message);
            if (!hasNotification) {
              addNotification({ title, message, type: 'warning' });
            }
          }
        }

        if (emp.status === '试用期' && emp.joinDate) {
          const joinDate = new Date(emp.joinDate);
          const conversionDate = new Date(joinDate.setMonth(joinDate.getMonth() + 3));
          const diffDays = Math.ceil((conversionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays > 0 && diffDays <= probationConversionDays) {
            const dateStr = conversionDate.toISOString().split('T')[0];
            const title = '试用期转正提醒';
            const message = `员工 ${emp.name} (${emp.id}) 的试用期将于 ${dateStr} 结束（剩余 ${diffDays} 天）`;
            
            addTodo({
              title,
              description: message,
              dueDate: dateStr,
              type: 'probation',
              targetId: emp.id
            });

            const hasNotification = notifications.some(n => n.title === title && n.message === message);
            if (!hasNotification) {
              addNotification({ title, message, type: 'info' });
            }
          }
        }
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [users, contractExpiryDays, probationConversionDays, user]);
}
