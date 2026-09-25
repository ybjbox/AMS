import { useUserStore } from '../store/useUserStore';

/**
 * 界面显隐的唯一数据源：登录时由服务端按鉴权策略表算出、随会话下发的能力码列表
 * （server/capabilities.ts）。真正的强制始终在后端 authGate，这里只决定看不看得到。
 *
 * 此前它查的是 localStorage 里可编辑的权限矩阵，还被一个默认关闭的开关整体短路
 * （默认状态下对所有码返回 true）—— 两套并行真相，且第二套基本没生效。
 * 下发列表缺失时一律判无权限：让旧会话重新登录一次，比按旧矩阵放行更安全。
 */
export function hasPermission(permissionCode: string): boolean {
  const user = useUserStore.getState().userInfo as { permissions?: unknown } | null;
  if (!user) return false;
  const list = user.permissions;
  if (!Array.isArray(list)) return false;
  return list.includes('*') || list.includes(permissionCode);
}
