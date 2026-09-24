import { StoreApi } from 'zustand';
import { describeSaveError } from './saveFailureCore';

export interface AsyncState {
  isLoading: boolean;
  error: string | null;
}

/**
 * 统一的异步动作包装。返回 null 表示成功、否则是给人看的失败原因。
 *
 * 之所以要把错误**返回给调用方**：以前它只写进 `state.error`，而 4xx/5xx 在 api.ts 里既不弹
 * toast 也不广播事件，于是"点删除 → 后端 403 → 界面什么都没发生"；异常分析那条更糟，
 * 调用方 catch 永不触发，失败也照样 toast.success。返回错误串让这两类静默失败可被修掉，
 * 同时不改变忽略返回值的老调用方的行为。
 */
export async function createAsyncAction<TStore extends AsyncState>(
  set: StoreApi<TStore>['setState'],
  action: () => Promise<Partial<TStore> | void>
): Promise<string | null> {
  set({ isLoading: true, error: null } as Partial<TStore>);
  try {
    const result = await action();
    if (result) {
      set({ ...result, isLoading: false } as Partial<TStore>);
    } else {
       set({ isLoading: false } as Partial<TStore>);
    }
    return null;
  } catch (error: unknown) {
    // api.ts 拦截器对 4xx/5xx reject 的是 { error } 纯对象，String() 会得到 "[object Object]"
    const message = describeSaveError(error, '操作失败');
    set({ error: message, isLoading: false } as Partial<TStore>);
    return message;
  }
}
