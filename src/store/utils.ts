import { StoreApi } from 'zustand';

export interface AsyncState {
  isLoading: boolean;
  error: string | null;
}

export async function createAsyncAction<TStore extends AsyncState>(
  set: StoreApi<TStore>['setState'],
  action: () => Promise<Partial<TStore> | void>
): Promise<void> {
  set({ isLoading: true, error: null } as Partial<TStore>);
  try {
    const result = await action();
    if (result) {
      set({ ...result, isLoading: false } as Partial<TStore>);
    } else {
       set({ isLoading: false } as Partial<TStore>);
    }
  } catch (error: unknown) {
    set({
      error: error instanceof Error ? error.message : String(error),
      isLoading: false,
    } as Partial<TStore>);
  }
}
