import {
  beginPendingRefresh,
  completePendingRefresh,
  createAccessTokenState,
  isAccessTokenExpiredError,
  isPendingRefreshRecoverable,
  isRetryableRefreshStatus,
  isTerminalAccessAuthError,
  isTerminalRefreshError,
  parseStoredAuthState,
  pendingRefreshRemainingMs,
  recoverOrBeginPendingRefresh,
  refreshRequestTimeoutMs,
  refreshRetryDelayMs,
  shouldRefreshAccessToken,
  SingleFlight,
  type StoredAuthState,
} from "../src/features/auth/services/authTokenState";
import { ApiError, NativeApiClient, configureApiAuth, type ApiClient, type ApiRequest } from "../src/services/apiClient";
import { apiPermissionMessage, guestPagePolicy, restrictedFeatureMessage } from "../src/features/auth/services/guestAccessPolicy";
import { requestGoogleNativeIdToken } from "../src/features/auth/services/googleNativeAuth";
import { requestKakaoNativeAccessToken, requestKakaoNativeIdToken } from "../src/features/auth/services/kakaoNativeAuth";
import { buildInviteReturnPath, inviteErrorMessage, resolveAuthReturnTo } from "../src/features/auth/services/inviteFlowPolicy";
import { requestSocialLoginSession } from "../src/features/auth/services/socialLoginFlow";
import {
  createInviteJoinRequestBody,
  createLoginRequestBody,
  createRefreshRequestBody,
  createSignupRequestBody,
  supportsBackendSocialProvider,
} from "../src/features/auth/services/backendAuthContract";
import {
  activateLocalPrivateDataScope,
  deactivateLocalPrivateDataScope,
  inferLegacyLocalPrivateDataOwner,
  resolveHydratedLocalPrivateDataScope,
  transferLocalPrivateDataScope,
} from "../src/features/auth/services/localPrivateDataPolicy";
import { toKoreanAuthErrorMessage } from "../src/features/auth/services/authErrorMessage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyKoreanAuthErrorMessages() {
  assert(
    toKoreanAuthErrorMessage(new Error("The authentication session has been canceled by user.")) === "로그인이 취소됐어요.",
    "native authentication cancellation must be translated to Korean",
  );
  assert(
    toKoreanAuthErrorMessage({ code: "USER_CANCELLED", message: "unknown" }) === "로그인이 취소됐어요.",
    "provider cancellation codes must be translated even when the message is unhelpful",
  );
  assert(
    toKoreanAuthErrorMessage(new Error("Invalid credentials")) === "이메일 또는 비밀번호가 올바르지 않아요.",
    "backend credential errors must be translated to Korean",
  );
  assert(
    toKoreanAuthErrorMessage(new Error("Email already registered")) === "이미 가입된 이메일이에요. 로그인해 주세요.",
    "backend duplicate-email errors must be translated to Korean",
  );
  assert(
    toKoreanAuthErrorMessage(new Error("Unexpected native provider failure")) === "인증 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
    "unknown provider internals must not be exposed in English",
  );
  assert(
    toKoreanAuthErrorMessage(new Error("카카오 로그인을 완료하지 못했어요.")) === "카카오 로그인을 완료하지 못했어요.",
    "specific Korean app errors must remain unchanged",
  );
}

async function expectApiError(operation: Promise<unknown>, code?: string) {
  try {
    await operation;
  } catch (error) {
    assert(error instanceof ApiError, "request must reject with ApiError");
    if (code) assert(error.code === code, `expected ${code}, received ${error.code ?? "no code"}`);
    return error;
  }
  throw new Error("request unexpectedly succeeded");
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyTokenState() {
  const access = createAccessTokenState("A1", 900, 1_000);
  assert(!shouldRefreshAccessToken(access, 800_000), "valid access token must not refresh early");
  assert(shouldRefreshAccessToken(access, 841_000), "access token inside the 60 second margin must refresh");
  assert(shouldRefreshAccessToken(null, 1_000), "missing access token must refresh lazily");
  const opaqueAccess = createAccessTokenState("opaque-access", Number.POSITIVE_INFINITY, 1_000);
  assert(!shouldRefreshAccessToken(opaqueAccess, Number.MAX_SAFE_INTEGER), "an opaque current-contract token must wait for a server 401 instead of refreshing before every request");

  const initial = { refreshToken: "R0" } satisfies StoredAuthState;
  const first = beginPendingRefresh(initial, "K1", 1_000);
  const recovered = beginPendingRefresh(first.state, "K2", 2_000);
  assert(recovered.pending.operationId === "K1", "an unfinished refresh must preserve its operation ID");
  assert(recovered.pending.refreshToken === "R0", "an unfinished refresh must preserve its request token");
  const rotated = completePendingRefresh(recovered.state, "K1", "R1");
  assert(rotated.refreshToken === "R1" && !rotated.pendingRefresh, "successful rotation must atomically replace R0 and clear pending state");

  let rejectedStaleResponse = false;
  try {
    completePendingRefresh(first.state, "different-operation", "attacker-token");
  } catch {
    rejectedStaleResponse = true;
  }
  assert(rejectedStaleResponse, "a late response from another refresh operation must not overwrite credentials");
  assert(parseStoredAuthState(first.state)?.pendingRefresh?.operationId === "K1", "stored pending state must survive serialization parsing");

  // 앱 강제 종료 뒤 SecureStore에서 읽은 pending도 복구 시간 안에는 동일 R0/K1을 재사용한다.
  const afterAppKill = parseStoredAuthState(JSON.parse(JSON.stringify(first.state)) as unknown);
  assert(afterAppKill, "pending refresh must be restorable after an app process restart");
  const resumed = recoverOrBeginPendingRefresh(afterAppKill, "K-after-restart", 59_999);
  assert(resumed.status === "ready" && resumed.pending.operationId === "K1", "app restart must recover K1 rather than create a new key");

  // 서버가 회전했지만 응답이 유실된 경우에도 같은 R0/K1로 idempotent response를 복구한다.
  const afterLostResponse = recoverOrBeginPendingRefresh(first.state, "K-after-loss", 30_000);
  assert(afterLostResponse.status === "ready" && afterLostResponse.pending.refreshToken === "R0" && afterLostResponse.pending.operationId === "K1", "a lost response must retry the original R0/K1 pair");

  const stale = recoverOrBeginPendingRefresh(first.state, "K-must-not-exist", 61_000);
  assert(stale.status === "expired", "a pending refresh at the 60 second boundary must expire without creating a new operation key");
  assert(!isPendingRefreshRecoverable(first.pending, 61_000), "stale pending refresh must require credentials to be cleared");
  assert(pendingRefreshRemainingMs(first.pending, 60_999) === 1, "recovery deadline calculation must preserve the final millisecond");
  assert(refreshRequestTimeoutMs(first.pending, 1_000) === 10_000, "an early request must use the bounded maximum timeout");
  const nearDeadlineTimeout = refreshRequestTimeoutMs(first.pending, 56_000);
  assert(nearDeadlineTimeout === 4_000 && nearDeadlineTimeout < pendingRefreshRemainingMs(first.pending, 56_000), "request timeout must stay shorter than the remaining recovery window");
  assert(refreshRequestTimeoutMs(first.pending, 60_000) === null, "a request must not start inside the recovery safety margin");
}

async function verifySingleFlight() {
  const flight = new SingleFlight<string>();
  let executions = 0;
  let release: ((value: string) => void) | undefined;
  const gate = new Promise<string>((resolve) => { release = resolve; });
  const requests = Array.from({ length: 10 }, () => flight.run(async () => {
    executions += 1;
    return gate;
  }));
  await Promise.resolve();
  assert(executions === 1, "ten concurrent callers must start one refresh operation");
  release?.("A1");
  const results = await Promise.all(requests);
  assert(results.every((value) => value === "A1"), "all concurrent callers must receive the same refresh result");
  await flight.run(async () => {
    executions += 1;
    return "A2";
  });
  assert(Number(executions) === 2, "a completed refresh must allow a later logical refresh operation");
}

async function verifyTenConcurrentExpiredRequests() {
  const originalFetch = globalThis.fetch;
  const client = new NativeApiClient("https://api.example.test/api");
  const refreshFlight = new SingleFlight<void>();
  let accessToken = "A0";
  let refreshExecutions = 0;
  let requestExecutions = 0;

  configureApiAuth({
    getAccessToken: () => accessToken,
    onAccessTokenExpired: () => refreshFlight.run(async () => {
      refreshExecutions += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      accessToken = "A1";
    }),
    onSessionInvalidated: () => undefined,
  });

  try {
    globalThis.fetch = (async (_input, init) => {
      requestExecutions += 1;
      const authorization = new Headers(init?.headers).get("Authorization");
      return authorization === "Bearer A0"
        ? jsonResponse(401, { code: "TOKEN_EXPIRED", message: "expired" })
        : jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const results = await Promise.all(
      Array.from({ length: 10 }, () => client.request<{ ok: boolean }>({ path: "/protected" })),
    );
    assert(results.every((result) => result.ok), "all ten requests must recover with the new access token");
    assert(refreshExecutions === 1, "ten concurrent TOKEN_EXPIRED responses must execute one refresh");
    assert(requestExecutions === 20, "each expired request must retry exactly once after refresh");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyApi401Policy() {
  const originalFetch = globalThis.fetch;
  const client = new NativeApiClient("https://api.example.test/api");
  let accessToken = "A0";
  let refreshCalls = 0;
  let invalidationCalls = 0;
  configureApiAuth({
    getAccessToken: () => accessToken,
    onAccessTokenExpired: () => {
      refreshCalls += 1;
      accessToken = "A1";
    },
    onSessionInvalidated: () => { invalidationCalls += 1; },
  });

  try {
    let calls = 0;
    globalThis.fetch = (async (_input, init) => {
      calls += 1;
      const authorization = new Headers(init?.headers).get("Authorization");
      if (calls === 1) {
        assert(authorization === "Bearer A0", "first protected request must use the current access token");
        return jsonResponse(401, { code: "TOKEN_EXPIRED", message: "expired" });
      }
      assert(authorization === "Bearer A1", "retried request must use the rotated access token");
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;
    const recovered = await client.request<{ ok: boolean }>({ path: "/protected" });
    assert(recovered.ok && refreshCalls === 1 && calls === 2, "TOKEN_EXPIRED must refresh and retry exactly once");

    refreshCalls = 0;
    globalThis.fetch = (async () => jsonResponse(401, { message: "Invalid credentials" })) as typeof fetch;
    await expectApiError(client.request({ path: "/auth/account", method: "DELETE" }));
    assert(refreshCalls === 0, "an unstructured 401 such as a wrong password must not refresh");

    for (const code of ["TOKEN_INVALID", "SESSION_REVOKED", "TOKEN_OBSOLETE", "ACCOUNT_UNAVAILABLE"]) {
      const invalidationsBeforeRequest = invalidationCalls;
      globalThis.fetch = (async () => jsonResponse(401, { code, message: "terminal" })) as typeof fetch;
      await expectApiError(client.request({ path: "/protected" }), code);
      assert(
        refreshCalls === 0 && invalidationCalls === invalidationsBeforeRequest + 1,
        `${code} must invalidate local session without refresh`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyMultipartRequestBody() {
  const originalFetch = globalThis.fetch;
  const client = new NativeApiClient("https://api.example.test/api");
  const form = new FormData();
  form.append("note", "ticket");
  try {
    globalThis.fetch = (async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert(!headers.has("Content-Type"), "multipart boundary Content-Type은 fetch가 FormData에 맞게 설정해야 한다");
      assert(init?.body === form, "FormData를 JSON 문자열로 변환하면 안 된다");
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;
    const result = await client.request<{ ok: boolean }>({ path: "/tickets", method: "POST", body: form, auth: false });
    assert(result.ok, "multipart 요청 응답을 정상 파싱해야 한다");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyKakaoNativeTokens() {
  let accessInitializedWith: string | undefined;
  let accessLoginNonce: string | undefined;
  const accessToken = await requestKakaoNativeAccessToken(" native-app-key ", {
    initialize: (appKey) => { accessInitializedWith = appKey; },
    login: async (options) => {
      accessLoginNonce = options?.nonce;
      return { accessToken: " kakao-access-token " };
    },
  });
  assert(accessInitializedWith === "native-app-key", "Kakao access-token login must initialize with the trimmed native app key");
  assert(accessLoginNonce === undefined, "Kakao access-token login must not invent a backend challenge nonce");
  assert(accessToken === "kakao-access-token", "Kakao native login must return its trimmed access token");

  await requestKakaoNativeAccessToken("native-app-key", {
    initialize: () => undefined,
    login: async () => ({ idToken: "id-token-only" }),
  }).then(
    () => { throw new Error("Kakao login without an access token unexpectedly succeeded"); },
    (error: unknown) => assert(error instanceof Error && error.message.includes("Access Token"), "missing Kakao access token must fail closed"),
  );

  let initializedWith: string | undefined;
  let requestedNonce: string | undefined;
  const idToken = await requestKakaoNativeIdToken(" native-app-key ", "server-nonce", {
    initialize: (appKey) => { initializedWith = appKey; },
    login: async (options) => {
      requestedNonce = options?.nonce;
      return { idToken: "kakao-id-token" };
    },
  });
  assert(initializedWith === "native-app-key", "Kakao SDK must initialize with the trimmed native app key");
  assert(requestedNonce === "server-nonce", "Kakao SDK login must receive the backend challenge nonce");
  assert(idToken === "kakao-id-token", "Kakao native login must return its OIDC ID token");

  await requestKakaoNativeIdToken("native-app-key", "server-nonce", {
    initialize: () => undefined,
    login: async () => ({}),
  }).then(
    () => { throw new Error("Kakao login without an ID token unexpectedly succeeded"); },
    (error: unknown) => assert(error instanceof Error && error.message.includes("ID Token"), "missing Kakao ID token must fail closed"),
  );
}

function createStubApi(handler: (request: ApiRequest) => unknown): ApiClient {
  return {
    async request<Response>(request: ApiRequest) {
      return handler(request) as Response;
    },
  };
}

async function verifySocialLoginContracts() {
  type TestSession = { session: string };

  const kakaoCalls: ApiRequest[] = [];
  const kakaoSession = await requestSocialLoginSession<TestSession>("kakao", {
    apiClient: createStubApi((request) => {
      kakaoCalls.push(request);
      return { session: "kakao" };
    }),
    requestKakaoAccessToken: async () => "kakao-access-token",
  });
  assert(kakaoSession.session === "kakao", "Kakao login must return the backend session");
  assert(kakaoCalls.length === 1, "Kakao login must make exactly one backend request");
  assert(
    kakaoCalls[0]?.path === "/auth/oauth/kakao" && kakaoCalls[0]?.method === "POST" && kakaoCalls[0]?.auth === false,
    "Kakao login must call the current backend OAuth exchange endpoint without app authentication",
  );
  const kakaoBody = kakaoCalls[0]?.body as Record<string, unknown>;
  assert(
    kakaoBody.accessToken === "kakao-access-token" && Object.keys(kakaoBody).length === 1,
    "Kakao OAuth exchange must send only the SDK accessToken accepted by the backend DTO",
  );

  const googleCalls: ApiRequest[] = [];
  let googleKakaoTokenCalls = 0;
  await requestSocialLoginSession<TestSession>("google", {
    apiClient: createStubApi((request) => {
      googleCalls.push(request);
      return { session: "must-not-be-used" };
    }),
    requestKakaoAccessToken: async () => {
      googleKakaoTokenCalls += 1;
      return "must-not-be-used";
    },
  }).then(
    () => { throw new Error("unsupported Google login unexpectedly reached the backend"); },
    (error: unknown) => assert(error instanceof Error && error.message.includes("지원하지 않아요"), "Google login must fail with a clear unsupported-provider error"),
  );
  assert(googleCalls.length === 0 && googleKakaoTokenCalls === 0, "unsupported Google login must make no SDK or backend request");
  assert(supportsBackendSocialProvider("kakao") && !supportsBackendSocialProvider("google"), "the capability list must match the backend OAuth endpoints");
}

function verifyBackendAuthRequestBodies() {
  const login = createLoginRequestBody({ email: " USER@Example.COM ", password: "secret" });
  assert(login.email === "user@example.com" && login.password === "secret" && Object.keys(login).length === 2, "login must send only email and password");

  const signup = createSignupRequestBody({ nickname: " 여행자 ", email: " USER@Example.COM ", password: "secret" });
  assert(signup.nickname === "여행자" && signup.email === "user@example.com" && signup.password === "secret" && Object.keys(signup).length === 3, "signup must send only nickname, email, and password");

  const invite = createInviteJoinRequestBody({ code: " abcd1234 ", nickname: " 게스트 ", tripId: "client-only-trip" });
  assert(invite.inviteCode === "ABCD1234" && invite.nickname === "게스트" && Object.keys(invite).length === 2, "invite join must omit client-only fields and metadata");

  const refresh = createRefreshRequestBody("refresh-token");
  assert(refresh.refreshToken === "refresh-token" && Object.keys(refresh).length === 1, "refresh must send only refreshToken");
}

async function verifyGoogleNativeOidc() {
  let configuredWith: { webClientId: string; iosClientId?: string; nonce: string; autoSelectOnSignIn: boolean } | undefined;
  let createAccountCalls = 0;
  let explicitCalls = 0;
  const idToken = await requestGoogleNativeIdToken(" web-client-id ", " ios-client-id ", "server-nonce", {
    configure: (options) => { configuredWith = options; },
    checkPlayServices: async () => undefined,
    signIn: async () => ({ type: "noSavedCredentialFound", data: null }),
    createAccount: async () => {
      createAccountCalls += 1;
      return { type: "success", data: { idToken: "google-id-token" } };
    },
    presentExplicitSignIn: async () => {
      explicitCalls += 1;
      return { type: "cancelled", data: null };
    },
  });
  assert(configuredWith?.webClientId === "web-client-id", "Google native sign-in must use the trimmed web client ID as the ID token audience");
  assert(configuredWith?.iosClientId === "ios-client-id", "Google native sign-in must pass the iOS client ID when configured");
  assert(configuredWith?.nonce === "server-nonce", "Google native sign-in must receive the backend challenge nonce");
  assert(configuredWith?.autoSelectOnSignIn === false, "Google account selection must not silently choose an account");
  assert(createAccountCalls === 1 && explicitCalls === 0, "a new Google user must enter the account creation flow exactly once");
  assert(idToken === "google-id-token", "Google native sign-in must return its OIDC ID token");

  await requestGoogleNativeIdToken("web-client-id", undefined, "server-nonce", {
    configure: () => undefined,
    checkPlayServices: async () => undefined,
    signIn: async () => ({ type: "cancelled", data: null }),
    createAccount: async () => ({ type: "cancelled", data: null }),
    presentExplicitSignIn: async () => ({ type: "cancelled", data: null }),
  }).then(
    () => { throw new Error("cancelled Google sign-in unexpectedly succeeded"); },
    (error: unknown) => assert(error instanceof Error && error.message.includes("취소"), "Google cancellation must fail without calling the backend"),
  );
}

function verifyLocalPrivateDataAccountScope() {
  const empty = () => ({} as Record<string, readonly string[]>);
  const accountA = {
    ownerUserId: "user-a",
    activeData: { "same-trip-id": ["A-document-uri", "A-ocr-todo"] },
    dataByOwnerUserId: {},
  };
  const loggedOut = deactivateLocalPrivateDataScope(accountA, empty);
  assert(loggedOut.ownerUserId === null, "logout must remove the active local-private owner");
  assert(!loggedOut.activeData["same-trip-id"], "logout must remove document/OCR/TODO references from the active view synchronously");

  const accountB = activateLocalPrivateDataScope(loggedOut, "user-b", empty);
  assert(!accountB.activeData["same-trip-id"], "a different account must not see account A data even when the tripId is identical");
  const accountBWithOwnData = { ...accountB, activeData: { "same-trip-id": ["B-document-uri"] } };
  const accountBLoggedOut = deactivateLocalPrivateDataScope(accountBWithOwnData, empty);
  const accountAReturned = activateLocalPrivateDataScope(accountBLoggedOut, "user-a", empty);
  assert(accountAReturned.activeData["same-trip-id"]?.includes("A-document-uri"), "the original account may recover its own device-local data");
  assert(!accountAReturned.activeData["same-trip-id"]?.includes("B-document-uri"), "account B data must remain isolated from account A");

  const lateHydrationForB = resolveHydratedLocalPrivateDataScope(accountA, "user-b", empty);
  assert(lateHydrationForB.ownerUserId === "user-b" && !lateHydrationForB.activeData["same-trip-id"], "late hydration must honor the already requested account instead of exposing the persisted previous owner");
  const lateHydrationAfterLogout = resolveHydratedLocalPrivateDataScope(accountA, null, empty);
  assert(lateHydrationAfterLogout.ownerUserId === null && !lateHydrationAfterLogout.activeData["same-trip-id"], "late hydration after logout must remain deactivated");

  const sameAccount = activateLocalPrivateDataScope(accountAReturned, "user-a", empty);
  assert(sameAccount === accountAReturned, "same-account session refresh must not churn or lose account-scoped local data");
  const upgraded = transferLocalPrivateDataScope(accountA, "user-a", "member-a", empty);
  assert(upgraded.ownerUserId === "member-a" && upgraded.activeData["same-trip-id"] === accountA.activeData["same-trip-id"], "verified guest upgrade must retain the same person's local data");

  const singleOwner = inferLegacyLocalPrivateDataOwner(["user-a", "user-a"]);
  assert(singleOwner.status === "single-owner" && singleOwner.userId === "user-a", "legacy data with one creator may be safely assigned to that account");
  assert(inferLegacyLocalPrivateDataOwner(["user-a", "user-b"]).status === "ambiguous", "mixed-owner legacy data must be quarantined instead of exposed");
}

function verifyInviteLoginReturnFlow() {
  const returnTo = buildInviteReturnPath({
    code: " ab12cd34 ",
    tripId: "trip/id",
    revision: "rev 1",
  });
  assert(returnTo === "/invite/AB12CD34?tripId=trip%2Fid&revision=rev%201", "invite return path must preserve normalized code and mock link metadata");
  assert(resolveAuthReturnTo(returnTo, false) === returnTo, "a member login must return to the pending invite route");
  assert(resolveAuthReturnTo("/signup-email?returnTo=/trips/1", false) === undefined, "auth entry screens must not form a return loop");
  assert(resolveAuthReturnTo("//outside.example", false) === undefined, "external protocol-relative return targets must be rejected");
  assert(resolveAuthReturnTo("/trips/room-a", true) === "/trips/room-a", "a guest may return to an invited room");
  assert(resolveAuthReturnTo(returnTo, true) === undefined, "an existing guest may not use login return handling to switch invite rooms");
  assert(inviteErrorMessage(new ApiError("expired", { status: 410, code: "INVITE_EXPIRED" }), "anonymous").includes("만료"), "expired invite errors must be actionable");
  assert(inviteErrorMessage(new ApiError("closed", { status: 409, code: "ROOM_NOT_ONGOING" }), "member").includes("종료"), "closed room errors must explain why joining is blocked");
  assert(inviteErrorMessage(new ApiError("full", { status: 409, code: "ROOM_FULL" }), "anonymous").includes("가득"), "room capacity errors must be distinct from invalid codes");
}

async function main() {
  verifyKoreanAuthErrorMessages();
  await verifyTokenState();
  await verifySingleFlight();
  await verifyTenConcurrentExpiredRequests();
  await verifyApi401Policy();
  await verifyMultipartRequestBody();
  await verifyGoogleNativeOidc();
  await verifyKakaoNativeTokens();
  await verifySocialLoginContracts();
  verifyBackendAuthRequestBodies();
  verifyLocalPrivateDataAccountScope();
  verifyInviteLoginReturnFlow();
  assert(isAccessTokenExpiredError({ status: 401, code: "TOKEN_EXPIRED" }), "TOKEN_EXPIRED policy must stay explicit");
  assert(isTerminalAccessAuthError({ status: 401, code: "SESSION_REVOKED" }), "revoked sessions must be terminal");
  for (const code of [
    "REFRESH_INVALID",
    "REFRESH_TOKEN_MISSING",
    "REFRESH_RECOVERY_EXPIRED",
    "TOKEN_INVALID",
    "SESSION_REVOKED",
    "TOKEN_OBSOLETE",
    "ACCOUNT_UNAVAILABLE",
  ]) {
    assert(isTerminalRefreshError({ status: 401, code }), `${code} must terminate refresh and clear credentials`);
  }
  assert(isRetryableRefreshStatus(503) && !isRetryableRefreshStatus(401), "only transient server failures may retry refresh");
  assert(refreshRetryDelayMs(0, 0.5) === 300 && refreshRetryDelayMs(1, 0.5) === 600, "refresh retry must use bounded exponential backoff");
  assert(restrictedFeatureMessage("guest", "schedule-edit").includes("후보 장소 추가"), "guest schedule denial must explain the still-allowed candidate action");
  assert(apiPermissionMessage(new ApiError("Forbidden", { status: 403 }), "guest", "duri", "fallback").includes("회원 전용"), "403 messaging must combine the requested feature with guest session kind");
  assert(guestPagePolicy.allowed.includes("장소 탐색 및 장소 상세"), "guests must retain read-only explore access");
  assert(guestPagePolicy.memberOnly.includes("저장 장소"), "saved places must remain member-only");
  console.log("Mobile auth verification passed: provider login contracts, token recovery, terminal-code policy, and account-scoped local document/OCR/TODO isolation");
}

void main();
