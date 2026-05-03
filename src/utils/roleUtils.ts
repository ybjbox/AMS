/**
 * 将角色代码转为中文显示名称
 * 统一在 Sidebar、UserMenu 等所有角色显示处引用此函数
 */
export function getRoleDisplayName(role?: string | null): string {
  if (!role) return '未知角色';
  switch (role.toUpperCase()) {
    case 'SUPER_ADMIN': return '超级管理员';
    case 'ADMIN':       return '管理员';
    case 'HR':          return '人事主管';
    case 'EMPLOYEE':    return '普通员工';
    default:            return role;
  }
}
