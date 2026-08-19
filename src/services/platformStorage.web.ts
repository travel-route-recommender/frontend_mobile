import type { SecureStoreOptions } from "expo-secure-store";

export type StorageOptions = SecureStoreOptions;

export interface KeyValueStorage {
  getItemAsync(key: string, options?: StorageOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: StorageOptions): Promise<void>;
  deleteItemAsync(key: string, options?: StorageOptions): Promise<void>;
}

// expo-secure-store는 웹을 지원하지 않는다. 웹 번들에서는 네이티브 모듈이 빈 객체로
// 해석돼 getValueWithKeyAsync 호출이 곧바로 터진다(ExpoSecureStore.web.js 참고).
//
// 브라우저에는 Keychain/Keystore에 대응하는 저장소가 없다. localStorage에 Refresh Token을
// 두면 XSS에 그대로 노출되므로 자격 정보는 디스크에 남기지 않고 메모리에만 둔다.
// 새로고침하면 세션이 끊기며, 이는 백엔드가 HttpOnly 쿠키를 내려주면 해소된다.
const credentials = new Map<string, string>();

export const credentialStorage: KeyValueStorage = {
  getItemAsync: async (key) => credentials.get(key) ?? null,
  setItemAsync: async (key, value) => { credentials.set(key, value); },
  deleteItemAsync: async (key) => { credentials.delete(key); },
};

// 설치 식별자는 비밀값이 아니라 안정적인 기기 식별자다. 매 새로고침마다 바뀌면
// 서버가 같은 브라우저를 다른 기기로 세므로 localStorage에 남긴다.
export const deviceStorage: KeyValueStorage = {
  getItemAsync: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItemAsync: async (key, value) => { globalThis.localStorage?.setItem(key, value); },
  deleteItemAsync: async (key) => { globalThis.localStorage?.removeItem(key); },
};
