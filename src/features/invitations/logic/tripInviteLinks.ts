import type { EntityId, TripRoom } from "../../../domain";
import { DEMO_INVITED_TRIP_ID, DEMO_INVITE_CODE } from "../../auth/config";
import type { TripInviteLinkRecord, TripInviteResolution, TripInviteRouteInput } from "../types";

const INVITE_CODE_LENGTH = 8;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TRIP_INVITE_SCHEME = "tripmatch";

export function normalizeTripInviteCode(value: string) {
  return value.trim().toUpperCase();
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
  if (tripId === DEMO_INVITED_TRIP_ID && revision === 1) return DEMO_INVITE_CODE;
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
  if (!trip) return { status: "invalid", message: "이 기기에서 해당 여행방을 찾을 수 없어요. 서버 초대 연동이 필요한 링크일 수 있어요." };

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

