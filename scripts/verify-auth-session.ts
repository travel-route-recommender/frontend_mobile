import {
  beginPendingRefresh,
  completePendingRefresh,
  createAccessTokenState,
  getJwtExpiresInSeconds,
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
import { ApiError, NativeApiClient, configureApiAuth } from "../src/services/apiClient";
import { apiPermissionMessage, restrictedFeatureMessage } from "../src/features/auth/services/guestAccessPolicy";
import { kakaoAuthErrorMessage } from "../src/features/auth/services/kakaoAuthError";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  const jwtPayload = globalThis.btoa(JSON.stringify({ sub: "user-1", exp: 1_900 }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert(getJwtExpiresInSeconds(`header.${jwtPayload}.signature`, 1_000) === 900, "JWT exp must supply the backend access-token lifetime");
  assert(getJwtExpiresInSeconds("not-a-jwt", 1_000) === null, "malformed backend tokens must not invent an expiry");

  const access = createAccessTokenState("A1", 900, 1_000);
  assert(!shouldRefreshAccessToken(access, 800_000), "valid access token must not refresh early");
  assert(shouldRefreshAccessToken(access, 841_000), "access token inside the 60 second margin must refresh");
  assert(shouldRefreshAccessToken(null, 1_000), "missing access token must refresh lazily");

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
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(401, { message: "Unauthorized" })
        : jsonResponse(200, { ok: true });
    }) as typeof fetch;
    const recoveredFromBackend401 = await client.request<{ ok: boolean }>({ path: "/protected" });
    assert(recoveredFromBackend401.ok && refreshCalls === 1 && calls === 2, "the backend's unstructured protected 401 must refresh and retry once");

    refreshCalls = 0;
    for (const code of ["TOKEN_INVALID", "SESSION_REVOKED", "TOKEN_OBSOLETE", "ACCOUNT_UNAVAILABLE"]) {
      const invalidationsBeforeRequest = invalidationCalls;
      globalThis.fetch = (async () => jsonResponse(401, { code, message: "terminal" })) as typeof fetch;
      await expectApiError(client.request({ path: "/protected" }), code);
      assert(
        Number(refreshCalls) === 0 && invalidationCalls === invalidationsBeforeRequest + 1,
        `${code} must invalidate local session without refresh`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await verifyTokenState();
  await verifySingleFlight();
  await verifyTenConcurrentExpiredRequests();
  await verifyApi401Policy();
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
  assert(
    kakaoAuthErrorMessage({ code: "invalid_client", description: "Bad client credentials", params: { error_code: "KOE010" } }).includes("Client Secret")
      && kakaoAuthErrorMessage({ params: { error_code: "KOE010" } }).includes("OFF"),
    "KOE010 must explain that this client-side flow requires Client Secret to be disabled",
  );
  assert(
    kakaoAuthErrorMessage({ params: { error_code: "KOE303" } }).includes("Redirect URI"),
    "Kakao redirect mismatch must have an actionable message",
  );
  assert(
    kakaoAuthErrorMessage({ params: { error_code: "KOE101" } }).includes("REST API 키"),
    "Kakao invalid-client-id errors must identify the REST API key",
  );
  console.log("Mobile auth verification passed: expiry, refresh recovery, terminal policy, and Kakao OAuth diagnostics");
}

void main();
