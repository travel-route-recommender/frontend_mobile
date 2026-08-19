import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TripEndCondition, TripEndConditionType, TripLocation, TripTransport } from "../../../domain";

export type ApiTripLocalFacts = {
  transport: TripTransport;
  accommodationLocation: TripLocation | null;
  endCondition: TripEndCondition | null;
  companionType: string | null;
  expectedMemberCount: number | null;
  savedAt: string;
};

function storageKey(userId: string, roomId: string) {
  const normalizedUserId = userId.trim();
  const normalizedRoomId = roomId.trim();
  if (!/^[a-f\d]{24}$/i.test(normalizedUserId) || !/^[a-f\d]{24}$/i.test(normalizedRoomId)) {
    throw new Error("서버 사용자 또는 여행방 ID 형식이 올바르지 않아요.");
  }
  return `duri:api-trip-facts:v1:${normalizedUserId}:${normalizedRoomId}`;
}

function parseLocation(value: unknown): TripLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { name?: unknown; address?: unknown };
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  if (candidate.address !== undefined && typeof candidate.address !== "string") return null;
  return {
    name: candidate.name.trim(),
    ...(typeof candidate.address === "string" && candidate.address.trim()
      ? { address: candidate.address.trim() }
      : {}),
  };
}

function parseEndCondition(value: unknown): TripEndCondition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    type?: unknown;
    location?: unknown;
    deadline?: unknown;
    travelMinutes?: unknown;
    serviceBufferMinutes?: unknown;
    note?: unknown;
  };
  const allowedTypes: readonly TripEndConditionType[] = ["train", "intercity-bus", "rental-car-return", "other"];
  const location = parseLocation(candidate.location);
  if (!allowedTypes.includes(candidate.type as TripEndConditionType)
    || !location
    || typeof candidate.deadline !== "string"
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.deadline)
    || !Number.isInteger(candidate.travelMinutes)
    || (candidate.travelMinutes as number) < 0
    || !Number.isInteger(candidate.serviceBufferMinutes)
    || (candidate.serviceBufferMinutes as number) < 0
    || (candidate.note !== undefined && typeof candidate.note !== "string")) {
    return null;
  }
  return {
    type: candidate.type as TripEndConditionType,
    location,
    deadline: candidate.deadline,
    travelMinutes: candidate.travelMinutes as number,
    serviceBufferMinutes: candidate.serviceBufferMinutes as number,
    ...(typeof candidate.note === "string" && candidate.note.trim()
      ? { note: candidate.note.trim() }
      : {}),
  };
}

export function parseApiTripLocalFacts(value: unknown): ApiTripLocalFacts | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ApiTripLocalFacts>;
  if ((candidate.transport !== "car" && candidate.transport !== "public")
    || typeof candidate.savedAt !== "string"
    || !Number.isFinite(Date.parse(candidate.savedAt))) return null;

  const accommodationLocation = candidate.accommodationLocation === null || candidate.accommodationLocation === undefined
    ? null
    : parseLocation(candidate.accommodationLocation);
  const endCondition = candidate.endCondition === null || candidate.endCondition === undefined
    ? null
    : parseEndCondition(candidate.endCondition);
  if ((candidate.accommodationLocation !== null && candidate.accommodationLocation !== undefined && !accommodationLocation)
    || (candidate.endCondition !== null && candidate.endCondition !== undefined && !endCondition)) return null;
  if (candidate.companionType !== null
    && candidate.companionType !== undefined
    && typeof candidate.companionType !== "string") return null;
  if (candidate.expectedMemberCount !== null
    && candidate.expectedMemberCount !== undefined
    && (!Number.isInteger(candidate.expectedMemberCount) || (candidate.expectedMemberCount as number) < 1)) return null;

  return {
    transport: candidate.transport,
    accommodationLocation,
    endCondition,
    companionType: typeof candidate.companionType === "string" && candidate.companionType.trim()
      ? candidate.companionType.trim()
      : null,
    expectedMemberCount: typeof candidate.expectedMemberCount === "number"
      ? candidate.expectedMemberCount
      : null,
    savedAt: candidate.savedAt,
  };
}

export async function saveApiTripLocalFacts(
  userId: string,
  roomId: string,
  facts: Omit<ApiTripLocalFacts, "savedAt">,
) {
  const normalized = parseApiTripLocalFacts({
    ...facts,
    savedAt: new Date().toISOString(),
  } satisfies ApiTripLocalFacts);
  if (!normalized) throw new Error("여행 사실 형식이 올바르지 않아 기기에 저장하지 않았어요.");
  await AsyncStorage.setItem(storageKey(userId, roomId), JSON.stringify(normalized));
}

export async function loadApiTripLocalFacts(userId: string, roomId: string): Promise<ApiTripLocalFacts | null> {
  const raw = await AsyncStorage.getItem(storageKey(userId, roomId));
  if (!raw) return null;
  try {
    return parseApiTripLocalFacts(JSON.parse(raw));
  } catch {
    return null;
  }
}
