import { SystemRole } from '../types/user';

export const permissions: Record<string, string[]> = {
  [SystemRole.SUPER_ADMIN]: ['*'],
  [SystemRole.ADMIN]: ['*'],
  [SystemRole.HR]: ['dashboard:view', 'users:view', 'attendance:view', 'attendance:edit', 'todos:view', 'documents:view'],
  [SystemRole.EMPLOYEE]: ['dashboard:view', 'attendance:view', 'todos:view', 'documents:view'],
};
