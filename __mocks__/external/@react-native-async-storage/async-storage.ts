/** AsyncStorage fake for jest: the persist middleware only calls
 *  getItem/setItem/removeItem through the ASR store's KV adapter. The
 *  official jest mock resolves its default export to undefined under
 *  this setup (probed), so the singleton's static import needs a shape
 *  that actually answers. Keep the surface minimal and additive. */

const store = new Map<string, string>();

const fake = {
  async getItem(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async clear(): Promise<void> {
    store.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
};

export default fake;
export const __asrMockStore = store;

// SAFETY: AsyncStorage's jest surface is the KV triple plus these two;
// the type system checks the default export, the namespace spread keeps
// `import * as` consumers whole.
export const AsyncStorage = fake;
