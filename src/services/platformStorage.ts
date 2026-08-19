import * as SecureStore from "expo-secure-store";

export type StorageOptions = SecureStore.SecureStoreOptions;

export interface KeyValueStorage {
  getItemAsync(key: string, options?: StorageOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: StorageOptions): Promise<void>;
  deleteItemAsync(key: string, options?: StorageOptions): Promise<void>;
}

// 자격 정보는 iOS Keychain / Android Keystore에 맡긴다.
export const credentialStorage: KeyValueStorage = {
  getItemAsync: (key, options) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value, options) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key, options) => SecureStore.deleteItemAsync(key, options),
};

// 설치 식별자는 비밀값은 아니지만 재설치 전까지 같은 값을 유지해야 한다.
export const deviceStorage: KeyValueStorage = credentialStorage;
