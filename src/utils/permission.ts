import { useUserStore } from '../store/useUserStore';
import { useAppSettings } from '../store/appSettings';
import { usePermissionsStore } from '../store/permissions';

/**
 * 检查当前登录用户是否具有指定的权限（体验层显隐判断；硬约束在后端策略表）。
 *
 * 数据源是 usePermissionsStore（权限矩阵面板编辑的就是它，zustand persist）。
 * 此前这里读的是 config 静态字典——矩阵面板改了也不生效，两份真相漂移；
 * #14 对齐后 config 只作为 store 的初始值 /「恢复默认」来源。
 * 矩阵修改对新挂载的组件即时生效，已挂载组件在路由切换后生效。
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

  // 将角色转换为大写以匹配权限矩阵的键
  const userRole = userInfo.role.toUpperCase();
  const rolePermissions = usePermissionsStore.getState().permissions[userRole] || [];

  // 如果角色拥有 '*' 权限，则代表拥有所有权限
  if (rolePermissions.includes('*')) {
    return true;
  }

  // 检查是否包含具体的权限代码
  return rolePermissions.includes(permissionCode);
}
