import { ApiError } from "../../../services/apiClient";
import type { SessionKind } from "../types";
import { normalizeInviteCode } from "../validation";
import { apiPermissionMessage } from "./guestAccessPolicy";

type InviteReturnInput = {
  code?: string;
  tripId?: string;
  revision?: string;
};

type AuthReturnParams = Record<string, string | readonly string[] | undefined>;

const AUTH_ENTRY_PATHS = new Set([
  "/login",
  "/signup-choice",
  "/signup-email",
  "/terms",
  "/invite",
  "/guest-room-limit",
  "/guest-upgrade",
]);

function routeBoundParamKeys(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const keys = new Set<string>();
  if (segments[0] === "trips" && segments[1] && segments[1] !== "new") keys.add("tripId");
  if (segments[0] === "places" && segments[1]) keys.add("placeId");
  if (segments[0] === "invite" && segments[1]) keys.add("code");
  if (segments[0] === "trips" && segments[2] === "suggestions" && segments[3]) keys.add("suggestionId");
  return keys;
}

export function buildAuthReturnPath(pathname: string, params: AuthReturnParams = {}) {
  const pathParamKeys = routeBoundParamKeys(pathname);
  const query = Object.entries(params)
    .filter(([key]) => key !== "returnTo" && !pathParamKeys.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
      return values
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .map((entry) => `${encodeURIComponent(key)}=${encodeURIComponent(entry)}`);
    });
  return query.length ? `${pathname}${pathname.includes("?") ? "&" : "?"}${query.join("&")}` : pathname;
}

function appendQueryValue(parts: string[], key: string, value?: string) {
  if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
}

export function buildInviteReturnPath({ code, tripId, revision }: InviteReturnInput) {
  const normalizedCode = normalizeInviteCode(code ?? "");
  if (!normalizedCode) return "/invite";

  const query: string[] = [];
  appendQueryValue(query, "tripId", tripId);
  appendQueryValue(query, "revision", revision);
  const suffix = query.length ? `?${query.join("&")}` : "";
  return `/invite/${encodeURIComponent(normalizedCode)}${suffix}`;
}

export function resolveAuthReturnTo(value: string | undefined, guest: boolean) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://duri.invalid");
  } catch {
    return undefined;
  }
  if (parsed.origin !== "https://duri.invalid") return undefined;
  let decodedPath = parsed.pathname;
  try {
    for (let index = 0; index < 3; index += 1) {
      const decoded = decodeURIComponent(decodedPath);
      if (decoded === decodedPath) break;
      decodedPath = decoded;
    }
  } catch {
    return undefined;
  }
  if (decodedPath.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) return undefined;
  const normalizedPath = (decodedPath.replace(/^\/\(auth\)(?=\/)/i, "").replace(/\/+$/, "") || "/").toLocaleLowerCase("en-US");
  if (AUTH_ENTRY_PATHS.has(normalizedPath)) return undefined;
  if (guest && !(value === "/home" || value === "/trips" || value.startsWith("/trips/") || value === "/mypage" || value.startsWith("/tests/"))) return undefined;
  return value;
}

export function inviteErrorMessage(error: unknown, sessionKind: SessionKind | null) {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_INVITE_CODE" || error.status === 401) {
      return "유효하지 않거나 더 이상 사용할 수 없는 초대 코드예요.";
    }
    if (error.code === "INVITE_EXPIRED") {
      return "만료된 초대 코드예요. 여행방 관리자에게 새 코드를 요청해 주세요.";
    }
    if (["ROOM_CLOSED", "ROOM_NOT_ONGOING", "INVITE_ROOM_CLOSED"].includes(error.code ?? "")) {
      return "이미 종료된 여행방이라 참여할 수 없어요.";
    }
    if (error.code === "ROOM_FULL") {
      return "여행방 참여 인원이 가득 찼어요.";
    }
    if (error.code === "INVITE_RATE_LIMITED" || error.status === 429) {
      return "초대 코드 확인을 너무 많이 시도했어요. 잠시 뒤 다시 시도해 주세요.";
    }
  }
  return apiPermissionMessage(error, sessionKind, "room-join", "초대 코드를 확인하지 못했어요.");
}
