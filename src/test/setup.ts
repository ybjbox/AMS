import '@testing-library/jest-dom';

// jsdom@29 + Vitest 4：window/document 就绪但 localStorage 缺失，
// zustand persist 与 useUserStore 初始化依赖它，这里补一个内存实现。
if (typeof globalThis.localStorage === 'undefined') {
  const memory = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return memory.size;
    },
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}
