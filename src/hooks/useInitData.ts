import { useEffect } from 'react';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { useTodoStore } from '../store/useTodoStore';
import { useUserStore } from '../store/useUserStore';
import { authService, toUserInfo } from '../services/auth';

export function useInitData() {
  const userInfo = useUserStore((state) => state.userInfo);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);
  const fetchTodos = useTodoStore((state) => state.fetchTodos);

  // 启动时以服务端为准校对一次会话与权限表。
  // 缓存里那份可能是被降权**之前**的（改了角色要重登才生效 = 一路点了必 403），
  // 也可能对应一个已经过期的会话（401 由 api.ts 拦截器统一收口：清 store + 跳登录）。
  useEffect(() => {
    const { token } = useUserStore.getState();
    if (!token) return;
    authService
      .me()
      .then(({ user }) => {
        const next = toUserInfo(user);
        const store = useUserStore.getState();
        if (!store.token) return; // 期间已被登出，别把会话又写回去
        if (JSON.stringify(store.userInfo) !== JSON.stringify(next)) store.setUser(next, store.token);
      })
      .catch(() => {
        /* 网络故障时沿用缓存；401 已由拦截器处理 */
      });
  }, []);

  useEffect(() => {
    if (userInfo) {
      fetchUsers();
      // 全局拉取待办：侧边栏未完成角标需要在任何页面都可用（不仅 Todos 页）
      fetchTodos();
    }
  }, [userInfo, fetchUsers, fetchTodos]);
}
