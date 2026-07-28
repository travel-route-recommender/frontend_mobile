export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
export const REFRESH_RECOVERY_WINDOW_MS = 60_000;
export const REFRESH_REQUEST_TIMEOUT_MAX_MS = 10_000;
export const REFRESH_REQUEST_TIMEOUT_SAFETY_MS = 1_000;

export type AccessTokenState = {
  accessToken: string;
  expiresAtMonotonic: number;
};

export type PendingRefresh = {
  refreshToken: string;
  operationId: string;
  startedAt: number;
};

export type StoredAuthState = {
  refreshToken: string;
  pendingRefresh?: PendingRefresh;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createAccessTokenState(
  accessToken: string,
  expiresInSeconds: number,
  monotonicNow: number,
): AccessTokenState {
  const lifetimeMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? expiresInSeconds * 1_000
    : 0;
  return {
    accessToken,
    expiresAtMonotonic: monotonicNow + lifetimeMs,
  };
}

export function shouldRefreshAccessToken(
  state: AccessTokenState | null,
  monotonicNow: number,
  marginMs = ACCESS_TOKEN_REFRESH_MARGIN_MS,
): boolean {
  if (!state) return true;
  return monotonicNow >= state.expiresAtMonotonic - Math.max(0, marginMs);
}

export function parseStoredAuthState(value: unknown): StoredAuthState | null {
  if (!isRecord(value) || typeof value.refreshToken !== "string" || !value.refreshToken) return null;
  if (value.pendingRefresh === undefined) return { refreshToken: value.refreshToken };
  if (!isRecord(value.pendingRefresh)) return null;
  const { refreshToken, operationId, startedAt } = value.pendingRefresh;
  if (
    typeof refreshToken !== "string" ||
    !refreshToken ||
    refreshToken !== value.refreshToken ||
    typeof operationId !== "string" ||
    !operationId ||
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    startedAt <= 0
  ) {
    return null;
  }
  return {
    refreshToken: value.refreshToken,
    pendingRefresh: { refreshToken, operationId, startedAt },
  };
}

export function beginPendingRefresh(
  state: StoredAuthState,
  operationId: string,
  startedAt: number,
): { state: StoredAuthState; pending: PendingRefresh } {
  if (state.pendingRefresh) return { state, pending: state.pendingRefresh };
  const pending: PendingRefresh = {
    refreshToken: state.refreshToken,
    operationId,
    startedAt,
  };
  return {
    state: { ...state, pendingRefresh: pending },
    pending,
  };
}

export function pendingRefreshRemainingMs(
  pending: PendingRefresh,
  now: number,
  recoveryWindowMs = REFRESH_RECOVERY_WINDOW_MS,
): number {
  return Math.max(0, pending.startedAt + Math.max(0, recoveryWindowMs) - now);
}

export function isPendingRefreshRecoverable(
  pending: PendingRefresh,
  now: number,
  recoveryWindowMs = REFRESH_RECOVERY_WINDOW_MS,
): boolean {
  return pendingRefreshRemainingMs(pending, now, recoveryWindowMs) > 0;
}

export function refreshRequestTimeoutMs(
  pending: PendingRefresh,
  now: number,
  maxTimeoutMs = REFRESH_REQUEST_TIMEOUT_MAX_MS,
  safetyMs = REFRESH_REQUEST_TIMEOUT_SAFETY_MS,
): number | null {
  const usableMs = pendingRefreshRemainingMs(pending, now) - Math.max(0, safetyMs);
  if (usableMs <= 0) return null;
  return Math.min(Math.max(1, maxTimeoutMs), usableMs);
}

export function recoverOrBeginPendingRefresh(
  state: StoredAuthState,
  operationId: string,
  now: number,
): { status: "ready"; state: StoredAuthState; pending: PendingRefresh } | { status: "expired" } {
  if (state.pendingRefresh && !isPendingRefreshRecoverable(state.pendingRefresh, now)) {
    return { status: "expired" };
  }
  return { status: "ready", ...beginPendingRefresh(state, operationId, now) };
}

export function completePendingRefresh(
  state: StoredAuthState | null,
  operationId: string,
  nextRefreshToken: string,
): StoredAuthState {
  if (!state?.pendingRefresh || state.pendingRefresh.operationId !== operationId) {
    throw new Error("Refresh 작업 상태가 변경되어 응답을 저장하지 않았습니다.");
  }
  return { refreshToken: nextRefreshToken };
}

export type AuthErrorShape = {
  status?: number;
  code?: string;
};

export function isAccessTokenExpiredError(error: AuthErrorShape): boolean {
  return error.status === 401 && error.code === "TOKEN_EXPIRED";
}

export function isTerminalAccessAuthError(error: AuthErrorShape): boolean {
  return error.status === 401 && [
    "TOKEN_INVALID",
    "SESSION_REVOKED",
    "TOKEN_OBSOLETE",
    "ACCOUNT_UNAVAILABLE",
  ].includes(error.code ?? "");
}

export function isTerminalRefreshError(error: AuthErrorShape): boolean {
  return error.status === 401 && [
    "REFRESH_INVALID",
    "REFRESH_TOKEN_MISSING",
    "REFRESH_RECOVERY_EXPIRED",
    "TOKEN_INVALID",
    "SESSION_REVOKED",
    "TOKEN_OBSOLETE",
    "ACCOUNT_UNAVAILABLE",
  ].includes(error.code ?? "");
}

export function isRetryableRefreshStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export function refreshRetryDelayMs(attempt: number, random = Math.random()): number {
  const base = 300 * 2 ** Math.max(0, attempt);
  const jitter = 0.75 + Math.min(1, Math.max(0, random)) * 0.5;
  return Math.round(base * jitter);
}

export class SingleFlight<T> {
  private current: Promise<T> | undefined;

  run(factory: () => Promise<T>): Promise<T> {
    if (this.current) return this.current;
    const operation = Promise.resolve().then(factory);
    this.current = operation;
    const clear = () => {
      if (this.current === operation) this.current = undefined;
    };
    operation.then(clear, clear);
    return operation;
  }
}
