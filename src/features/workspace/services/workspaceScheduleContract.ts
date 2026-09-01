import type { ItineraryItem, ItineraryItemType, Place } from "../../../domain";

export type BackendSchedulePriority = "must" | "optional" | "skip";

export type BackendSignedDownload = {
  token: string;
  url: string;
  path: string;
  expiresAt: string;
  expiresInSec: number;
};

export type BackendVersionedValue<T> = {
  value: T;
  updatedBy: string;
  updatedAt: string;
  confirmedAt?: string;
  version: number;
};

export type BackendPlaceAnchor = {
  name: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  externalId?: string;
  source?: "tour" | "kakao" | "manual";
};

export type BackendWorkspacePlanning = {
  timezone: string;
  lodging?: BackendPlaceAnchor;
  returnPoint?: BackendPlaceAnchor;
  transportMode?: BackendVersionedValue<"car" | "transit" | "walk" | "mixed">;
  returnDeadline?: BackendVersionedValue<string>;
  travelBufferMinutes?: BackendVersionedValue<number>;
  prepBufferMinutes?: BackendVersionedValue<number>;
};

export type BackendScheduleReservation = {
  id: string;
  status: "confirmed" | "unconfirmed" | "cancelled";
  date?: string;
  startTime?: string;
  endTime?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  timezone?: string;
  placeId?: string;
  externalId?: string;
  confirmationCode?: string;
  note?: string;
  documentTicketIds: string[];
  confirmedBy?: string;
  confirmedAt?: string;
  revision: number;
};

export type BackendScheduleTicket = {
  id: string;
  imageUrl: string;
  resolvedImageUrl?: string;
  uploadedBy: string;
  note?: string;
  originalName?: string;
  mimeType?: string;
  createdAt: string;
  download?: BackendSignedDownload;
};

export type BackendScheduleItem = {
  id: string;
  placeId?: string;
  placeName: string;
  startTime: string;
  endTime: string;
  tags: string[];
  reason: string;
  priority: BackendSchedulePriority;
  day: number;
  lat?: number;
  lng?: number;
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  tickets: BackendScheduleTicket[];
  reservation?: BackendScheduleReservation;
};

export type BackendScheduleDay = {
  day: number;
  items: BackendScheduleItem[];
};

export type BackendRoomSchedule = {
  days: BackendScheduleDay[];
  scheduleVersion: number;
  planning?: BackendWorkspacePlanning;
};

export type BackendBatchScheduleItem = Pick<BackendScheduleItem,
  | "id"
  | "placeId"
  | "placeName"
  | "startTime"
  | "endTime"
  | "tags"
  | "reason"
  | "priority"
  | "day"
  | "lat"
  | "lng"
  | "locked"
>;

export type BackendBatchScheduleRequest = {
  days: {
    day: number;
    items: BackendBatchScheduleItem[];
  }[];
  expectedVersion: number;
  clientMutationId?: string;
};

/**
 * Server-only fields which the current UI itinerary model cannot represent.
 * Keep this alongside ItineraryItem so a load -> edit -> batch-save does not
 * discard place labels, route coordinates, priority, or ticket references.
 */
export type WorkspaceScheduleItemMetadata = {
  itemId: string;
  placeName: string;
  tags: string[];
  reason: string;
  priority: BackendSchedulePriority;
  /** Backend에서 읽은 원래 종료 시각. 정밀 계약 감사와 무손실 비교에 사용한다. */
  wireEndTime?: string;
  lat?: number;
  lng?: number;
  /** Backend shared lock. Device overlays must never override this value. */
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  tickets: BackendScheduleTicket[];
  reservation?: BackendScheduleReservation;
};

export type WorkspaceScheduleLocalOverlay = {
  itemType?: ItineraryItemType;
  preferredByUserIds?: string[];
  note?: string;
  lockedForDuri?: boolean;
};

/**
 * Identity and calendar range used when this schedule version was read.
 * A scheduleVersion is only meaningful inside this exact scope and must never
 * be reused for a different room, local trip projection, or date range.
 */
export type WorkspaceScheduleScope = {
  roomId: string;
  tripId: string;
  startDate: string;
  endDate: string;
};

export type WorkspaceScheduleSnapshot = {
  scope: WorkspaceScheduleScope;
  itinerary: ItineraryItem[];
  metadataByItemId: Record<string, WorkspaceScheduleItemMetadata>;
  priorityProtectionsByItemId: Record<string, WorkspaceSchedulePriorityProtection>;
  scheduleVersion: number;
  planning?: BackendWorkspacePlanning;
};

export type WorkspaceSchedulePriorityProtection = {
  itemId: string;
  source: "backend-priority-must" | "backend-confirmed-reservation";
  evidenceKind: "server-declared-priority" | "confirmed-reservation";
  documentConfirmed: boolean;
  reservationConfirmed: boolean;
  effectiveLock: "all-duri-changes";
  blockedChanges: readonly ("delete" | "replace-place" | "change-date" | "change-time")[];
  userLockAlsoPresent: boolean;
};

export type TicketRemovalImpact = {
  itemId: string;
  placeName: string;
  tickets: BackendScheduleTicket[];
  action: "delete" | "replace";
};

export class WorkspaceScheduleContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WorkspaceScheduleContractError";
    this.path = path;
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BACKEND_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function contractError(path: string, message: string): never {
  throw new WorkspaceScheduleContractError(path, message);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return contractError(path, "객체 응답이어야 합니다.");
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return contractError(path, "배열이어야 합니다.");
  return value;
}

function asRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return contractError(path, "비어 있지 않은 문자열이어야 합니다.");
  }
  return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return contractError(path, "문자열이어야 합니다.");
  return value;
}

function asOptionalMongoObjectId(value: unknown, path: string): string | undefined {
  const parsed = asOptionalString(value, path);
  if (parsed === undefined) return undefined;
  if (!MONGO_OBJECT_ID_PATTERN.test(parsed)) {
    return contractError(path, "Backend DTO와 같은 Mongo ObjectId(24자리 16진수)여야 합니다.");
  }
  return parsed;
}

function asRequiredMongoObjectId(value: unknown, path: string): string {
  const parsed = asOptionalMongoObjectId(value, path);
  if (!parsed) return contractError(path, "Backend place ID가 필요합니다.");
  return parsed;
}

function asInteger(value: unknown, path: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    return contractError(path, `${minimum} 이상의 정수여야 합니다.`);
  }
  return value as number;
}

function asOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return contractError(path, "유한한 숫자여야 합니다.");
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return contractError(path, "boolean이어야 합니다.");
  return value;
}

function asOptionalTimestamp(value: unknown, path: string): string | undefined {
  const parsed = asOptionalString(value, path);
  if (parsed === undefined) return undefined;
  if (!Number.isFinite(Date.parse(parsed))) return contractError(path, "유효한 날짜/시간 문자열이어야 합니다.");
  return parsed;
}

function asOptionalEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    return contractError(path, `${values.join(", ")} 중 하나여야 합니다.`);
  }
  return value as T;
}

function asCoordinates(latitudeValue: unknown, longitudeValue: unknown, path: string) {
  const latitude = asOptionalNumber(latitudeValue, `${path}.lat`);
  const longitude = asOptionalNumber(longitudeValue, `${path}.lng`);
  // Swagger/Backend DTO declares lat and lng as independently optional. Keep
  // every finite wire value losslessly; route collection separately requires
  // a complete, geographically valid pair before using it as evidence.
  return {
    ...(latitude !== undefined ? { lat: latitude } : {}),
    ...(longitude !== undefined ? { lng: longitude } : {}),
  };
}

function asStringArray(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  return asArray(value, path).map((entry, index) => {
    if (typeof entry !== "string") return contractError(`${path}[${index}]`, "문자열이어야 합니다.");
    return entry;
  });
}

function parseSignedDownload(value: unknown, path: string): BackendSignedDownload | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const url = asRequiredString(record.url, `${path}.url`);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return contractError(`${path}.url`, "HTTP(S) URL이어야 합니다.");
  } catch {
    return contractError(`${path}.url`, "유효한 URL이어야 합니다.");
  }
  return {
    token: asRequiredString(record.token, `${path}.token`),
    url,
    path: asRequiredString(record.path, `${path}.path`),
    expiresAt: asOptionalTimestamp(record.expiresAt, `${path}.expiresAt`)
      ?? contractError(`${path}.expiresAt`, "만료 시각이 필요합니다."),
    expiresInSec: asInteger(record.expiresInSec, `${path}.expiresInSec`, 0),
  };
}

function parsePlaceAnchor(value: unknown, path: string): BackendPlaceAnchor | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const source = asOptionalEnum(record.source, `${path}.source`, ["tour", "kakao", "manual"] as const);
  const placeId = asOptionalMongoObjectId(record.placeId, `${path}.placeId`);
  const externalId = asOptionalString(record.externalId, `${path}.externalId`);
  return {
    name: asRequiredString(record.name, `${path}.name`),
    ...(asOptionalNumber(record.lat, `${path}.lat`) !== undefined ? { lat: asOptionalNumber(record.lat, `${path}.lat`) } : {}),
    ...(asOptionalNumber(record.lng, `${path}.lng`) !== undefined ? { lng: asOptionalNumber(record.lng, `${path}.lng`) } : {}),
    ...(placeId ? { placeId } : {}),
    ...(externalId ? { externalId } : {}),
    ...(source ? { source } : {}),
  };
}

function parseVersionedValue<T>(
  value: unknown,
  path: string,
  parseValue: (value: unknown, path: string) => T,
): BackendVersionedValue<T> | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const confirmedAt = asOptionalTimestamp(record.confirmedAt, `${path}.confirmedAt`);
  return {
    value: parseValue(record.value, `${path}.value`),
    updatedBy: asRequiredString(record.updatedBy, `${path}.updatedBy`),
    updatedAt: asOptionalTimestamp(record.updatedAt, `${path}.updatedAt`)
      ?? contractError(`${path}.updatedAt`, "수정 시각이 필요합니다."),
    ...(confirmedAt ? { confirmedAt } : {}),
    version: asInteger(record.version, `${path}.version`, 1),
  };
}

export function parseBackendWorkspacePlanning(value: unknown, path = "planning"): BackendWorkspacePlanning | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const transportMode = parseVersionedValue(record.transportMode, `${path}.transportMode`, (entry, entryPath) => (
    asOptionalEnum(entry, entryPath, ["car", "transit", "walk", "mixed"] as const)
      ?? contractError(entryPath, "이동수단 값이 필요합니다.")
  ));
  const returnDeadline = parseVersionedValue(record.returnDeadline, `${path}.returnDeadline`, (entry, entryPath) => {
    const parsed = asRequiredString(entry, entryPath);
    timeToMinutes(parsed, entryPath);
    return parsed;
  });
  const parseNonNegativeInteger = (entry: unknown, entryPath: string) => asInteger(entry, entryPath, 0);
  return {
    timezone: asOptionalString(record.timezone, `${path}.timezone`) ?? "Asia/Seoul",
    ...(parsePlaceAnchor(record.lodging, `${path}.lodging`) ? { lodging: parsePlaceAnchor(record.lodging, `${path}.lodging`) } : {}),
    ...(parsePlaceAnchor(record.returnPoint, `${path}.returnPoint`) ? { returnPoint: parsePlaceAnchor(record.returnPoint, `${path}.returnPoint`) } : {}),
    ...(transportMode ? { transportMode } : {}),
    ...(returnDeadline ? { returnDeadline } : {}),
    ...(parseVersionedValue(record.travelBufferMinutes, `${path}.travelBufferMinutes`, parseNonNegativeInteger)
      ? { travelBufferMinutes: parseVersionedValue(record.travelBufferMinutes, `${path}.travelBufferMinutes`, parseNonNegativeInteger) }
      : {}),
    ...(parseVersionedValue(record.prepBufferMinutes, `${path}.prepBufferMinutes`, parseNonNegativeInteger)
      ? { prepBufferMinutes: parseVersionedValue(record.prepBufferMinutes, `${path}.prepBufferMinutes`, parseNonNegativeInteger) }
      : {}),
  };
}

function parseReservation(value: unknown, path: string): BackendScheduleReservation | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const status = asOptionalEnum(record.status, `${path}.status`, ["confirmed", "unconfirmed", "cancelled"] as const)
    ?? contractError(`${path}.status`, "예약 상태가 필요합니다.");
  const date = asOptionalString(record.date, `${path}.date`);
  if (date && !DATE_ONLY_PATTERN.test(date)) return contractError(`${path}.date`, "YYYY-MM-DD 형식이어야 합니다.");
  const timeField = (key: "startTime" | "endTime" | "timeWindowStart" | "timeWindowEnd") => {
    const parsed = asOptionalString(record[key], `${path}.${key}`);
    if (parsed) timeToMinutes(parsed, `${path}.${key}`);
    return parsed;
  };
  const confirmedAt = asOptionalTimestamp(record.confirmedAt, `${path}.confirmedAt`);
  const placeId = asOptionalMongoObjectId(record.placeId, `${path}.placeId`);
  const optionalFields = {
    date,
    startTime: timeField("startTime"),
    endTime: timeField("endTime"),
    timeWindowStart: timeField("timeWindowStart"),
    timeWindowEnd: timeField("timeWindowEnd"),
    timezone: asOptionalString(record.timezone, `${path}.timezone`),
    externalId: asOptionalString(record.externalId, `${path}.externalId`),
    confirmationCode: asOptionalString(record.confirmationCode, `${path}.confirmationCode`),
    note: asOptionalString(record.note, `${path}.note`),
    confirmedBy: asOptionalString(record.confirmedBy, `${path}.confirmedBy`),
  };
  return {
    id: asRequiredString(record.id, `${path}.id`),
    status,
    ...Object.fromEntries(Object.entries(optionalFields).filter(([, entry]) => entry !== undefined)),
    ...(placeId ? { placeId } : {}),
    documentTicketIds: asStringArray(record.documentTicketIds, `${path}.documentTicketIds`),
    ...(confirmedAt ? { confirmedAt } : {}),
    revision: asInteger(record.revision, `${path}.revision`, 1),
  } as BackendScheduleReservation;
}

function asPriority(value: unknown, path: string): BackendSchedulePriority {
  if (value === undefined || value === null || value === "") return "optional";
  if (value === "must" || value === "optional" || value === "skip") return value;
  return contractError(path, "must, optional, skip 중 하나여야 합니다.");
}

function timeToMinutes(value: string, path: string): number {
  if (!BACKEND_TIME_PATTERN.test(value)) {
    return contractError(path, "Backend DTO와 같은 HH:mm(00:00-23:59) 형식이어야 합니다.");
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatBackendEndTime(minutes: number, path: string): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 23 * 60 + 59) {
    return contractError(path, "Backend DTO는 24:00을 표현할 수 없으므로 같은 날짜의 23:59 이내여야 합니다.");
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseTicket(value: unknown, path: string): BackendScheduleTicket {
  const record = asRecord(value, path);
  const createdAt = asRequiredString(record.createdAt, `${path}.createdAt`);
  if (!Number.isFinite(Date.parse(createdAt))) {
    return contractError(`${path}.createdAt`, "유효한 날짜/시간 문자열이어야 합니다.");
  }
  const download = parseSignedDownload(record.download, `${path}.download`);
  return {
    id: asRequiredString(record.id, `${path}.id`),
    imageUrl: asRequiredString(record.imageUrl, `${path}.imageUrl`),
    uploadedBy: asRequiredString(record.uploadedBy, `${path}.uploadedBy`),
    ...(asOptionalString(record.note, `${path}.note`) ? { note: asOptionalString(record.note, `${path}.note`) } : {}),
    ...(asOptionalString(record.originalName, `${path}.originalName`) ? { originalName: asOptionalString(record.originalName, `${path}.originalName`) } : {}),
    ...(asOptionalString(record.mimeType, `${path}.mimeType`) ? { mimeType: asOptionalString(record.mimeType, `${path}.mimeType`) } : {}),
    createdAt,
    ...(download ? { download } : {}),
  };
}

function parseScheduleItem(value: unknown, containerDay: number, path: string): BackendScheduleItem {
  const record = asRecord(value, path);
  const itemDay = record.day === undefined ? containerDay : asInteger(record.day, `${path}.day`, 1);
  if (itemDay !== containerDay) {
    return contractError(`${path}.day`, `상위 day(${containerDay})와 일치해야 합니다.`);
  }
  const startTime = asRequiredString(record.startTime, `${path}.startTime`);
  const endTime = asRequiredString(record.endTime, `${path}.endTime`);
  const startMinutes = timeToMinutes(startTime, `${path}.startTime`);
  const endMinutes = timeToMinutes(endTime, `${path}.endTime`);
  if (endMinutes <= startMinutes) {
    return contractError(`${path}.endTime`, "startTime보다 이후여야 합니다.");
  }
  const coordinates = asCoordinates(record.lat, record.lng, path);
  const locked = record.locked === undefined || record.locked === null
    ? false
    : asBoolean(record.locked, `${path}.locked`);
  const lockedBy = asOptionalString(record.lockedBy, `${path}.lockedBy`);
  const lockedAt = asOptionalTimestamp(record.lockedAt, `${path}.lockedAt`);
  const reservation = parseReservation(record.reservation, `${path}.reservation`);
  return {
    id: asRequiredString(record.id, `${path}.id`),
    ...(asOptionalMongoObjectId(record.placeId, `${path}.placeId`) ? { placeId: asOptionalMongoObjectId(record.placeId, `${path}.placeId`) } : {}),
    placeName: asRequiredString(record.placeName, `${path}.placeName`),
    startTime,
    endTime,
    tags: asStringArray(record.tags, `${path}.tags`),
    reason: asOptionalString(record.reason, `${path}.reason`) ?? "",
    priority: asPriority(record.priority, `${path}.priority`),
    day: itemDay,
    ...coordinates,
    locked,
    ...(lockedBy ? { lockedBy } : {}),
    ...(lockedAt ? { lockedAt } : {}),
    tickets: record.tickets === undefined
      ? []
      : asArray(record.tickets, `${path}.tickets`).map((ticket, index) => parseTicket(ticket, `${path}.tickets[${index}]`)),
    ...(reservation ? { reservation } : {}),
  };
}

export function parseBackendRoomSchedule(payload: unknown): BackendRoomSchedule {
  const record = asRecord(payload, "schedule");
  const scheduleVersion = asInteger(record.scheduleVersion, "schedule.scheduleVersion", 0);
  // The current Mongoose runtime can serialize the embedded schedule as
  // `{ _doc: { days }, scheduleVersion }` even though Swagger documents
  // `{ days, scheduleVersion }`. Accept only that exact compatibility shell;
  // all DAY/item fields below remain strictly validated.
  const scheduleRecord = record.days !== undefined
    ? record
    : asRecord(record._doc, "schedule._doc");
  const seenDays = new Set<number>();
  const seenItemIds = new Set<string>();
  const days = asArray(scheduleRecord.days, "schedule.days").map((entry, dayIndex) => {
    const path = `schedule.days[${dayIndex}]`;
    const dayRecord = asRecord(entry, path);
    const day = asInteger(dayRecord.day, `${path}.day`, 1);
    if (seenDays.has(day)) return contractError(`${path}.day`, "중복된 DAY입니다.");
    seenDays.add(day);
    const items = asArray(dayRecord.items, `${path}.items`).map((item, itemIndex) => {
      const parsed = parseScheduleItem(item, day, `${path}.items[${itemIndex}]`);
      if (seenItemIds.has(parsed.id)) {
        return contractError(`${path}.items[${itemIndex}].id`, "일정 전체에서 중복된 ID입니다.");
      }
      seenItemIds.add(parsed.id);
      return parsed;
    });
    return { day, items };
  });
  const planning = parseBackendWorkspacePlanning(record.planning, "schedule.planning");
  return { days, scheduleVersion, ...(planning ? { planning } : {}) };
}

export function buildScheduleTripDates(startDate: string, endDate: string): string[] {
  if (!DATE_ONLY_PATTERN.test(startDate) || !DATE_ONLY_PATTERN.test(endDate)) {
    return contractError("trip.dates", "YYYY-MM-DD 형식이어야 합니다.");
  }
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || new Date(start).toISOString().slice(0, 10) !== startDate
    || new Date(end).toISOString().slice(0, 10) !== endDate
    || end < start
  ) {
    return contractError("trip.dates", "유효한 시작일과 종료일이 필요합니다.");
  }
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

export function resolveScheduleTicketImageUrl(imageUrl: string, apiBaseUrl: string): string | undefined {
  try {
    const trimmed = imageUrl.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return undefined;
    const target = /^https?:\/\//i.test(trimmed) ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
    const resolved = new URL(target, apiBaseUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function applyBackendMustPriorityProtection(input: {
  itinerary: readonly ItineraryItem[];
  metadataByItemId: Readonly<Record<string, Pick<WorkspaceScheduleItemMetadata, "priority" | "locked" | "reservation"> | undefined>>;
  /** User-authored locks are kept separate so a later must -> optional change is reversible. */
  userLockedItemIds: ReadonlySet<string>;
}): {
  itinerary: ItineraryItem[];
  priorityProtectionsByItemId: Record<string, WorkspaceSchedulePriorityProtection>;
} {
  const priorityProtectionsByItemId: Record<string, WorkspaceSchedulePriorityProtection> = {};
  const itinerary = input.itinerary.map((item) => {
    const metadata = input.metadataByItemId[item.id];
    const userLocked = input.userLockedItemIds.has(item.id) || metadata?.locked === true;
    const priorityMust = metadata?.priority === "must";
    const confirmedReservation = metadata?.reservation?.status === "confirmed";
    if (priorityMust || confirmedReservation) {
      const reservationProtection = confirmedReservation;
      priorityProtectionsByItemId[item.id] = {
        itemId: item.id,
        source: reservationProtection ? "backend-confirmed-reservation" : "backend-priority-must",
        evidenceKind: reservationProtection ? "confirmed-reservation" : "server-declared-priority",
        documentConfirmed: Boolean(metadata?.reservation?.documentTicketIds.length),
        reservationConfirmed: reservationProtection,
        effectiveLock: "all-duri-changes",
        blockedChanges: ["delete", "replace-place", "change-date", "change-time"],
        userLockAlsoPresent: userLocked,
      };
    }
    const { lockedForDuri: _staleLock, ...unlockedItem } = item;
    return userLocked || priorityMust || confirmedReservation
      ? { ...unlockedItem, lockedForDuri: true }
      : unlockedItem;
  });
  return { itinerary, priorityProtectionsByItemId };
}

/**
 * Applies already provenance-validated device-only fields to a server snapshot.
 * The server reason and must-priority protection remain authoritative.
 */
export function applyWorkspaceScheduleLocalOverlays(
  snapshot: WorkspaceScheduleSnapshot,
  overlaysByItemId: Readonly<Record<string, WorkspaceScheduleLocalOverlay | undefined>>,
): WorkspaceScheduleSnapshot {
  const userLockedItemIds = new Set<string>();
  const itinerary = snapshot.itinerary.map((item) => {
    const overlay = overlaysByItemId[item.id];
    if (overlay?.lockedForDuri === true) userLockedItemIds.add(item.id);
    const {
      itemType: _staleItemType,
      preferredByUserIds: _stalePreferredByUserIds,
      note: _staleNote,
      lockedForDuri: _staleLock,
      ...serverItem
    } = item;
    const serverReason = snapshot.metadataByItemId[item.id]?.reason ?? "";
    const note = serverReason || overlay?.note;
    return {
      ...serverItem,
      itemType: overlay?.itemType ?? "place",
      preferredByUserIds: [...(overlay?.preferredByUserIds ?? [])],
      ...(note ? { note } : {}),
      ...(overlay?.lockedForDuri === true || snapshot.metadataByItemId[item.id]?.locked === true
        ? { lockedForDuri: true }
        : {}),
    };
  });
  return {
    ...snapshot,
    ...applyBackendMustPriorityProtection({
      itinerary,
      metadataByItemId: snapshot.metadataByItemId,
      userLockedItemIds,
    }),
  };
}

/**
 * Creates the required sidecar for a newly scheduled Backend candidate.
 * This only copies facts already present on Place. It deliberately does not
 * infer reservation evidence, tickets, or a must priority.
 */
export function createWorkspaceScheduleItemMetadataFromPlace(input: {
  itemId: string;
  place: Pick<Place, "id" | "name" | "tags" | "latitude" | "longitude">;
  reason?: string;
  priority?: BackendSchedulePriority;
}): WorkspaceScheduleItemMetadata {
  const itemId = asRequiredString(input.itemId, "itemId").trim();
  asRequiredMongoObjectId(input.place.id, "place.id");
  const latitude = asOptionalNumber(input.place.latitude, "place.latitude");
  const longitude = asOptionalNumber(input.place.longitude, "place.longitude");
  return {
    itemId,
    placeName: asRequiredString(input.place.name, "place.name"),
    tags: asStringArray(input.place.tags, "place.tags"),
    reason: asOptionalString(input.reason, "reason") ?? "",
    priority: asPriority(input.priority, "priority"),
    ...(latitude !== undefined ? { lat: latitude } : {}),
    ...(longitude !== undefined ? { lng: longitude } : {}),
    locked: false,
    tickets: [],
  };
}

export function mapBackendScheduleToWorkspace(input: {
  payload: unknown;
  roomId: string;
  tripId: string;
  startDate: string;
  endDate: string;
  apiBaseUrl: string;
  overlaysByItemId?: Readonly<Record<string, WorkspaceScheduleLocalOverlay | undefined>>;
}): WorkspaceScheduleSnapshot {
  const schedule = parseBackendRoomSchedule(input.payload);
  const tripDates = buildScheduleTripDates(input.startDate, input.endDate);
  const roomId = asRequiredString(input.roomId, "roomId").trim();
  const tripId = asRequiredString(input.tripId, "tripId").trim();
  const itinerary: ItineraryItem[] = [];
  const metadataByItemId: Record<string, WorkspaceScheduleItemMetadata> = {};
  const userLockedItemIds = new Set<string>();

  schedule.days.forEach((scheduleDay) => {
    const date = tripDates[scheduleDay.day - 1];
    if (!date) {
      return contractError(`schedule.days[day=${scheduleDay.day}]`, "여행 기간을 벗어난 DAY입니다.");
    }
    scheduleDay.items.forEach((serverItem) => {
      const overlay = input.overlaysByItemId?.[serverItem.id];
      if (overlay?.lockedForDuri === true || serverItem.locked) userLockedItemIds.add(serverItem.id);
      const startMinutes = timeToMinutes(serverItem.startTime, `schedule.items.${serverItem.id}.startTime`);
      const endMinutes = timeToMinutes(serverItem.endTime, `schedule.items.${serverItem.id}.endTime`);
      itinerary.push({
        id: serverItem.id,
        tripId,
        ...(serverItem.placeId ? { placeId: serverItem.placeId } : {}),
        date,
        startTime: serverItem.startTime,
        durationMinutes: endMinutes - startMinutes,
        itemType: overlay?.itemType ?? "place",
        preferredByUserIds: [...(overlay?.preferredByUserIds ?? [])],
        ...(serverItem.reason || overlay?.note ? { note: serverItem.reason || overlay?.note } : {}),
        ...(overlay?.lockedForDuri === true || serverItem.locked ? { lockedForDuri: true } : {}),
      });
      metadataByItemId[serverItem.id] = {
        itemId: serverItem.id,
        placeName: serverItem.placeName,
        tags: [...serverItem.tags],
        reason: serverItem.reason,
        priority: serverItem.priority,
        wireEndTime: serverItem.endTime,
        ...(serverItem.lat !== undefined ? { lat: serverItem.lat } : {}),
        ...(serverItem.lng !== undefined ? { lng: serverItem.lng } : {}),
        locked: serverItem.locked,
        ...(serverItem.lockedBy ? { lockedBy: serverItem.lockedBy } : {}),
        ...(serverItem.lockedAt ? { lockedAt: serverItem.lockedAt } : {}),
        tickets: serverItem.tickets.map((ticket) => {
          const resolvedImageUrl = ticket.download?.url
            ?? resolveScheduleTicketImageUrl(ticket.imageUrl, input.apiBaseUrl);
          return { ...ticket, ...(resolvedImageUrl ? { resolvedImageUrl } : {}) };
        }),
        ...(serverItem.reservation ? { reservation: serverItem.reservation } : {}),
      };
    });
  });

  const protectedSchedule = applyBackendMustPriorityProtection({
    itinerary,
    metadataByItemId,
    userLockedItemIds,
  });
  return {
    scope: {
      roomId,
      tripId,
      startDate: tripDates[0],
      endDate: tripDates[tripDates.length - 1],
    },
    ...protectedSchedule,
    metadataByItemId,
    scheduleVersion: schedule.scheduleVersion,
    ...(schedule.planning ? { planning: schedule.planning } : {}),
  };
}

export function mapWorkspaceScheduleToBatch(input: {
  itinerary: readonly ItineraryItem[];
  metadataByItemId: Readonly<Record<string, WorkspaceScheduleItemMetadata | undefined>>;
  tripId: string;
  startDate: string;
  endDate: string;
  expectedVersion: number;
  userLockedItemIds?: ReadonlySet<string>;
  clientMutationId?: string;
}): BackendBatchScheduleRequest {
  const tripDates = buildScheduleTripDates(input.startDate, input.endDate);
  const tripId = asRequiredString(input.tripId, "tripId").trim();
  const dayByDate = new Map(tripDates.map((date, index) => [date, index + 1]));
  const expectedVersion = asInteger(input.expectedVersion, "expectedVersion", 0);
  const seenIds = new Set<string>();
  const days: BackendBatchScheduleRequest["days"] = tripDates.map((_, index) => ({ day: index + 1, items: [] }));

  input.itinerary.forEach((item, index) => {
    const path = `itinerary[${index}]`;
    const itemId = asRequiredString(item.id, `${path}.id`).trim();
    if (item.tripId !== tripId) {
      return contractError(`${path}.tripId`, "저장 대상 여행 ID와 일치해야 합니다.");
    }
    if (seenIds.has(itemId)) return contractError(`${path}.id`, "중복된 일정 ID입니다.");
    seenIds.add(itemId);
    const day = dayByDate.get(item.date);
    if (!day) return contractError(`${path}.date`, "여행 기간을 벗어난 날짜입니다.");
    if (!Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0) {
      return contractError(`${path}.durationMinutes`, "1분 이상의 정수여야 합니다.");
    }
    const startMinutes = timeToMinutes(item.startTime, `${path}.startTime`);
    const endTime = formatBackendEndTime(startMinutes + item.durationMinutes, `${path}.durationMinutes`);
    const metadata = input.metadataByItemId[itemId];
    if (!metadata) return contractError(`${path}.metadata`, "서버 필드 보존을 위한 메타데이터가 필요합니다.");
    if (metadata.itemId !== itemId) return contractError(`${path}.metadata.itemId`, "일정 ID와 일치해야 합니다.");
    const coordinates = asCoordinates(metadata.lat, metadata.lng, `${path}.metadata`);

    days[day - 1].items.push({
      id: itemId,
      ...(item.placeId ? { placeId: asOptionalMongoObjectId(item.placeId, `${path}.placeId`) } : {}),
      placeName: asRequiredString(metadata.placeName, `${path}.metadata.placeName`),
      startTime: item.startTime,
      endTime,
      tags: asStringArray(metadata.tags, `${path}.metadata.tags`),
      reason: item.note ?? metadata.reason,
      priority: asPriority(metadata.priority, `${path}.metadata.priority`),
      day,
      ...coordinates,
      locked: input.userLockedItemIds?.has(itemId) ?? metadata.locked,
    });
  });

  days.forEach((day) => {
    const ordered = [...day.items].sort((left, right) => (
      timeToMinutes(left.startTime, `schedule.days[${day.day}].startTime`)
      - timeToMinutes(right.startTime, `schedule.days[${day.day}].startTime`)
      || left.id.localeCompare(right.id)
    ));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (timeToMinutes(current.startTime, `schedule.days[${day.day}].startTime`)
        < timeToMinutes(previous.endTime, `schedule.days[${day.day}].endTime`)) {
        return contractError(`schedule.days[${day.day}]`, `${previous.id}와 ${current.id} 일정이 겹칩니다.`);
      }
    }
  });

  return {
    days,
    expectedVersion,
    ...(input.clientMutationId ? { clientMutationId: input.clientMutationId } : {}),
  };
}

export function findTicketRemovalImpacts(
  snapshot: Pick<WorkspaceScheduleSnapshot, "itinerary" | "metadataByItemId">,
  nextItinerary: readonly Pick<ItineraryItem, "id" | "placeId">[],
  nextMetadataByItemId: Readonly<Record<string, Pick<WorkspaceScheduleItemMetadata, "placeName"> | undefined>> = {},
): TicketRemovalImpact[] {
  const nextById = new Map(nextItinerary.map((item) => [item.id, item]));
  return snapshot.itinerary.flatMap<TicketRemovalImpact>((item) => {
    const metadata = snapshot.metadataByItemId[item.id];
    if (!metadata?.tickets.length) return [];
    const nextItem = nextById.get(item.id);
    if (!nextItem) {
      return [{ itemId: item.id, placeName: metadata.placeName, tickets: [...metadata.tickets], action: "delete" as const }];
    }
    const nextMetadata = nextMetadataByItemId[item.id];
    const placeChanged = item.placeId !== nextItem.placeId
      || (!item.placeId && !nextItem.placeId && nextMetadata !== undefined && nextMetadata.placeName !== metadata.placeName);
    return placeChanged
      ? [{ itemId: item.id, placeName: metadata.placeName, tickets: [...metadata.tickets], action: "replace" as const }]
      : [];
  });
}
