"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingleFlight = exports.REFRESH_REQUEST_TIMEOUT_SAFETY_MS = exports.REFRESH_REQUEST_TIMEOUT_MAX_MS = exports.REFRESH_RECOVERY_WINDOW_MS = exports.ACCESS_TOKEN_REFRESH_MARGIN_MS = void 0;
exports.createAccessTokenState = createAccessTokenState;
exports.shouldRefreshAccessToken = shouldRefreshAccessToken;
exports.parseStoredAuthState = parseStoredAuthState;
exports.beginPendingRefresh = beginPendingRefresh;
exports.pendingRefreshRemainingMs = pendingRefreshRemainingMs;
exports.isPendingRefreshRecoverable = isPendingRefreshRecoverable;
exports.refreshRequestTimeoutMs = refreshRequestTimeoutMs;
exports.recoverOrBeginPendingRefresh = recoverOrBeginPendingRefresh;
exports.completePendingRefresh = completePendingRefresh;
exports.isAccessTokenExpiredError = isAccessTokenExpiredError;
exports.isTerminalAccessAuthError = isTerminalAccessAuthError;
exports.isTerminalRefreshError = isTerminalRefreshError;
exports.isRetryableRefreshStatus = isRetryableRefreshStatus;
exports.refreshRetryDelayMs = refreshRetryDelayMs;
exports.ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
exports.REFRESH_RECOVERY_WINDOW_MS = 60_000;
exports.REFRESH_REQUEST_TIMEOUT_MAX_MS = 10_000;
exports.REFRESH_REQUEST_TIMEOUT_SAFETY_MS = 1_000;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function createAccessTokenState(accessToken, expiresInSeconds, monotonicNow) {
    const lifetimeMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? expiresInSeconds * 1_000
        : 0;
    return {
        accessToken,
        expiresAtMonotonic: monotonicNow + lifetimeMs,
    };
}
function shouldRefreshAccessToken(state, monotonicNow, marginMs = exports.ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    if (!state)
        return true;
    return monotonicNow >= state.expiresAtMonotonic - Math.max(0, marginMs);
}
function parseStoredAuthState(value) {
    if (!isRecord(value) || typeof value.refreshToken !== "string" || !value.refreshToken)
        return null;
    if (value.pendingRefresh === undefined)
        return { refreshToken: value.refreshToken };
    if (!isRecord(value.pendingRefresh))
        return null;
    const { refreshToken, operationId, startedAt } = value.pendingRefresh;
    if (typeof refreshToken !== "string" ||
        !refreshToken ||
        refreshToken !== value.refreshToken ||
        typeof operationId !== "string" ||
        !operationId ||
        typeof startedAt !== "number" ||
        !Number.isFinite(startedAt) ||
        startedAt <= 0) {
        return null;
    }
    return {
        refreshToken: value.refreshToken,
        pendingRefresh: { refreshToken, operationId, startedAt },
    };
}
function beginPendingRefresh(state, operationId, startedAt) {
    if (state.pendingRefresh)
        return { state, pending: state.pendingRefresh };
    const pending = {
        refreshToken: state.refreshToken,
        operationId,
        startedAt,
    };
    return {
        state: { ...state, pendingRefresh: pending },
        pending,
    };
}
function pendingRefreshRemainingMs(pending, now, recoveryWindowMs = exports.REFRESH_RECOVERY_WINDOW_MS) {
    return Math.max(0, pending.startedAt + Math.max(0, recoveryWindowMs) - now);
}
function isPendingRefreshRecoverable(pending, now, recoveryWindowMs = exports.REFRESH_RECOVERY_WINDOW_MS) {
    return pendingRefreshRemainingMs(pending, now, recoveryWindowMs) > 0;
}
function refreshRequestTimeoutMs(pending, now, maxTimeoutMs = exports.REFRESH_REQUEST_TIMEOUT_MAX_MS, safetyMs = exports.REFRESH_REQUEST_TIMEOUT_SAFETY_MS) {
    const usableMs = pendingRefreshRemainingMs(pending, now) - Math.max(0, safetyMs);
    if (usableMs <= 0)
        return null;
    return Math.min(Math.max(1, maxTimeoutMs), usableMs);
}
function recoverOrBeginPendingRefresh(state, operationId, now) {
    if (state.pendingRefresh && !isPendingRefreshRecoverable(state.pendingRefresh, now)) {
        return { status: "expired" };
    }
    return { status: "ready", ...beginPendingRefresh(state, operationId, now) };
}
function completePendingRefresh(state, operationId, nextRefreshToken) {
    if (!state?.pendingRefresh || state.pendingRefresh.operationId !== operationId) {
        throw new Error("Refresh 작업 상태가 변경되어 응답을 저장하지 않았습니다.");
    }
    return { refreshToken: nextRefreshToken };
}
function isAccessTokenExpiredError(error) {
    return error.status === 401 && error.code === "TOKEN_EXPIRED";
}
function isTerminalAccessAuthError(error) {
    return error.status === 401 && [
        "TOKEN_INVALID",
        "SESSION_REVOKED",
        "TOKEN_OBSOLETE",
        "ACCOUNT_UNAVAILABLE",
    ].includes(error.code ?? "");
}
function isTerminalRefreshError(error) {
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
function isRetryableRefreshStatus(status) {
    return status === 500 || status === 502 || status === 503 || status === 504;
}
function refreshRetryDelayMs(attempt, random = Math.random()) {
    const base = 300 * 2 ** Math.max(0, attempt);
    const jitter = 0.75 + Math.min(1, Math.max(0, random)) * 0.5;
    return Math.round(base * jitter);
}
class SingleFlight {
    current;
    run(factory) {
        if (this.current)
            return this.current;
        const operation = Promise.resolve().then(factory);
        this.current = operation;
        const clear = () => {
            if (this.current === operation)
                this.current = undefined;
        };
        operation.then(clear, clear);
        return operation;
    }
}
exports.SingleFlight = SingleFlight;
