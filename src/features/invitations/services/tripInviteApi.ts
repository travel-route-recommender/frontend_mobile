import { apiClient } from "../../../services/apiClient";
import { environment } from "../../../config/environment";
import { resolveShareableTripInviteUrl } from "../logic/tripInviteLinks";

export type ApiTripInviteLink = {
  inviteCode: string;
  inviteLink: string;
};

function parseInviteLink(value: unknown): ApiTripInviteLink {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("초대 링크 응답 형식이 올바르지 않아요.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.inviteCode !== "string" || !record.inviteCode.trim()) {
    throw new Error("초대 코드가 응답에 없어요.");
  }
  if (typeof record.inviteLink !== "string" || !record.inviteLink.trim()) {
    throw new Error("초대 링크가 응답에 없어요.");
  }
  const inviteCode = record.inviteCode.trim();
  return {
    inviteCode,
    inviteLink: resolveShareableTripInviteUrl(record.inviteLink.trim(), inviteCode, environment.apiBaseUrl),
  };
}

export async function fetchApiTripInviteLink(roomId: string, signal?: AbortSignal) {
  return parseInviteLink(await apiClient.request<unknown>({
    path: `/rooms/${encodeURIComponent(roomId)}/invite-link`,
    signal,
    auth: true,
  }));
}

export async function regenerateApiTripInviteLink(roomId: string) {
  return parseInviteLink(await apiClient.request<unknown>({
    path: `/rooms/${encodeURIComponent(roomId)}/invites`,
    method: "POST",
    auth: true,
  }));
}
