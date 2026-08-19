export type BrowserStorageScope = "local" | "session";

const memoryFallback = new Map<string, string>();

function fallbackKey(scope: BrowserStorageScope, key: string) {
  return `${scope}:${key}`;
}

function browserStorage(scope: BrowserStorageScope): Storage | undefined {
  try {
    return scope === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function getBrowserItem(scope: BrowserStorageScope, key: string): string | null {
  try {
    const value = browserStorage(scope)?.getItem(key);
    if (value !== undefined && value !== null) return value;
  } catch {
    // Storage can be disabled by the browser. Keep the current tab usable in memory.
  }
  return memoryFallback.get(fallbackKey(scope, key)) ?? null;
}

export function setBrowserItem(scope: BrowserStorageScope, key: string, value: string): void {
  try {
    const storage = browserStorage(scope);
    if (storage) {
      storage.setItem(key, value);
      memoryFallback.delete(fallbackKey(scope, key));
      return;
    }
  } catch {
    // Fall through to the in-memory store when browser storage is unavailable.
  }
  memoryFallback.set(fallbackKey(scope, key), value);
}

export function removeBrowserItem(scope: BrowserStorageScope, key: string): void {
  try {
    browserStorage(scope)?.removeItem(key);
  } catch {
    // The in-memory copy is still cleared below.
  }
  memoryFallback.delete(fallbackKey(scope, key));
}
