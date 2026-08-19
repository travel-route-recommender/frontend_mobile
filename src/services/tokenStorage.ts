import * as SecureStore from "expo-secure-store";
import { credentialStorage } from "./platformStorage";
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
// 앱 재시작 시에는 SecureStore의 Refresh Token으로 새 Access Token을 발급받는다.
const LEGACY_ACCESS_TOKEN_KEY = "tripmatch.access-token";
const LEGACY_REFRESH_TOKEN_KEY = "tripmatch.refresh-token";
const AUTH_STATE_KEY = "tripmatch.auth-state";
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "tripmatch.auth",
};

let inMemoryAccessToken: AccessTokenState | null = null;
let secureStateQueue: Promise<void> = Promise.resolve();

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function withSecureStateLock<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = secureStateQueue.then(operation, operation);
  secureStateQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function writeStoredAuthState(state: StoredAuthState) {
  await credentialStorage.setItemAsync(AUTH_STATE_KEY, JSON.stringify(state), SECURE_STORE_OPTIONS);
}

async function readStoredAuthState(): Promise<StoredAuthState | null> {
  const serialized = await credentialStorage.getItemAsync(AUTH_STATE_KEY, SECURE_STORE_OPTIONS);
  if (serialized) {
    try {
      return parseStoredAuthState(JSON.parse(serialized) as unknown);
    } catch {
      return null;
    }
  }

  // 출시 전 계약을 교체했으므로 이전 JWT Refresh Token은 복구하거나 이전하지 않는다.
  await credentialStorage.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  return null;
}

async function clearStoredCredentials() {
  inMemoryAccessToken = null;
  await Promise.all([
    credentialStorage.deleteItemAsync(AUTH_STATE_KEY, SECURE_STORE_OPTIONS),
    credentialStorage.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS),
    credentialStorage.deleteItemAsync(LEGACY_ACCESS_TOKEN_KEY),
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
    await credentialStorage.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
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
    await credentialStorage.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  }),
  clearTokens: async () => {
    await withSecureStateLock(async () => {
      await clearStoredCredentials();
    });
  },
};
