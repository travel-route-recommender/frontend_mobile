import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ItineraryItemType } from "../../../domain";
import {
  API_WORKSPACE_OVERLAY_STORAGE_VERSION,
  parseApiWorkspaceOverlays,
} from "../logic/apiWorkspaceOverlay";
import type {
  WorkspaceScheduleItemMetadata,
  WorkspaceScheduleLocalOverlay,
  WorkspaceScheduleScope,
  WorkspaceScheduleSnapshot,
} from "./workspaceScheduleContract";

const LEGACY_API_WORKSPACE_OVERLAY_STORAGE_VERSION = 1;
const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ITEM_TYPES = new Set<ItineraryItemType>(["place", "meal", "rest", "transport", "reservation"]);
const STORED_KEYS = new Set(["version", "scope", "scheduleVersion", "items", "savedAt"]);
const SCOPE_KEYS = new Set(["roomId", "startDate", "endDate"]);
const ENTRY_KEYS = new Set(["identity", "overlay"]);
const OVERLAY_KEYS = new Set(["itemType", "preferredByUserIds", "note", "lockedForDuri"]);

export type ApiWorkspaceOverlayScope = Pick<WorkspaceScheduleScope, "roomId" | "startDate" | "endDate">;

type ApiWorkspaceOverlaySnapshot = Pick<
  WorkspaceScheduleSnapshot,
  "scope" | "itinerary" | "metadataByItemId" | "priorityProtectionsByItemId" | "scheduleVersion"
>;

type StoredApiWorkspaceOverlayEntry = {
  identity: string;
  overlay: WorkspaceScheduleLocalOverlay;
};

type StoredApiWorkspaceOverlays = {
  version: typeof API_WORKSPACE_OVERLAY_STORAGE_VERSION;
  scope: ApiWorkspaceOverlayScope;
  /** Must match the server snapshot so a failed local write cannot revive the previous overlay. */
  scheduleVersion: number;
  items: Record<string, StoredApiWorkspaceOverlayEntry>;
  savedAt: string;
};

export type ApiWorkspaceOverlayLoadResult =
  | { status: "loaded"; value: Record<string, WorkspaceScheduleLocalOverlay> }
  | { status: "missing" | "unavailable"; value: Record<string, never> };

type ApiLocalStorageReader = Pick<typeof AsyncStorage, "getItem">;
type ApiLocalStorageRemover = Pick<typeof AsyncStorage, "removeItem">;
type ApiLocalStorageWriter = Pick<typeof AsyncStorage, "setItem">;

const pendingWritesByStorageKey = new Map<string, Promise<void>>();

function storageKey(userId: string, roomId: string, version: number = API_WORKSPACE_OVERLAY_STORAGE_VERSION) {
  const normalizedUserId = userId.trim();
  const normalizedRoomId = roomId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalizedUserId) || !MONGO_OBJECT_ID_PATTERN.test(normalizedRoomId)) {
    throw new Error("서버 사용자 또는 여행방 ID 형식이 올바르지 않아요.");
  }
  return `duri:api-workspace-overlays:v${version}:${normalizedUserId}:${normalizedRoomId}`;
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

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidScope(scope: ApiWorkspaceOverlayScope) {
  return MONGO_OBJECT_ID_PATTERN.test(scope.roomId)
    && isValidDateOnly(scope.startDate)
    && isValidDateOnly(scope.endDate)
    && scope.startDate <= scope.endDate;
}

function sameScope(left: ApiWorkspaceOverlayScope, right: ApiWorkspaceOverlayScope) {
  return left.roomId === right.roomId
    && left.startDate === right.startDate
    && left.endDate === right.endDate;
}

function expectedScope(snapshot: ApiWorkspaceOverlaySnapshot): ApiWorkspaceOverlayScope {
  return {
    roomId: snapshot.scope.roomId,
    startDate: snapshot.scope.startDate,
    endDate: snapshot.scope.endDate,
  };
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>) {
  return Object.keys(value).every((key) => keys.has(key));
}

function hasStrictStoredOverlayFields(value: unknown): value is WorkspaceScheduleLocalOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const overlay = value as Record<string, unknown>;
  if (!hasOnlyKeys(overlay, OVERLAY_KEYS)) return false;
  if (overlay.itemType !== undefined
    && (typeof overlay.itemType !== "string" || !ITEM_TYPES.has(overlay.itemType as ItineraryItemType))) return false;
  if (overlay.preferredByUserIds !== undefined) {
    if (!Array.isArray(overlay.preferredByUserIds)) return false;
    const userIds = overlay.preferredByUserIds;
    if (userIds.some((userId) => typeof userId !== "string" || !MONGO_OBJECT_ID_PATTERN.test(userId))) return false;
    if (new Set(userIds).size !== userIds.length) return false;
  }
  if (overlay.note !== undefined && (typeof overlay.note !== "string" || overlay.note.length > 120)) return false;
  if (overlay.lockedForDuri !== undefined && typeof overlay.lockedForDuri !== "boolean") return false;
  return Object.keys(overlay).length > 0;
}

function metadataForIdentity(
  itemId: string,
  metadataByItemId: Readonly<Record<string, WorkspaceScheduleItemMetadata | undefined>>,
) {
  const metadata = metadataByItemId[itemId];
  if (!metadata || metadata.itemId !== itemId || !metadata.placeName.trim()) {
    throw new Error(`일정 ${itemId}의 서버 metadata가 없어 기기 보조 정보를 안전하게 연결할 수 없어요.`);
  }
  return metadata;
}

/** JSON tuple prevents separator collisions while keeping the exact identity auditable in storage. */
export function buildApiWorkspaceOverlayItemIdentity(
  item: ApiWorkspaceOverlaySnapshot["itinerary"][number],
  metadata: Pick<WorkspaceScheduleItemMetadata, "itemId" | "placeName">,
) {
  if (!item.id.trim()
    || metadata.itemId !== item.id
    || !isValidDateOnly(item.date)
    || !TIME_PATTERN.test(item.startTime)
    || !Number.isInteger(item.durationMinutes)
    || item.durationMinutes <= 0) {
    throw new Error(`일정 ${item.id || "(ID 없음)"}의 정체성 정보가 올바르지 않아요.`);
  }
  return JSON.stringify([
    item.id,
    item.placeId ?? null,
    item.placeId ? null : metadata.placeName.trim(),
    item.date,
    item.startTime,
    item.durationMinutes,
  ]);
}

function localOverlayForItem(snapshot: ApiWorkspaceOverlaySnapshot, item: ApiWorkspaceOverlaySnapshot["itinerary"][number]) {
  const protection = snapshot.priorityProtectionsByItemId[item.id];
  const userLocked = item.lockedForDuri === true
    && (!protection || protection.userLockAlsoPresent);
  const overlay: WorkspaceScheduleLocalOverlay = {
    ...(item.itemType !== "place" ? { itemType: item.itemType } : {}),
    ...(item.preferredByUserIds.length ? { preferredByUserIds: [...item.preferredByUserIds] } : {}),
    ...(item.note !== undefined ? { note: item.note.slice(0, 120) } : {}),
    ...(userLocked ? { lockedForDuri: true } : {}),
  };
  return Object.keys(overlay).length ? overlay : undefined;
}

/** Only local-only semantics are persisted; server-default items need no provenance entry. */
export function buildStoredApiWorkspaceOverlays(snapshot: ApiWorkspaceOverlaySnapshot) {
  const entries: Record<string, StoredApiWorkspaceOverlayEntry> = {};
  const seen = new Set<string>();
  snapshot.itinerary.forEach((item) => {
    if (seen.has(item.id)) throw new Error(`중복 일정 ID ${item.id}의 기기 보조 정보를 저장할 수 없어요.`);
    seen.add(item.id);
    const overlay = localOverlayForItem(snapshot, item);
    if (!overlay) return;
    const metadata = metadataForIdentity(item.id, snapshot.metadataByItemId);
    entries[item.id] = {
      identity: buildApiWorkspaceOverlayItemIdentity(item, metadata),
      overlay,
    };
  });
  return entries;
}

function parseScope(value: unknown): ApiWorkspaceOverlayScope | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const scope = value as Record<string, unknown>;
  if (!hasOnlyKeys(scope, SCOPE_KEYS)
    || typeof scope.roomId !== "string"
    || typeof scope.startDate !== "string"
    || typeof scope.endDate !== "string") return undefined;
  const parsed = { roomId: scope.roomId, startDate: scope.startDate, endDate: scope.endDate };
  return isValidScope(parsed) ? parsed : undefined;
}

/** null storage entry만 미설정이며, scope·항목 정체성이 다른 저장값은 적용하지 않는다. */
export function parseStoredApiWorkspaceOverlays(
  raw: string | null,
  snapshot: ApiWorkspaceOverlaySnapshot,
): ApiWorkspaceOverlayLoadResult {
  if (raw === null) return { status: "missing", value: {} };
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "unavailable", value: {} };
    }
    const record = value as Record<string, unknown>;
    const storedScope = parseScope(record.scope);
    const currentScope = expectedScope(snapshot);
    if (!hasOnlyKeys(record, STORED_KEYS)
      || record.version !== API_WORKSPACE_OVERLAY_STORAGE_VERSION
      || !storedScope
      || !isValidScope(currentScope)
      || !sameScope(storedScope, currentScope)
      || !Number.isInteger(record.scheduleVersion)
      || (record.scheduleVersion as number) < 0
      || record.scheduleVersion !== snapshot.scheduleVersion
      || !record.items
      || typeof record.items !== "object"
      || Array.isArray(record.items)
      || typeof record.savedAt !== "string"
      || !Number.isFinite(Date.parse(record.savedAt))) {
      return { status: "unavailable", value: {} };
    }

    const currentById = new Map(snapshot.itinerary.map((item) => [item.id, item]));
    const overlays: Record<string, WorkspaceScheduleLocalOverlay> = {};
    for (const [itemId, entryValue] of Object.entries(record.items as Record<string, unknown>)) {
      if (!itemId.trim() || !entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) {
        return { status: "unavailable", value: {} };
      }
      const entry = entryValue as Record<string, unknown>;
      if (!hasOnlyKeys(entry, ENTRY_KEYS)
        || typeof entry.identity !== "string"
        || !entry.identity
        || entry.identity.length > 1_024
        || !hasStrictStoredOverlayFields(entry.overlay)) {
        return { status: "unavailable", value: {} };
      }
      const currentItem = currentById.get(itemId);
      if (!currentItem) return { status: "unavailable", value: {} };
      const metadata = metadataForIdentity(itemId, snapshot.metadataByItemId);
      if (entry.identity !== buildApiWorkspaceOverlayItemIdentity(currentItem, metadata)) {
        return { status: "unavailable", value: {} };
      }
      const normalized = parseApiWorkspaceOverlays({
        version: API_WORKSPACE_OVERLAY_STORAGE_VERSION,
        items: { [itemId]: entry.overlay },
      })[itemId];
      if (!normalized) return { status: "unavailable", value: {} };
      overlays[itemId] = normalized;
    }
    return { status: "loaded", value: overlays };
  } catch {
    return { status: "unavailable", value: {} };
  }
}

export async function loadApiWorkspaceOverlaysWithStatus(
  userId: string,
  roomId: string,
  snapshot: ApiWorkspaceOverlaySnapshot,
  storage: ApiLocalStorageReader = AsyncStorage,
): Promise<ApiWorkspaceOverlayLoadResult> {
  try {
    if (snapshot.scope.roomId !== roomId.trim()) return { status: "unavailable", value: {} };
    const current = await storage.getItem(storageKey(userId, roomId));
    if (current !== null) return parseStoredApiWorkspaceOverlays(current, snapshot);
    const legacy = await storage.getItem(storageKey(userId, roomId, LEGACY_API_WORKSPACE_OVERLAY_STORAGE_VERSION));
    return legacy === null
      ? { status: "missing", value: {} }
      : { status: "unavailable", value: {} };
  } catch {
    return { status: "unavailable", value: {} };
  }
}

export async function loadApiWorkspaceOverlays(
  userId: string,
  roomId: string,
  snapshot: ApiWorkspaceOverlaySnapshot,
  storage: ApiLocalStorageReader = AsyncStorage,
) {
  return (await loadApiWorkspaceOverlaysWithStatus(userId, roomId, snapshot, storage)).value;
}

/** 사용자가 복구를 확인한 경우에만 현재 계정·여행방의 v2/v1 overlay 키를 제거한다. */
export async function clearApiWorkspaceOverlays(
  userId: string,
  roomId: string,
  storage: ApiLocalStorageRemover = AsyncStorage,
) {
  const currentKey = storageKey(userId, roomId);
  await Promise.all([
    enqueueStorageWrite(currentKey, () => storage.removeItem(currentKey)),
    storage.removeItem(storageKey(userId, roomId, LEGACY_API_WORKSPACE_OVERLAY_STORAGE_VERSION)),
  ]);
}

export async function saveApiWorkspaceOverlays(
  userId: string,
  roomId: string,
  snapshot: ApiWorkspaceOverlaySnapshot,
  storage: ApiLocalStorageWriter = AsyncStorage,
) {
  const scope = expectedScope(snapshot);
  if (scope.roomId !== roomId.trim() || !isValidScope(scope)) {
    throw new Error("서버 일정과 여행방 날짜 범위가 일치하지 않아 기기 보조 정보를 저장하지 않았어요.");
  }
  const value: StoredApiWorkspaceOverlays = {
    version: API_WORKSPACE_OVERLAY_STORAGE_VERSION,
    scope,
    scheduleVersion: snapshot.scheduleVersion,
    items: buildStoredApiWorkspaceOverlays(snapshot),
    savedAt: new Date().toISOString(),
  };
  const key = storageKey(userId, roomId);
  await enqueueStorageWrite(key, () => storage.setItem(key, JSON.stringify(value)));
}
