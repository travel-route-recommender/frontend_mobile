import { ApiError, apiClient, type ApiClient } from "../../../services/apiClient";
import type { BackendScheduleReservation } from "./workspaceScheduleContract";

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const RESERVATION_STATUSES = ["confirmed", "unconfirmed", "cancelled"] as const;
const MAX_ITEM_ID_LENGTH = 200;
const MAX_LINK_ID_LENGTH = 200;
const MAX_LINK_COUNT = 100;
const MAX_NOTE_LENGTH = 500;

type ReservationStatus = typeof RESERVATION_STATUSES[number];
type UnknownRecord = Record<string, unknown>;

export type WorkspaceScheduleReservationTiming =
  | { kind: "exact"; startTime?: string; endTime?: string }
  | { kind: "window"; timeWindowStart?: string; timeWindowEnd?: string }
  | { kind: "none" };

/**
 * A user-reviewed reservation draft. Undefined identity values mean "preserve
 * the current server value". Empty note/confirmationCode explicitly clears
 * those string fields because the Backend upsert is a partial update.
 */
export type WorkspaceScheduleReservationDraft = {
  status: ReservationStatus;
  date?: string;
  timing: WorkspaceScheduleReservationTiming;
  timezone?: string;
  placeId?: string;
  externalId?: string;
  confirmationCode?: string;
  note?: string;
  documentTicketIds: readonly string[];
};

export type UpsertWorkspaceScheduleReservationInput = {
  roomId: string;
  itemId: string;
  expectedVersion: number;
  previousReservation: BackendScheduleReservation | undefined;
  draft: WorkspaceScheduleReservationDraft;
  signal?: AbortSignal;
};

export type DeleteWorkspaceScheduleReservationInput = {
  roomId: string;
  itemId: string;
  expectedVersion: number;
  signal?: AbortSignal;
};

export type WorkspaceScheduleReservationMutationResult = {
  reservation: BackendScheduleReservation;
  scheduleVersion: number;
};

export type WorkspaceScheduleReservationDeleteResult = {
  success: true;
  scheduleVersion: number;
};

export class WorkspaceScheduleReservationContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WorkspaceScheduleReservationContractError";
    this.path = path;
  }
}

export class WorkspaceScheduleReservationVersionConflictError extends Error {
  readonly expectedVersion: number;
  readonly currentVersion?: number;

  constructor(expectedVersion: number, currentVersion?: number) {
    super("다른 동행자가 일정을 먼저 수정했어요. 최신 일정을 불러온 뒤 예약 정보를 다시 저장해 주세요.");
    this.name = "WorkspaceScheduleReservationVersionConflictError";
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

export class WorkspaceScheduleReservationReplacementRequiredError extends Error {
  readonly reason: "timing-mode-change" | "timing-clear" | "date-clear";

  constructor(reason: WorkspaceScheduleReservationReplacementRequiredError["reason"]) {
    const message = reason === "timing-mode-change"
      ? "서버가 기존 시간 필드를 원자적으로 지우는 계약을 제공하지 않아 정확한 시각과 허용 시간창을 바로 전환할 수 없어요. 예약 정보를 삭제한 뒤 다시 등록해 주세요."
      : reason === "timing-clear"
        ? "서버가 기존 예약 시간을 지우는 계약을 제공하지 않아요. 예약 정보를 삭제한 뒤 필요한 정보만 다시 등록해 주세요."
        : "서버가 기존 예약 날짜를 지우는 계약을 제공하지 않아요. 예약 정보를 삭제한 뒤 필요한 정보만 다시 등록해 주세요.";
    super(message);
    this.name = "WorkspaceScheduleReservationReplacementRequiredError";
    this.reason = reason;
  }
}

function fail(path: string, message: string): never {
  throw new WorkspaceScheduleReservationContractError(path, message);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "객체여야 합니다.");
  }
  return value as UnknownRecord;
}

function requiredText(value: unknown, path: string, maxLength = MAX_ITEM_ID_LENGTH) {
  if (typeof value !== "string") return fail(path, "문자열이어야 합니다.");
  const normalized = value.trim();
  if (!normalized) return fail(path, "비어 있을 수 없습니다.");
  if (normalized.length > maxLength) return fail(path, `${maxLength}자 이하여야 합니다.`);
  return normalized;
}

function optionalResponseText(value: unknown, path: string, maxLength = MAX_ITEM_ID_LENGTH) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, path, maxLength);
}

function normalizeClearableText(value: string | undefined, path: string, maxLength: number) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return fail(path, "문자열이어야 합니다.");
  const normalized = value.trim();
  if (normalized.length > maxLength) return fail(path, `${maxLength}자 이하여야 합니다.`);
  return normalized;
}

function normalizeRoomId(value: string) {
  const normalized = requiredText(value, "roomId", 24);
  if (!MONGO_OBJECT_ID_PATTERN.test(normalized)) return fail("roomId", "24자리 Mongo ObjectId여야 합니다.");
  return normalized;
}

function normalizeItemId(value: string) {
  return requiredText(value, "itemId", MAX_ITEM_ID_LENGTH);
}

function normalizeExpectedVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) return fail("expectedVersion", "0 이상의 안전한 정수여야 합니다.");
  return value;
}

function normalizeDate(value: string | undefined, path: string) {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim();
  if (!DATE_PATTERN.test(normalized)) return fail(path, "YYYY-MM-DD 형식이어야 합니다.");
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return fail(path, "달력에 존재하는 날짜여야 합니다.");
  }
  return normalized;
}

function normalizeTime(value: string | undefined, path: string) {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim();
  if (!TIME_PATTERN.test(normalized)) return fail(path, "HH:mm(00:00~23:59) 형식이어야 합니다.");
  return normalized;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function assertOrderedTimePair(start: string | undefined, end: string | undefined, path: string) {
  if (start && end && minutes(end) <= minutes(start)) {
    return fail(path, "종료 시각은 시작 시각보다 뒤여야 합니다.");
  }
}

function normalizeTimezone(value: string | undefined, path: string) {
  if (value === undefined || value === "") return undefined;
  const normalized = requiredText(value, path, 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    return fail(path, "지원되는 IANA timezone이어야 합니다.");
  }
  return normalized;
}

function normalizeMongoObjectId(value: string | undefined, path: string) {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalized)) return fail(path, "24자리 Mongo ObjectId여야 합니다.");
  return normalized;
}

function normalizeStatus(value: unknown, path: string): ReservationStatus {
  if (typeof value !== "string" || !RESERVATION_STATUSES.includes(value as ReservationStatus)) {
    return fail(path, `${RESERVATION_STATUSES.join(", ")} 중 하나여야 합니다.`);
  }
  return value as ReservationStatus;
}

function normalizeDocumentTicketIds(value: readonly string[] | unknown, path: string) {
  if (!Array.isArray(value)) return fail(path, "배열이어야 합니다.");
  if (value.length > MAX_LINK_COUNT) return fail(path, `최대 ${MAX_LINK_COUNT}개까지 연결할 수 있습니다.`);
  const ids = value.map((entry, index) => requiredText(entry, `${path}[${index}]`, MAX_LINK_ID_LENGTH));
  if (new Set(ids).size !== ids.length) return fail(path, "중복된 문서·티켓 ID가 있습니다.");
  return ids;
}

function optionalIsoDateTime(value: unknown, path: string) {
  const normalized = optionalResponseText(value, path, 100);
  if (normalized === undefined) return undefined;
  if (!Number.isFinite(Date.parse(normalized))) return fail(path, "유효한 날짜·시각이어야 합니다.");
  return normalized;
}

function positiveInteger(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail(path, "1 이상의 안전한 정수여야 합니다.");
  return value as number;
}

function nonNegativeInteger(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail(path, "0 이상의 안전한 정수여야 합니다.");
  return value as number;
}

function representationOf(reservation: Pick<BackendScheduleReservation, "startTime" | "endTime" | "timeWindowStart" | "timeWindowEnd">) {
  const hasExact = Boolean(reservation.startTime || reservation.endTime);
  const hasWindow = Boolean(reservation.timeWindowStart || reservation.timeWindowEnd);
  if (hasExact && hasWindow) return "mixed" as const;
  if (hasExact) return "exact" as const;
  if (hasWindow) return "window" as const;
  return "none" as const;
}

export function parseWorkspaceScheduleReservation(
  value: unknown,
  path = "reservation",
): BackendScheduleReservation {
  const record = asRecord(value, path);
  const startTime = normalizeTime(optionalResponseText(record.startTime, `${path}.startTime`, 5), `${path}.startTime`);
  const endTime = normalizeTime(optionalResponseText(record.endTime, `${path}.endTime`, 5), `${path}.endTime`);
  const timeWindowStart = normalizeTime(optionalResponseText(record.timeWindowStart, `${path}.timeWindowStart`, 5), `${path}.timeWindowStart`);
  const timeWindowEnd = normalizeTime(optionalResponseText(record.timeWindowEnd, `${path}.timeWindowEnd`, 5), `${path}.timeWindowEnd`);
  assertOrderedTimePair(startTime, endTime, `${path}.endTime`);
  assertOrderedTimePair(timeWindowStart, timeWindowEnd, `${path}.timeWindowEnd`);
  if ((startTime || endTime) && (timeWindowStart || timeWindowEnd)) {
    return fail(path, "정확한 시각과 허용 시간창을 동시에 포함할 수 없습니다.");
  }
  const date = normalizeDate(optionalResponseText(record.date, `${path}.date`, 10), `${path}.date`);
  const timezone = normalizeTimezone(optionalResponseText(record.timezone, `${path}.timezone`, 100), `${path}.timezone`);
  const placeId = normalizeMongoObjectId(optionalResponseText(record.placeId, `${path}.placeId`, 24), `${path}.placeId`);
  const externalId = optionalResponseText(record.externalId, `${path}.externalId`, MAX_ITEM_ID_LENGTH);
  const confirmationCode = optionalResponseText(record.confirmationCode, `${path}.confirmationCode`, MAX_ITEM_ID_LENGTH);
  const note = optionalResponseText(record.note, `${path}.note`, MAX_NOTE_LENGTH);
  const confirmedBy = normalizeMongoObjectId(optionalResponseText(record.confirmedBy, `${path}.confirmedBy`, 24), `${path}.confirmedBy`);
  const confirmedAt = optionalIsoDateTime(record.confirmedAt, `${path}.confirmedAt`);
  return {
    id: requiredText(record.id, `${path}.id`, MAX_ITEM_ID_LENGTH),
    status: normalizeStatus(record.status, `${path}.status`),
    ...(date ? { date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(timeWindowStart ? { timeWindowStart } : {}),
    ...(timeWindowEnd ? { timeWindowEnd } : {}),
    ...(timezone ? { timezone } : {}),
    ...(placeId ? { placeId } : {}),
    ...(externalId ? { externalId } : {}),
    ...(confirmationCode ? { confirmationCode } : {}),
    ...(note ? { note } : {}),
    documentTicketIds: normalizeDocumentTicketIds(record.documentTicketIds, `${path}.documentTicketIds`),
    ...(confirmedBy ? { confirmedBy } : {}),
    ...(confirmedAt ? { confirmedAt } : {}),
    revision: positiveInteger(record.revision, `${path}.revision`),
  };
}

function normalizeDraft(
  draft: WorkspaceScheduleReservationDraft,
  previousReservation: BackendScheduleReservation | undefined,
) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return fail("reservation", "객체여야 합니다.");
  const status = normalizeStatus(draft.status, "reservation.status");
  const date = normalizeDate(draft.date, "reservation.date");
  const timezone = normalizeTimezone(draft.timezone, "reservation.timezone");
  const placeId = normalizeMongoObjectId(draft.placeId, "reservation.placeId");
  const externalId = normalizeClearableText(draft.externalId, "reservation.externalId", MAX_ITEM_ID_LENGTH);
  const confirmationCode = normalizeClearableText(draft.confirmationCode, "reservation.confirmationCode", MAX_ITEM_ID_LENGTH);
  const note = normalizeClearableText(draft.note, "reservation.note", MAX_NOTE_LENGTH);
  const documentTicketIds = normalizeDocumentTicketIds(draft.documentTicketIds, "reservation.documentTicketIds");

  if (!draft.timing || typeof draft.timing !== "object" || Array.isArray(draft.timing)) {
    return fail("reservation.timing", "시간 표현 객체여야 합니다.");
  }
  let timing: WorkspaceScheduleReservationTiming;
  if (draft.timing.kind === "exact") {
    const startTime = normalizeTime(draft.timing.startTime, "reservation.startTime");
    const endTime = normalizeTime(draft.timing.endTime, "reservation.endTime");
    assertOrderedTimePair(startTime, endTime, "reservation.endTime");
    timing = { kind: "exact", ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}) };
  } else if (draft.timing.kind === "window") {
    const timeWindowStart = normalizeTime(draft.timing.timeWindowStart, "reservation.timeWindowStart");
    const timeWindowEnd = normalizeTime(draft.timing.timeWindowEnd, "reservation.timeWindowEnd");
    assertOrderedTimePair(timeWindowStart, timeWindowEnd, "reservation.timeWindowEnd");
    timing = { kind: "window", ...(timeWindowStart ? { timeWindowStart } : {}), ...(timeWindowEnd ? { timeWindowEnd } : {}) };
  } else if (draft.timing.kind === "none") {
    timing = { kind: "none" };
  } else {
    return fail("reservation.timing.kind", "exact, window, none 중 하나여야 합니다.");
  }

  if (status === "confirmed") {
    if (!date) return fail("reservation.date", "확정 예약에는 날짜가 필요합니다.");
    const timingComplete = timing.kind === "exact"
      ? Boolean(timing.startTime && timing.endTime)
      : timing.kind === "window"
        ? Boolean(timing.timeWindowStart && timing.timeWindowEnd)
        : false;
    if (!timingComplete) return fail("reservation.timing", "확정 예약에는 시작·종료 시각 또는 완전한 허용 시간창이 필요합니다.");
  }

  if (previousReservation) {
    const previousRepresentation = representationOf(previousReservation);
    if (previousRepresentation === "mixed") {
      throw new WorkspaceScheduleReservationReplacementRequiredError("timing-mode-change");
    }
    if (previousRepresentation !== "none" && timing.kind === "none") {
      throw new WorkspaceScheduleReservationReplacementRequiredError("timing-clear");
    }
    if (previousRepresentation !== "none" && timing.kind !== previousRepresentation) {
      throw new WorkspaceScheduleReservationReplacementRequiredError("timing-mode-change");
    }
    if (previousReservation.date && !date) {
      throw new WorkspaceScheduleReservationReplacementRequiredError("date-clear");
    }
  }

  return {
    status,
    ...(date ? { date } : {}),
    timing,
    ...(timezone ? { timezone } : {}),
    ...(placeId ? { placeId } : {}),
    ...(externalId !== undefined ? { externalId } : {}),
    ...(confirmationCode !== undefined ? { confirmationCode } : {}),
    ...(note !== undefined ? { note } : {}),
    documentTicketIds,
  };
}

export function buildWorkspaceScheduleReservationBody(
  draft: WorkspaceScheduleReservationDraft,
  previousReservation: BackendScheduleReservation | undefined,
  expectedVersion: number,
  clientMutationId: string,
) {
  const normalized = normalizeDraft(draft, previousReservation);
  const mutationId = requiredText(clientMutationId, "clientMutationId", 100);
  return {
    status: normalized.status,
    ...(normalized.date ? { date: normalized.date } : {}),
    ...(normalized.timing.kind === "exact" ? {
      ...(normalized.timing.startTime ? { startTime: normalized.timing.startTime } : {}),
      ...(normalized.timing.endTime ? { endTime: normalized.timing.endTime } : {}),
    } : {}),
    ...(normalized.timing.kind === "window" ? {
      ...(normalized.timing.timeWindowStart ? { timeWindowStart: normalized.timing.timeWindowStart } : {}),
      ...(normalized.timing.timeWindowEnd ? { timeWindowEnd: normalized.timing.timeWindowEnd } : {}),
    } : {}),
    ...(normalized.timezone ? { timezone: normalized.timezone } : {}),
    ...(normalized.placeId ? { placeId: normalized.placeId } : {}),
    ...(normalized.externalId !== undefined ? { externalId: normalized.externalId } : {}),
    ...(normalized.confirmationCode !== undefined ? { confirmationCode: normalized.confirmationCode } : {}),
    ...(normalized.note !== undefined ? { note: normalized.note } : {}),
    documentTicketIds: normalized.documentTicketIds,
    expectedVersion: normalizeExpectedVersion(expectedVersion),
    clientMutationId: mutationId,
  };
}

type WorkspaceScheduleReservationBody = ReturnType<typeof buildWorkspaceScheduleReservationBody>;

function assertMutationEcho(
  reservation: BackendScheduleReservation,
  body: WorkspaceScheduleReservationBody,
  previousReservation: BackendScheduleReservation | undefined,
) {
  const mismatch = (path: string): never => fail(`reservationMutation.reservation.${path}`, "요청한 값과 서버 저장 결과가 일치하지 않습니다.");
  if (reservation.status !== body.status) mismatch("status");
  if ("date" in body && reservation.date !== body.date) mismatch("date");
  if ("startTime" in body && reservation.startTime !== body.startTime) mismatch("startTime");
  if ("endTime" in body && reservation.endTime !== body.endTime) mismatch("endTime");
  if ("timeWindowStart" in body && reservation.timeWindowStart !== body.timeWindowStart) mismatch("timeWindowStart");
  if ("timeWindowEnd" in body && reservation.timeWindowEnd !== body.timeWindowEnd) mismatch("timeWindowEnd");
  if ("timezone" in body && reservation.timezone !== body.timezone) mismatch("timezone");
  if ("placeId" in body && reservation.placeId !== body.placeId) mismatch("placeId");
  if ("externalId" in body && (reservation.externalId ?? "") !== body.externalId) mismatch("externalId");
  if ("confirmationCode" in body && (reservation.confirmationCode ?? "") !== body.confirmationCode) mismatch("confirmationCode");
  if ("note" in body && (reservation.note ?? "") !== body.note) mismatch("note");
  if (reservation.documentTicketIds.length !== body.documentTicketIds.length
    || reservation.documentTicketIds.some((id, index) => id !== body.documentTicketIds[index])) {
    mismatch("documentTicketIds");
  }
  if (previousReservation) {
    if (reservation.id !== previousReservation.id) mismatch("id");
    if (reservation.revision !== previousReservation.revision + 1) mismatch("revision");
  } else if (reservation.revision !== 1) {
    mismatch("revision");
  }
}

function parseMutationResponse(
  value: unknown,
  expectedVersion: number,
  body: WorkspaceScheduleReservationBody,
  previousReservation: BackendScheduleReservation | undefined,
): WorkspaceScheduleReservationMutationResult {
  const record = asRecord(value, "reservationMutation");
  const scheduleVersion = nonNegativeInteger(record.scheduleVersion, "reservationMutation.scheduleVersion");
  if (scheduleVersion !== expectedVersion + 1) {
    return fail("reservationMutation.scheduleVersion", `expectedVersion(${expectedVersion}) 다음 버전이어야 합니다.`);
  }
  const reservation = parseWorkspaceScheduleReservation(record.reservation, "reservationMutation.reservation");
  assertMutationEcho(reservation, body, previousReservation);
  return {
    reservation,
    scheduleVersion,
  };
}

function parseDeleteResponse(value: unknown, expectedVersion: number): WorkspaceScheduleReservationDeleteResult {
  const record = asRecord(value, "reservationDelete");
  if (record.success !== true) return fail("reservationDelete.success", "true여야 합니다.");
  const scheduleVersion = nonNegativeInteger(record.scheduleVersion, "reservationDelete.scheduleVersion");
  if (scheduleVersion !== expectedVersion + 1) {
    return fail("reservationDelete.scheduleVersion", `expectedVersion(${expectedVersion}) 다음 버전이어야 합니다.`);
  }
  return { success: true, scheduleVersion };
}

function currentVersionFrom(error: ApiError) {
  if (!error.payload || typeof error.payload !== "object" || Array.isArray(error.payload)) return undefined;
  const currentVersion = (error.payload as { currentVersion?: unknown }).currentVersion;
  return Number.isSafeInteger(currentVersion) && (currentVersion as number) >= 0
    ? currentVersion as number
    : undefined;
}

function mutationId(prefix: "reservation-save" | "reservation-delete") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function endpoint(roomId: string, itemId: string) {
  return `/rooms/${encodeURIComponent(normalizeRoomId(roomId))}/schedule/items/${encodeURIComponent(normalizeItemId(itemId))}/reservation`;
}

export interface WorkspaceScheduleReservationApiGateway {
  upsert(input: UpsertWorkspaceScheduleReservationInput): Promise<WorkspaceScheduleReservationMutationResult>;
  delete(input: DeleteWorkspaceScheduleReservationInput): Promise<WorkspaceScheduleReservationDeleteResult>;
}

export class HttpWorkspaceScheduleReservationApiGateway implements WorkspaceScheduleReservationApiGateway {
  constructor(
    private readonly client: ApiClient = apiClient,
    private readonly createMutationId: (prefix: "reservation-save" | "reservation-delete") => string = mutationId,
  ) {}

  async upsert(input: UpsertWorkspaceScheduleReservationInput) {
    const expectedVersion = normalizeExpectedVersion(input.expectedVersion);
    const body = buildWorkspaceScheduleReservationBody(
      input.draft,
      input.previousReservation,
      expectedVersion,
      this.createMutationId("reservation-save"),
    );
    try {
      const payload = await this.client.request<unknown>({
        path: endpoint(input.roomId, input.itemId),
        method: "PUT",
        body,
        signal: input.signal,
        auth: true,
      });
      return parseMutationResponse(payload, expectedVersion, body, input.previousReservation);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new WorkspaceScheduleReservationVersionConflictError(expectedVersion, currentVersionFrom(error));
      }
      throw error;
    }
  }

  async delete(input: DeleteWorkspaceScheduleReservationInput) {
    const expectedVersion = normalizeExpectedVersion(input.expectedVersion);
    try {
      const payload = await this.client.request<unknown>({
        path: endpoint(input.roomId, input.itemId),
        method: "DELETE",
        query: {
          expectedVersion,
          clientMutationId: requiredText(this.createMutationId("reservation-delete"), "clientMutationId", 100),
        },
        signal: input.signal,
        auth: true,
      });
      return parseDeleteResponse(payload, expectedVersion);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new WorkspaceScheduleReservationVersionConflictError(expectedVersion, currentVersionFrom(error));
      }
      throw error;
    }
  }
}

export const workspaceScheduleReservationApiGateway = new HttpWorkspaceScheduleReservationApiGateway();
