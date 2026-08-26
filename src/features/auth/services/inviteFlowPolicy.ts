import { ApiError } from "../../../services/apiClient";
import type { SessionKind } from "../types";
import { normalizeInviteCode } from "../validation";
import { apiPermissionMessage } from "./guestAccessPolicy";

type InviteReturnInput = {
  code?: string;
  tripId?: string;
  revision?: string;
};

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
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  if (["/login", "/signup-choice", "/signup-email", "/terms", "/invite"].some((path) => value === path || value.startsWith(`${path}?`))) return undefined;
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
