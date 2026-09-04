import { environment } from "../config/environment";
import {
  isAccessTokenExpiredError,
  isTerminalAccessAuthError,
} from "../features/auth/services/authTokenState";

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export type ApiRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  auth?: boolean;
  retryUnauthorized?: boolean;
  /** Uploads can opt into a longer bound; ordinary requests use 30 seconds. */
  timeoutMs?: number;
};

export interface ApiClient {
  request<Response>(request: ApiRequest): Promise<Response>;
}

type ApiAuthBindings = {
  getAccessToken: () => string | null | Promise<string | null>;
  onAccessTokenExpired: () => void | Promise<void>;
  onSessionInvalidated: (error: ApiError) => void | Promise<void>;
};

let authBindings: ApiAuthBindings | undefined;

export function configureApiAuth(bindings: ApiAuthBindings) {
  authBindings = bindings;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: unknown;
  readonly retryAfter?: number;

  constructor(message: string, options: { status: number; code?: string; payload?: unknown; retryAfter?: number }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.payload = options.payload;
    this.retryAfter = options.retryAfter;
  }
}

export class ApiNetworkError extends Error {
  constructor(cause?: unknown) {
    super("연결이 원활하지 않아요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", { cause });
    this.name = "ApiNetworkError";
  }
}

export class ApiTimeoutError extends Error {
  constructor(cause?: unknown) {
    super("응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", { cause });
    this.name = "ApiTimeoutError";
  }
}

export class ApiContractUnavailableError extends Error {
  constructor() {
    super("지금은 이 기능을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.");
    this.name = "ApiContractUnavailableError";
  }
}

type ErrorPayload = { message?: string | string[]; code?: string; retryAfter?: number };

async function parseResponse(response: Response) {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  if (!response.headers.get("content-type")?.toLowerCase().includes("json")) return text;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function apiError(response: Response, payload: unknown) {
  const structured = payload && typeof payload === "object" ? payload as ErrorPayload : undefined;
  const rawMessage = structured?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(" ")
    : rawMessage ?? (typeof payload === "string" ? payload : `요청에 실패했어요. (${response.status})`);
  return new ApiError(message, {
    status: response.status,
    ...(structured?.code ? { code: structured.code } : {}),
    ...(typeof structured?.retryAfter === "number" ? { retryAfter: structured.retryAfter } : {}),
    payload,
  });
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export class NativeApiClient implements ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request<ResponseBody>({
    path,
    method = "GET",
    body,
    query,
    headers: inputHeaders,
    signal,
    auth = true,
    retryUnauthorized = true,
    timeoutMs,
  }: ApiRequest): Promise<ResponseBody> {
    const execute = async () => {
      const headers = new Headers(inputHeaders);
      headers.set("Accept", "application/json");
      const multipart = isFormDataBody(body);
      if (body !== undefined && !multipart) headers.set("Content-Type", "application/json");
      const accessToken = auth ? await authBindings?.getAccessToken() : null;
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      const controller = new AbortController();
      const requestTimeoutMs = Math.max(1_000, Math.min(120_000, timeoutMs ?? (multipart ? 60_000 : 30_000)));
      let timedOut = false;
      const abortFromCaller = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);

      try {
        const response = await fetch(this.buildUrl(path, query), {
          method,
          headers,
          signal: controller.signal,
          ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
        });
        return { response, payload: await parseResponse(response) };
      } catch (error) {
        if (timedOut) throw new ApiTimeoutError(error);
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    };

    let first: Awaited<ReturnType<typeof execute>>;
    try {
      first = await execute();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof ApiError || error instanceof ApiNetworkError || error instanceof ApiTimeoutError) throw error;
      throw new ApiNetworkError(error);
    }
    if (first.response.ok) return first.payload as ResponseBody;
    const firstError = apiError(first.response, first.payload);

    if (auth && retryUnauthorized && authBindings && isAccessTokenExpiredError(firstError)) {
      await authBindings.onAccessTokenExpired();
      let retried: Awaited<ReturnType<typeof execute>>;
      try {
        retried = await execute();
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof ApiError || error instanceof ApiNetworkError || error instanceof ApiTimeoutError) throw error;
        throw new ApiNetworkError(error);
      }
      if (retried.response.ok) return retried.payload as ResponseBody;
      const retriedError = apiError(retried.response, retried.payload);
      // 새 Access Token으로 동일 요청을 다시 보냈는데도 401이면 더 이상
      // 복구할 수 없는 세션이다. code가 없는 현재 Backend 응답도 포함한다.
      if (retriedError.status === 401 || isTerminalAccessAuthError(retriedError)) {
        await authBindings.onSessionInvalidated(retriedError);
      }
      throw retriedError;
    }

    if (auth && authBindings && isTerminalAccessAuthError(firstError)) {
      await authBindings.onSessionInvalidated(firstError);
    }
    throw firstError;
  }

  private buildUrl(path: string, query?: QueryParams) {
    const url = new URL(/^https?:\/\//i.test(path) ? path : `${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => url.searchParams.append(key, String(entry)));
    });
    return url.toString();
  }
}

export function createApiClient(baseUrl: string): ApiClient {
  const client = new NativeApiClient(baseUrl);
  return {
    request: (request) => client.request({ ...request, auth: request.auth ?? false }),
  };
}

export const apiClient = new NativeApiClient(environment.apiBaseUrl);
