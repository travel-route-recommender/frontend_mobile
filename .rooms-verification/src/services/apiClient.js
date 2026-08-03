"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiClient = exports.NativeApiClient = exports.ApiContractUnavailableError = exports.ApiNetworkError = exports.ApiError = void 0;
exports.configureApiAuth = configureApiAuth;
const environment_1 = require("../config/environment");
const authTokenState_1 = require("../features/auth/services/authTokenState");
let authBindings;
function configureApiAuth(bindings) {
    authBindings = bindings;
}
class ApiError extends Error {
    status;
    code;
    payload;
    retryAfter;
    constructor(message, options) {
        super(message);
        this.name = "ApiError";
        this.status = options.status;
        this.code = options.code;
        this.payload = options.payload;
        this.retryAfter = options.retryAfter;
    }
}
exports.ApiError = ApiError;
class ApiNetworkError extends Error {
    constructor(cause) {
        super("서버에 연결할 수 없어요. 네트워크와 서버 주소를 확인해 주세요.", { cause });
        this.name = "ApiNetworkError";
    }
}
exports.ApiNetworkError = ApiNetworkError;
class ApiContractUnavailableError extends Error {
    constructor() {
        super("이 기능의 백엔드 API 계약이 아직 연결되지 않았습니다.");
        this.name = "ApiContractUnavailableError";
    }
}
exports.ApiContractUnavailableError = ApiContractUnavailableError;
async function parseResponse(response) {
    if (response.status === 204)
        return undefined;
    const text = await response.text();
    if (!text)
        return undefined;
    if (!response.headers.get("content-type")?.toLowerCase().includes("json"))
        return text;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function apiError(response, payload) {
    const structured = payload && typeof payload === "object" ? payload : undefined;
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
class NativeApiClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    async request({ path, method = "GET", body, query, headers: inputHeaders, signal, auth = true, retryUnauthorized = true, }) {
        const execute = async () => {
            const headers = new Headers(inputHeaders);
            headers.set("Accept", "application/json");
            if (body !== undefined)
                headers.set("Content-Type", "application/json");
            const accessToken = auth ? await authBindings?.getAccessToken() : null;
            if (accessToken)
                headers.set("Authorization", `Bearer ${accessToken}`);
            const response = await fetch(this.buildUrl(path, query), {
                method,
                headers,
                signal,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
            return { response, payload: await parseResponse(response) };
        };
        let first;
        try {
            first = await execute();
        }
        catch (error) {
            if (signal?.aborted)
                throw error;
            if (error instanceof ApiError || error instanceof ApiNetworkError)
                throw error;
            throw new ApiNetworkError(error);
        }
        if (first.response.ok)
            return first.payload;
        const firstError = apiError(first.response, first.payload);
        if (auth && retryUnauthorized && authBindings && (0, authTokenState_1.isAccessTokenExpiredError)(firstError)) {
            await authBindings.onAccessTokenExpired();
            let retried;
            try {
                retried = await execute();
            }
            catch (error) {
                if (signal?.aborted)
                    throw error;
                if (error instanceof ApiError || error instanceof ApiNetworkError)
                    throw error;
                throw new ApiNetworkError(error);
            }
            if (retried.response.ok)
                return retried.payload;
            const retriedError = apiError(retried.response, retried.payload);
            if ((0, authTokenState_1.isTerminalAccessAuthError)(retriedError)) {
                await authBindings.onSessionInvalidated(retriedError);
            }
            throw retriedError;
        }
        if (auth && authBindings && (0, authTokenState_1.isTerminalAccessAuthError)(firstError)) {
            await authBindings.onSessionInvalidated(firstError);
        }
        throw firstError;
    }
    buildUrl(path, query) {
        const url = new URL(/^https?:\/\//i.test(path) ? path : `${this.baseUrl}/${path.replace(/^\/+/, "")}`);
        Object.entries(query ?? {}).forEach(([key, value]) => {
            if (value === undefined || value === null)
                return;
            const values = Array.isArray(value) ? value : [value];
            values.forEach((entry) => url.searchParams.append(key, String(entry)));
        });
        return url.toString();
    }
}
exports.NativeApiClient = NativeApiClient;
exports.apiClient = new NativeApiClient(environment_1.environment.apiBaseUrl);
