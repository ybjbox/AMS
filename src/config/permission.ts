export const roles = ['admin', 'manager', 'employee'];

export const permissions: Record<string, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'dashboard:view',
    'users:view',
    'attendance:view', 
    'attendance:edit',
    'todos:view',
    'documents:view'
  ],
  EMPLOYEE: [
    'dashboard:view',
    'attendance:view',
    'todos:view',
    'documents:view'
  ]
};
