import type { User } from "../../../domain";
import { environment, type DataSourceMode } from "../../../config/environment";
import { ApiError, ApiNetworkError, apiClient, configureApiAuth } from "../../../services/apiClient";
import { createRequestId, getClientMetadata } from "../../../services/clientMetadata";
import { nativeTokenStorage } from "../../../services/tokenStorage";
import { DEMO_GUEST_USER_ID, DEMO_INVITED_TRIP_ID, DEMO_INVITE_CODE, DEMO_MEMBER_EMAIL, DEMO_MEMBER_ID, DEMO_MEMBER_PASSWORD } from "../config";
import type { AuthProvider, AuthResult, AuthSuccess, GuestUpgradeInput, InviteJoinInput, InvitePreview, LoginInput, SignupInput, SocialChallenge, SocialProvider } from "../types";
import { createStableMockUserId } from "../utils/stableUserId";
import { normalizeEmail, normalizeInviteCode } from "../validation";
import {
  isRetryableRefreshStatus,
  isTerminalRefreshError,
  pendingRefreshRemainingMs,
  REFRESH_REQUEST_TIMEOUT_SAFETY_MS,
  refreshRequestTimeoutMs,
  refreshRetryDelayMs,
  shouldRefreshAccessToken,
  SingleFlight,
} from "./authTokenState";
import { requestProviderIdToken } from "./socialAuth";

type BackendUser = {
  id: string;
  email?: string;
  nickname: string;
  profileImageUrl?: string;
  onboardingCompleted?: boolean;
  travelType?: unknown;
  isGuest: boolean;
  /** Newer auth contracts may expose this, while the current Swagger does not. */
  accountType?: "member" | "guest";
};

type BackendSession = {
  accessToken: string;
  refreshToken: string;
  tokenType?: "Bearer";
  expiresIn?: number;
  refreshExpiresAt?: string;
  sessionId?: string;
  user: BackendUser;
};

type BackendGuestSession = BackendSession & { roomId: string };

export type ProfileUpdateInput = { nickname: string; profileImageUrl?: string };

export interface AuthService {
  login(input: LoginInput): Promise<AuthResult>;
  signup(input: SignupInput): Promise<AuthResult>;
  previewInvite(code: string): Promise<InvitePreview>;
  acceptInvite(code: string): Promise<string>;
  joinByInvite(input: InviteJoinInput): Promise<AuthResult>;
  loginWithSocial(provider: SocialProvider): Promise<AuthResult>;
  upgradeGuestWithPassword(input: GuestUpgradeInput): Promise<AuthResult>;
  hasStoredSession(): Promise<boolean>;
  clearLocalCredentials(): Promise<void>;
  updateProfile(input: ProfileUpdateInput): Promise<User>;
  completeOnboarding(): Promise<void>;
  deleteAccount(password?: string): Promise<void>;
  logout(): Promise<void>;
}

let sessionInvalidatedHandler: (() => void) | undefined;

export function setSessionInvalidatedHandler(handler: (() => void) | undefined) {
  sessionInvalidatedHandler = handler;
}

function initial(value: string) {
  return value.trim().slice(0, 1) || "🧭";
}

function mapSession(session: BackendSession, provider: AuthProvider): AuthSuccess {
  const guest = session.user.isGuest || session.user.accountType === "guest";
  const onboardingCompleted = Boolean(session.user.onboardingCompleted);
  return {
    status: "success",
    sessionKind: guest ? "guest" : "member",
    provider: guest ? "guest" : provider,
    user: {
      id: session.user.id,
      name: session.user.nickname,
      initial: initial(session.user.nickname),
      ...(session.user.profileImageUrl ? { profileImageUrl: session.user.profileImageUrl } : {}),
    },
    profileCompleted: true,
    onboardingIntroSeen: guest || onboardingCompleted,
    preferenceTestCompleted: Boolean(session.user.travelType),
  };
}

function failure(error: unknown): AuthResult {
  if (error instanceof ApiNetworkError) return { status: "error", code: "network", message: error.message };
  if (error instanceof ApiError) {
    if (error.code === "GUEST_ROOM_LIMIT") {
      const payload = error.payload && typeof error.payload === "object" ? error.payload as Record<string, unknown> : undefined;
      const details = payload?.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : undefined;
      const existingRoomId = typeof details?.roomId === "string"
        ? details.roomId
        : typeof payload?.roomId === "string" ? payload.roomId : undefined;
      return {
        status: "error",
        code: "guest-room-limit",
        message: "게스트는 진행 중인 여행방 하나에만 참여할 수 있어요.",
        ...(existingRoomId ? { existingRoomId } : {}),
      };
    }
    if (error.code === "INVALID_INVITE_CODE") return { status: "error", code: "invalid-invite", message: "유효하지 않거나 더 이상 사용할 수 없는 초대 코드예요." };
    if (error.code === "INVITE_RATE_LIMITED" || error.status === 429) return { status: "error", code: "rate-limited", message: "요청을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
    if (error.code === "ACCOUNT_LINK_REQUIRED" || error.code === "ACCOUNT_MERGE_REQUIRED") return { status: "error", code: "account-link-required", message: "같은 이메일의 기존 계정이 있어요. 기존 방식으로 로그인한 뒤 소셜 계정을 연결해 주세요." };
    if (error.status === 409) return { status: "error", code: "account-exists", message: "이미 가입된 이메일이거나 다른 계정에 연결된 정보예요." };
    if (error.status === 401) return { status: "error", code: "invalid-credentials", message: "이메일 또는 비밀번호가 올바르지 않아요." };
    return { status: "error", code: "unknown", message: error.message };
  }
  return { status: "error", code: "unknown", message: error instanceof Error ? error.message : "인증 처리 중 오류가 발생했어요." };
}

async function persistSession(session: BackendSession) {
  // 로그인 응답도 Refresh Token을 먼저 안전하게 저장한 뒤 Access Token을 활성화한다.
  await nativeTokenStorage.setRefreshToken(session.refreshToken);
  await nativeTokenStorage.setAccessToken(session.accessToken, accessTokenLifetimeSeconds(session));
}

/**
 * Current Swagger omits expiresIn, while a newer auth contract can include it.
 * Prefer the explicit value, otherwise read JWT exp only to schedule a refresh.
 * The server still verifies the token. An opaque token falls back to 401-driven
 * refresh instead of guessing a lifetime.
 */
function accessTokenLifetimeSeconds(session: Pick<BackendSession, "accessToken" | "expiresIn">) {
  if (Number.isFinite(session.expiresIn) && (session.expiresIn as number) > 0) {
    return session.expiresIn as number;
  }
  try {
    const payload = session.accessToken.split(".")[1];
    if (!payload || typeof globalThis.atob !== "function") return Number.POSITIVE_INFINITY;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(globalThis.atob(normalized)) as { exp?: unknown };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.ceil(parsed.exp - Date.now() / 1_000));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const MAX_REFRESH_ATTEMPTS = 3;

function createAbortError() {
  const error = new Error("Refresh 작업이 취소되었습니다.");
  error.name = "AbortError";
  return error;
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableRefreshError(error: unknown) {
  return error instanceof ApiNetworkError || (error instanceof ApiError && isRetryableRefreshStatus(error.status));
}

function createRefreshAttemptSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function refreshRecoveryExpiredError() {
  return new ApiError("로그인 갱신 복구 시간이 지나 안전을 위해 다시 로그인이 필요해요.", {
    status: 401,
    code: "REFRESH_RECOVERY_EXPIRED",
  });
}

class ApiAuthService implements AuthService {
  private readonly refreshFlight = new SingleFlight<BackendSession>();
  private refreshAbortController: AbortController | undefined;
  private sessionGeneration = 0;
  private lastProvider: AuthProvider = "email";

  async login(input: LoginInput): Promise<AuthResult> {
    try {
      this.cancelInFlightRefresh();
      const session = await apiClient.request<BackendSession>({ path: "/auth/login", method: "POST", auth: false, body: { email: normalizeEmail(input.email), password: input.password } });
      this.lastProvider = "email";
      await persistSession(session);
      return mapSession(session, "email");
    } catch (error) { return failure(error); }
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    try {
      this.cancelInFlightRefresh();
      const session = await apiClient.request<BackendSession>({ path: "/auth/signup", method: "POST", auth: false, body: { nickname: input.nickname.trim(), email: normalizeEmail(input.email), password: input.password } });
      this.lastProvider = "email";
      await persistSession(session);
      return mapSession(session, "email");
    } catch (error) { return failure(error); }
  }

  async previewInvite(code: string) {
    return apiClient.request<InvitePreview>({
      path: `/invites/${encodeURIComponent(normalizeInviteCode(code))}/preview`,
      auth: false,
    });
  }

  async joinByInvite(input: InviteJoinInput): Promise<AuthResult> {
    try {
      this.cancelInFlightRefresh();
      const session = await apiClient.request<BackendGuestSession>({ path: "/auth/join-by-invite", method: "POST", auth: false, body: { inviteCode: normalizeInviteCode(input.code), nickname: input.nickname.trim() } });
      this.lastProvider = "guest";
      await persistSession(session);
      return { ...mapSession(session, "guest"), invitedTripId: session.roomId };
    } catch (error) { return failure(error); }
  }

  async acceptInvite(code: string) {
    const room = await apiClient.request<{ id: string }>({ path: `/invites/${encodeURIComponent(normalizeInviteCode(code))}/accept`, method: "POST" });
    return room.id;
  }

  async loginWithSocial(provider: SocialProvider): Promise<AuthResult> {
    try {
      this.cancelInFlightRefresh();
      const metadata = await getClientMetadata();
      const challenge = await apiClient.request<SocialChallenge>({ path: "/auth/social/challenge", method: "POST", auth: false, body: { provider, installationId: metadata.installationId } });
      const authorization = await requestProviderIdToken(provider, challenge);
      const session = authorization.kind === "id-token"
        ? await apiClient.request<BackendSession>({ path: `/auth/social/${provider}`, method: "POST", auth: false, body: { idToken: authorization.idToken, challengeId: challenge.challengeId, ...metadata } })
        : await apiClient.request<BackendSession>({ path: "/auth/social/kakao/code", method: "POST", auth: false, body: { code: authorization.code, state: authorization.state, codeVerifier: authorization.codeVerifier, redirectUri: authorization.redirectUri, challengeId: challenge.challengeId, ...metadata } });
      this.lastProvider = provider;
      await persistSession(session);
      return mapSession(session, provider);
    } catch (error) { return failure(error); }
  }

  async upgradeGuestWithPassword(input: GuestUpgradeInput): Promise<AuthResult> {
    try {
      this.cancelInFlightRefresh();
      const session = await apiClient.request<BackendSession>({
        path: "/auth/guest/upgrade/password",
        method: "POST",
        body: { email: normalizeEmail(input.email), password: input.password, ...(await getClientMetadata()) },
      });
      this.lastProvider = "email";
      await persistSession(session);
      return mapSession(session, "email");
    } catch (error) { return failure(error); }
  }

  async hasStoredSession() {
    return Boolean(await nativeTokenStorage.getRefreshToken());
  }

  async clearLocalCredentials() {
    this.cancelInFlightRefresh();
    await nativeTokenStorage.clearTokens();
  }

  async updateProfile(input: ProfileUpdateInput) {
    const user = await apiClient.request<BackendUser>({ path: "/users/me/profile", method: "PATCH", body: input });
    return { id: user.id, name: user.nickname, initial: initial(user.nickname), ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}) };
  }

  async completeOnboarding() {
    await apiClient.request({ path: "/users/me/onboarding-complete", method: "PATCH" });
  }

  async deleteAccount(password?: string) {
    await apiClient.request({ path: "/auth/account", method: "DELETE", body: { confirmation: "DELETE", ...(password ? { password } : {}) } });
    this.cancelInFlightRefresh();
    await nativeTokenStorage.clearTokens();
  }

  async logout() {
    this.cancelInFlightRefresh();
    const refreshToken = await nativeTokenStorage.getRefreshToken();
    try {
      if (refreshToken) await apiClient.request({ path: "/auth/logout", method: "POST", body: { refreshToken } });
    } finally {
      await nativeTokenStorage.clearTokens();
    }
  }

  async refreshForApiClient() {
    try {
      await this.refresh();
    } catch (error) {
      if (error instanceof ApiError && isTerminalRefreshError(error)) {
        await this.invalidateLocalSession();
      }
      throw error;
    }
  }

  async getValidAccessTokenForApiClient() {
    const state = await nativeTokenStorage.getAccessTokenState();
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (shouldRefreshAccessToken(state, now)) await this.refreshForApiClient();
    return nativeTokenStorage.getAccessToken();
  }

  async invalidateLocalSession() {
    this.cancelInFlightRefresh();
    await nativeTokenStorage.clearTokens();
    sessionInvalidatedHandler?.();
  }

  private refresh() {
    return this.refreshFlight.run(async () => {
      const generation = this.sessionGeneration;
      const controller = new AbortController();
      this.refreshAbortController = controller;
      try {
        return await this.executeRefresh(generation, controller.signal);
      } finally {
        if (this.refreshAbortController === controller) this.refreshAbortController = undefined;
      }
    });
  }

  private async executeRefresh(generation: number, signal: AbortSignal) {
    const pending = await nativeTokenStorage.getOrCreatePendingRefresh(createRequestId(), Date.now());
    if (!pending) throw new ApiError("저장된 로그인 정보가 없어요.", { status: 401, code: "REFRESH_TOKEN_MISSING" });

    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
      const timeoutMs = refreshRequestTimeoutMs(pending, Date.now());
      if (timeoutMs === null) {
        await nativeTokenStorage.clearTokens();
        throw refreshRecoveryExpiredError();
      }
      const attemptSignal = createRefreshAttemptSignal(signal, timeoutMs);
      try {
        const session = await apiClient.request<BackendSession>({
          path: "/auth/refresh",
          method: "POST",
          auth: false,
          retryUnauthorized: false,
          signal: attemptSignal.signal,
          headers: { "Idempotency-Key": pending.operationId },
          body: { refreshToken: pending.refreshToken },
        });
        if (signal.aborted || generation !== this.sessionGeneration) throw createAbortError();
        // R1과 pending 제거를 한 SecureStore 값으로 기록한 다음 A1을 메모리에 활성화한다.
        await nativeTokenStorage.commitRefresh(pending.operationId, session.refreshToken);
        if (signal.aborted || generation !== this.sessionGeneration) throw createAbortError();
        await nativeTokenStorage.setAccessToken(session.accessToken, accessTokenLifetimeSeconds(session));
        return session;
      } catch (error) {
        const normalizedError = attemptSignal.didTimeout() && !signal.aborted
          ? new ApiNetworkError(error)
          : error;
        if (signal.aborted || !isRetryableRefreshError(normalizedError) || attempt === MAX_REFRESH_ATTEMPTS - 1) throw normalizedError;
        const retryDelay = refreshRetryDelayMs(attempt);
        if (pendingRefreshRemainingMs(pending, Date.now()) <= retryDelay + REFRESH_REQUEST_TIMEOUT_SAFETY_MS) {
          await nativeTokenStorage.clearTokens();
          throw refreshRecoveryExpiredError();
        }
        await waitForRetry(retryDelay, signal);
      } finally {
        attemptSignal.cleanup();
      }
    }
    throw new ApiNetworkError();
  }

  private cancelInFlightRefresh() {
    this.sessionGeneration += 1;
    this.refreshAbortController?.abort();
  }
}

class MockAuthService implements AuthService {
  async login(input: LoginInput): Promise<AuthResult> {
    if (normalizeEmail(input.email) !== DEMO_MEMBER_EMAIL || input.password !== DEMO_MEMBER_PASSWORD) return { status: "error", code: "invalid-credentials", message: "데모 이메일 또는 비밀번호가 올바르지 않아요." };
    return this.demoMember();
  }
  async signup(input: SignupInput): Promise<AuthResult> {
    const user: User = { id: createStableMockUserId(input.email), name: input.nickname.trim(), initial: initial(input.nickname) };
    return { status: "success", sessionKind: "member", provider: "email", user, profileCompleted: true, onboardingIntroSeen: false, preferenceTestCompleted: false };
  }
  async previewInvite(code: string): Promise<InvitePreview> {
    if (normalizeInviteCode(code) !== DEMO_INVITE_CODE) throw new ApiError("Invalid invite", { status: 401, code: "INVALID_INVITE_CODE" });
    return { roomId: DEMO_INVITED_TRIP_ID, title: "부산 맛집 여행", destination: "부산", memberCount: 3 };
  }
  async joinByInvite(input: InviteJoinInput): Promise<AuthResult> {
    const code = normalizeInviteCode(input.code);
    const tripId = input.tripId ?? (code === DEMO_INVITE_CODE ? DEMO_INVITED_TRIP_ID : undefined);
    if (!/^[A-Z0-9]{8}$/.test(code) || !tripId) {
      return { status: "error", code: "invalid-invite", message: "사용할 수 없는 초대 코드예요." };
    }
    const isDemoGuest = code === DEMO_INVITE_CODE && tripId === DEMO_INVITED_TRIP_ID;
    const stableGuestSuffix = createStableMockUserId(`${tripId}.${code}@invite.duri`).replace("mock-member-", "");
    const name = input.nickname.trim() || (isDemoGuest ? "게스트 여행자" : "초대 게스트");
    const user: User = {
      id: isDemoGuest ? DEMO_GUEST_USER_ID : `guest-invite-${stableGuestSuffix}`,
      name,
      initial: initial(name),
    };
    return { status: "success", sessionKind: "guest", provider: "guest", user, profileCompleted: true, onboardingIntroSeen: true, preferenceTestCompleted: false, invitedTripId: tripId };
  }
  async acceptInvite() { return DEMO_INVITED_TRIP_ID; }
  async loginWithSocial(provider: SocialProvider) { return { ...this.demoMember(), provider } as AuthSuccess; }
  async upgradeGuestWithPassword(input: GuestUpgradeInput): Promise<AuthResult> {
    return { status: "success", sessionKind: "member", provider: "email", user: { id: DEMO_GUEST_USER_ID, name: input.nickname.trim() || "여행자", initial: initial(input.nickname) }, profileCompleted: true, onboardingIntroSeen: true, preferenceTestCompleted: false };
  }
  async hasStoredSession() { return false; }
  async clearLocalCredentials() { await nativeTokenStorage.clearTokens(); }
  async updateProfile(input: ProfileUpdateInput) { return { id: DEMO_MEMBER_ID, name: input.nickname.trim(), initial: initial(input.nickname), ...(input.profileImageUrl ? { profileImageUrl: input.profileImageUrl } : {}) }; }
  async completeOnboarding() {}
  async deleteAccount() { await nativeTokenStorage.clearTokens(); }
  async logout() { await nativeTokenStorage.clearTokens(); }
  private demoMember(): AuthSuccess { return { status: "success", sessionKind: "member", provider: "email", user: { id: DEMO_MEMBER_ID, name: "수민", initial: "수" }, profileCompleted: true, onboardingIntroSeen: true, preferenceTestCompleted: true }; }
}

const apiAuthService = new ApiAuthService();
configureApiAuth({
  getAccessToken: () => apiAuthService.getValidAccessTokenForApiClient(),
  onAccessTokenExpired: () => apiAuthService.refreshForApiClient(),
  onSessionInvalidated: () => apiAuthService.invalidateLocalSession(),
});

export function createAuthService(mode: DataSourceMode): AuthService {
  return mode === "mock" ? new MockAuthService() : apiAuthService;
}

export const authService = createAuthService(environment.dataSource);
