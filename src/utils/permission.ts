import { useUserStore } from '../store/useUserStore';
import { useAppSettings } from '../store/appSettings';
import { permissions } from '../config/permission';

/**
 * 检查当前登录用户是否具有指定的权限
 * @param permissionCode 权限代码，例如 'attendance:view'
 * @returns boolean
 */
export function hasPermission(permissionCode: string): boolean {
  // 获取严格权限拦截开关状态
  const enableStrictPermission = useAppSettings.getState().enableStrictPermission;

  // 如果未开启严格权限拦截，默认返回 true
  if (!enableStrictPermission) {
    return true;
  }

  // 获取当前用户信息
  const userInfo = useUserStore.getState().userInfo;
  
  // 如果未登录或没有角色信息，默认无权限
  if (!userInfo || !userInfo.role) {
    return false;
  }

  // 将角色转换为大写以匹配 permissions 字典的键
  const userRole = userInfo.role.toUpperCase();
  const rolePermissions = permissions[userRole] || [];

  // 如果角色拥有 '*' 权限，则代表拥有所有权限
  if (rolePermissions.includes('*')) {
    return true;
  }

  // 检查是否包含具体的权限代码
  return rolePermissions.includes(permissionCode);
}
