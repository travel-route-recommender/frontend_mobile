import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  completePendingRefresh,
  createAccessTokenState,
  isPendingRefreshRecoverable,
  parseStoredAuthState,
  recoverOrBeginPendingRefresh,
  type AccessTokenState,
  type PendingRefresh,
  type StoredAuthState,
} from "../features/auth/services/authTokenState";
import { getBrowserItem, removeBrowserItem, setBrowserItem } from "./browserStorage";

export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  getAccessTokenState(): Promise<AccessTokenState | null>;
  setAccessToken(token: string, expiresInSeconds: number): Promise<void>;
  removeAccessToken(): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  getOrCreatePendingRefresh(operationId: string, startedAt: number): Promise<PendingRefresh | null>;
  commitRefresh(operationId: string, nextRefreshToken: string): Promise<void>;
  clearTokens(): Promise<void>;
}

// Access Token은 탈취 시 즉시 API 호출에 사용할 수 있으므로 프로세스 메모리에만 둔다.
// 앱 재시작 시에는 native SecureStore의 Refresh Token으로 새 Access Token을 발급받는다.
// SecureStore가 없는 web은 브라우저를 닫을 때 사라지는 sessionStorage만 사용한다.
const LEGACY_ACCESS_TOKEN_KEY = "tripmatch.access-token";
const LEGACY_REFRESH_TOKEN_KEY = "tripmatch.refresh-token";
const AUTH_STATE_KEY = "tripmatch.auth-state";
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "tripmatch.auth",
};

let inMemoryAccessToken: AccessTokenState | null = null;
let secureStateQueue: Promise<void> = Promise.resolve();

async function getCredentialItem(key: string, options?: SecureStore.SecureStoreOptions) {
  if (Platform.OS === "web") return getBrowserItem("session", key);
  return SecureStore.getItemAsync(key, options);
}

async function setCredentialItem(key: string, value: string, options?: SecureStore.SecureStoreOptions) {
  if (Platform.OS === "web") {
    setBrowserItem("session", key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, options);
}

async function deleteCredentialItem(key: string, options?: SecureStore.SecureStoreOptions) {
  if (Platform.OS === "web") {
    removeBrowserItem("session", key);
    return;
  }
  await SecureStore.deleteItemAsync(key, options);
}

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function withSecureStateLock<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = secureStateQueue.then(operation, operation);
  secureStateQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function writeStoredAuthState(state: StoredAuthState) {
  await setCredentialItem(AUTH_STATE_KEY, JSON.stringify(state), SECURE_STORE_OPTIONS);
}

async function readStoredAuthState(): Promise<StoredAuthState | null> {
  const serialized = await getCredentialItem(AUTH_STATE_KEY, SECURE_STORE_OPTIONS);
  if (serialized) {
    try {
      return parseStoredAuthState(JSON.parse(serialized) as unknown);
    } catch {
      return null;
    }
  }

  // 출시 전 계약을 교체했으므로 이전 JWT Refresh Token은 복구하거나 이전하지 않는다.
  await deleteCredentialItem(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  return null;
}

async function clearStoredCredentials() {
  inMemoryAccessToken = null;
  await Promise.all([
    deleteCredentialItem(AUTH_STATE_KEY, SECURE_STORE_OPTIONS),
    deleteCredentialItem(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS),
    deleteCredentialItem(LEGACY_ACCESS_TOKEN_KEY),
  ]);
}

export const nativeTokenStorage: TokenStorage = {
  getAccessToken: async () => inMemoryAccessToken?.accessToken ?? null,
  getAccessTokenState: async () => inMemoryAccessToken,
  setAccessToken: async (token, expiresInSeconds) => {
    inMemoryAccessToken = createAccessTokenState(token, expiresInSeconds, monotonicNow());
  },
  removeAccessToken: async () => { inMemoryAccessToken = null; },
  getRefreshToken: () => withSecureStateLock(async () => {
    const current = await readStoredAuthState();
    if (current?.pendingRefresh && !isPendingRefreshRecoverable(current.pendingRefresh, Date.now())) {
      await clearStoredCredentials();
      return null;
    }
    return current?.refreshToken ?? null;
  }),
  setRefreshToken: (token) => withSecureStateLock(async () => {
    await writeStoredAuthState({ refreshToken: token });
    // 새 로그인 성공 뒤 이전 앱 버전의 토큰이 다시 복구되지 않게 함께 제거한다.
    await deleteCredentialItem(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  }),
  getOrCreatePendingRefresh: (operationId, startedAt) => withSecureStateLock(async () => {
    const current = await readStoredAuthState();
    if (!current) return null;
    const next = recoverOrBeginPendingRefresh(current, operationId, startedAt);
    if (next.status === "expired") {
      // 만료된 R0에는 새 K를 붙이지 않는다. 자격 정보를 폐기해 재로그인을 요구한다.
      await clearStoredCredentials();
      return null;
    }
    if (!current.pendingRefresh) await writeStoredAuthState(next.state);
    return next.pending;
  }),
  commitRefresh: (operationId, nextRefreshToken) => withSecureStateLock(async () => {
    const current = await readStoredAuthState();
    await writeStoredAuthState(completePendingRefresh(current, operationId, nextRefreshToken));
    await deleteCredentialItem(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  }),
  clearTokens: async () => {
    await withSecureStateLock(async () => {
      await clearStoredCredentials();
    });
  },
};
