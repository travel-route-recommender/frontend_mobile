import type { EntityId, TripRoom } from "../../../domain";
import type { TripInviteLinkRecord, TripInviteResolution, TripInviteRouteInput } from "../types";

const INVITE_CODE_LENGTH = 8;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TRIP_INVITE_SCHEME = "tripmatch";
const API_INVITE_PATH = ["api", "v1", "invites"] as const;

export function normalizeTripInviteCode(value: string) {
  return value.trim().toUpperCase();
}

function isValidTripInviteCode(value: string) {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(value);
}

function publicHttpsInviteBase(apiBaseUrl: string | undefined) {
  if (!apiBaseUrl) return undefined;
  try {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== "https:") return undefined;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/invites`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/** 카카오톡 등 메시지 앱이 누를 수 있는 HTTPS 링크를 우선한다. */
export function resolveShareableTripInviteUrl(inviteUrl: string, code: string, apiBaseUrl?: string) {
  const rawUrl = inviteUrl.trim();
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "https:") return rawUrl;
  } catch {
    // 구버전 서버의 custom scheme은 아래 HTTPS 주소로 보완한다.
  }
  const publicBase = publicHttpsInviteBase(apiBaseUrl);
  return publicBase ? `${publicBase}/${encodeURIComponent(normalizeTripInviteCode(code))}` : rawUrl;
}

/** HTTPS App/Universal Link와 기존 custom scheme을 Expo Router 경로로 통일한다. */
export function rewriteTripInviteSystemPath(path: string) {
  try {
    const parsed = new URL(path, "https://duri.invalid");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const customScheme = parsed.protocol === `${TRIP_INVITE_SCHEME}:`
      && parsed.hostname.toLocaleLowerCase("en-US") === "invite";
    const apiInvite = segments.length === 4
      && API_INVITE_PATH.every((segment, index) => segments[index]?.toLocaleLowerCase("en-US") === segment);
    const directInvite = segments.length === 2 && segments[0]?.toLocaleLowerCase("en-US") === "invite";
    const rawCode = customScheme ? segments[0] : apiInvite ? segments[3] : directInvite ? segments[1] : undefined;
    if (!rawCode) return path;
    const code = normalizeTripInviteCode(decodeURIComponent(rawCode));
    if (!isValidTripInviteCode(code)) return path;
    const query = new URLSearchParams();
    for (const key of ["tripId", "revision"] as const) {
      const value = parsed.searchParams.get(key);
      if (value) query.set(key, value);
    }
    const serializedQuery = query.toString();
    const suffix = serializedQuery ? `?${serializedQuery}` : "";
    return `/invite/${encodeURIComponent(code)}${suffix}`;
  } catch {
    return "/";
  }
}

function normalizeRevision(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createMockTripInviteCode(tripId: EntityId, revision: number) {
  let state = hashSeed(`${tripId}:${revision}`);
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    code += INVITE_ALPHABET[state % INVITE_ALPHABET.length];
  }
  return code;
}

export function createTripInviteRecord(tripId: EntityId, revision = 1): TripInviteLinkRecord {
  return {
    tripId,
    revision,
    code: createMockTripInviteCode(tripId, revision),
    status: "active",
  };
}

export function buildTripInviteUrl(record: TripInviteLinkRecord) {
  const tripId = encodeURIComponent(record.tripId);
  return `${TRIP_INVITE_SCHEME}://invite/${encodeURIComponent(record.code)}?tripId=${tripId}&revision=${record.revision}`;
}

function resolveKnownTrip(
  tripId: EntityId,
  code: string,
  revision: number,
  tripsById: Record<EntityId, TripRoom>,
  linksByTripId: Record<EntityId, TripInviteLinkRecord>,
): TripInviteResolution {
  const trip = tripsById[tripId];
  if (!trip) return { status: "invalid", message: "이 기기에서 해당 여행을 찾을 수 없어요. 링크를 다시 확인하거나 방장에게 새 초대를 요청해 주세요." };

  const localRecord = linksByTripId[tripId];
  if (localRecord?.status === "disabled") return { status: "disabled", message: "사용이 중지된 초대 링크예요. 방장에게 새 링크를 요청해 주세요." };
  if (localRecord && (localRecord.code !== code || localRecord.revision !== revision)) {
    return { status: "stale", message: "새 링크가 발급되어 더 이상 사용할 수 없는 초대 링크예요." };
  }
  if (createMockTripInviteCode(tripId, revision) !== code) {
    return { status: "invalid", message: "초대 링크 정보가 올바르지 않아요." };
  }
  if (trip.status === "completed") return { status: "closed", message: "완료된 여행방에는 새로 참여할 수 없어요." };

  return {
    status: "success",
    trip,
    record: localRecord ?? { tripId, code, revision, status: "active" },
  };
}

export function resolveMockTripInvite(
  input: TripInviteRouteInput,
  tripsById: Record<EntityId, TripRoom>,
  linksByTripId: Record<EntityId, TripInviteLinkRecord>,
): TripInviteResolution {
  const code = normalizeTripInviteCode(input.code);
  if (!code) return { status: "invalid", message: "초대 코드를 입력해 주세요." };

  if (input.tripId) {
    const revision = normalizeRevision(input.revision);
    if (!revision) return { status: "invalid", message: "초대 링크의 버전 정보가 올바르지 않아요." };
    return resolveKnownTrip(input.tripId, code, revision, tripsById, linksByTripId);
  }

  const storedRecord = Object.values(linksByTripId).find((record) => record.code === code);
  if (storedRecord) {
    return resolveKnownTrip(storedRecord.tripId, code, storedRecord.revision, tripsById, linksByTripId);
  }

  const fallbackTripId = Object.keys(tripsById)
    .sort()
    .find((tripId) => !linksByTripId[tripId] && createMockTripInviteCode(tripId, 1) === code);
  if (!fallbackTripId) return { status: "invalid", message: "사용할 수 없는 초대 코드예요." };
  return resolveKnownTrip(fallbackTripId, code, 1, tripsById, linksByTripId);
}
