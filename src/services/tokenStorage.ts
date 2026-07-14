import * as SecureStore from "expo-secure-store";

export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<void>;
  removeAccessToken(): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearTokens(): Promise<void>;
}

const ACCESS_TOKEN_KEY = "tripmatch.access-token";
const REFRESH_TOKEN_KEY = "tripmatch.refresh-token";

export const nativeTokenStorage: TokenStorage = {
  getAccessToken: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  setAccessToken: async (token) => { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token); },
  removeAccessToken: async () => { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); },
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: async (token) => { await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token); },
  clearTokens: async () => { await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]); },
};
