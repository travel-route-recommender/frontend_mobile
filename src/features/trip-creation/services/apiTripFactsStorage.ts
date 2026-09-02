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

export type ApiTripLocalFactsScope = {
  roomId: string;
  startDate: string | null;
  endDate: string | null;
};

export type ApiTripLocalFactsLoadResult =
  | { status: "loaded"; value: ApiTripLocalFacts }
  | { status: "missing" | "unavailable"; value: null };

type ApiLocalStorageReader = Pick<typeof AsyncStorage, "getItem">;
type ApiLocalStorageRemover = Pick<typeof AsyncStorage, "removeItem">;
type ApiLocalStorageWriter = Pick<typeof AsyncStorage, "setItem">;

const API_TRIP_FACTS_STORAGE_VERSION = 3 as const;
const LEGACY_API_TRIP_FACTS_STORAGE_VERSIONS = [2, 1] as const;
const pendingWritesByStorageKey = new Map<string, Promise<void>>();

type StoredApiTripLocalFacts = {
  version: typeof API_TRIP_FACTS_STORAGE_VERSION;
  scope: ApiTripLocalFactsScope;
  facts: ApiTripLocalFacts;
};

function storageIdentity(userId: string, roomId: string) {
  const normalizedUserId = userId.trim();
  const normalizedRoomId = roomId.trim();
  if (!/^[a-f\d]{24}$/i.test(normalizedUserId) || !/^[a-f\d]{24}$/i.test(normalizedRoomId)) {
    throw new Error("서버 사용자 또는 여행방 ID 형식이 올바르지 않아요.");
  }
  return { normalizedUserId, normalizedRoomId };
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidScope(scope: ApiTripLocalFactsScope) {
  if (!/^[a-f\d]{24}$/i.test(scope.roomId)) return false;
  if (scope.startDate === null || scope.endDate === null) {
    return scope.startDate === null && scope.endDate === null;
  }
  return isValidDateOnly(scope.startDate)
    && isValidDateOnly(scope.endDate)
    && scope.startDate <= scope.endDate;
}

function storageKey(
  userId: string,
  roomId: string,
  scope: Pick<ApiTripLocalFactsScope, "startDate" | "endDate">,
) {
  const { normalizedUserId, normalizedRoomId } = storageIdentity(userId, roomId);
  const normalizedScope: ApiTripLocalFactsScope = {
    roomId: normalizedRoomId,
    startDate: scope.startDate,
    endDate: scope.endDate,
  };
  if (!isValidScope(normalizedScope)) throw new Error("여행 날짜 범위가 올바르지 않아요.");
  const startDate = normalizedScope.startDate ?? "date-undecided";
  const endDate = normalizedScope.endDate ?? "date-undecided";
  return `duri:api-trip-facts:v${API_TRIP_FACTS_STORAGE_VERSION}:${normalizedUserId}:${normalizedRoomId}:${startDate}:${endDate}`;
}

function legacyStorageKey(userId: string, roomId: string, version: number) {
  const { normalizedUserId, normalizedRoomId } = storageIdentity(userId, roomId);
  return `duri:api-trip-facts:v${version}:${normalizedUserId}:${normalizedRoomId}`;
}

async function enqueueStorageWrite(key: string, write: () => Promise<void>) {
  const previous = pendingWritesByStorageKey.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(write);
  pendingWritesByStorageKey.set(key, current);
  try {
    await current;
  } finally {
    if (pendingWritesByStorageKey.get(key) === current) pendingWritesByStorageKey.delete(key);
  }
}

function sameScope(left: ApiTripLocalFactsScope, right: ApiTripLocalFactsScope) {
  return left.roomId === right.roomId
    && left.startDate === right.startDate
    && left.endDate === right.endDate;
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
  scope: Pick<ApiTripLocalFactsScope, "startDate" | "endDate">,
  facts: Omit<ApiTripLocalFacts, "savedAt">,
  storage: ApiLocalStorageWriter = AsyncStorage,
) {
  const normalizedScope: ApiTripLocalFactsScope = {
    roomId: roomId.trim(),
    startDate: scope.startDate,
    endDate: scope.endDate,
  };
  if (!isValidScope(normalizedScope)) throw new Error("여행 날짜 범위가 올바르지 않아 기기에 저장하지 않았어요.");
  const normalized = parseApiTripLocalFacts({
    ...facts,
    savedAt: new Date().toISOString(),
  } satisfies ApiTripLocalFacts);
  if (!normalized) throw new Error("여행 사실 형식이 올바르지 않아 기기에 저장하지 않았어요.");
  const stored: StoredApiTripLocalFacts = {
    version: API_TRIP_FACTS_STORAGE_VERSION,
    scope: normalizedScope,
    facts: normalized,
  };
  const key = storageKey(userId, roomId, normalizedScope);
  await enqueueStorageWrite(key, () => storage.setItem(key, JSON.stringify(stored)));
}

/** null storage entry만 미설정이며, 존재하지만 읽을 수 없는 값은 손상으로 격리한다. */
export function parseStoredApiTripLocalFacts(
  raw: string | null,
  expectedScope: ApiTripLocalFactsScope,
): ApiTripLocalFactsLoadResult {
  if (raw === null) return { status: "missing", value: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: "unavailable", value: null };
    }
    const stored = parsed as Partial<StoredApiTripLocalFacts>;
    if (stored.version !== API_TRIP_FACTS_STORAGE_VERSION
      || !stored.scope
      || typeof stored.scope !== "object"
      || Array.isArray(stored.scope)
      || !isValidScope(stored.scope as ApiTripLocalFactsScope)
      || !isValidScope(expectedScope)
      || !sameScope(stored.scope as ApiTripLocalFactsScope, expectedScope)) {
      return { status: "unavailable", value: null };
    }
    const facts = parseApiTripLocalFacts(stored.facts);
    return facts ? { status: "loaded", value: facts } : { status: "unavailable", value: null };
  } catch {
    return { status: "unavailable", value: null };
  }
}

export async function loadApiTripLocalFactsWithStatus(
  userId: string,
  roomId: string,
  scope: Pick<ApiTripLocalFactsScope, "startDate" | "endDate">,
  storage: ApiLocalStorageReader = AsyncStorage,
): Promise<ApiTripLocalFactsLoadResult> {
  const expectedScope: ApiTripLocalFactsScope = { roomId: roomId.trim(), ...scope };
  try {
    const current = await storage.getItem(storageKey(userId, roomId, expectedScope));
    if (current !== null) return parseStoredApiTripLocalFacts(current, expectedScope);
    // v1/v2에는 날짜가 storage key에 없어 느린 과거 범위 저장이 새 범위 값을
    // 덮어쓸 수 있다. 남은 값은 자동 이관하지 않고 명시적 초기화를 요구한다.
    const legacy = await Promise.all(LEGACY_API_TRIP_FACTS_STORAGE_VERSIONS.map((version) => (
      storage.getItem(legacyStorageKey(userId, roomId, version))
    )));
    return legacy.every((value) => value === null)
      ? { status: "missing", value: null }
      : { status: "unavailable", value: null };
  } catch {
    return { status: "unavailable", value: null };
  }
}

export async function loadApiTripLocalFacts(
  userId: string,
  roomId: string,
  scope: Pick<ApiTripLocalFactsScope, "startDate" | "endDate">,
  storage: ApiLocalStorageReader = AsyncStorage,
): Promise<ApiTripLocalFacts | null> {
  return (await loadApiTripLocalFactsWithStatus(userId, roomId, scope, storage)).value;
}

/** 사용자가 복구를 확인한 경우에만 현재 계정·여행방의 로컬 사실 키를 제거한다. */
export async function clearApiTripLocalFacts(
  userId: string,
  roomId: string,
  scope: Pick<ApiTripLocalFactsScope, "startDate" | "endDate">,
  storage: ApiLocalStorageRemover = AsyncStorage,
) {
  const currentKey = storageKey(userId, roomId, scope);
  await Promise.all([
    enqueueStorageWrite(currentKey, () => storage.removeItem(currentKey)),
    ...LEGACY_API_TRIP_FACTS_STORAGE_VERSIONS.map((version) => (
      storage.removeItem(legacyStorageKey(userId, roomId, version))
    )),
  ]);
}
