import { environment } from "../../../config/environment";
import type { ItineraryItem } from "../../../domain";
import { ApiError, apiClient, type ApiClient } from "../../../services/apiClient";
import {
  buildScheduleTripDates,
  mapBackendScheduleToWorkspace,
  type BackendScheduleReservation,
  type BackendScheduleTicket,
  type BackendWorkspacePlanning,
  type WorkspaceScheduleLocalOverlay,
  type WorkspaceScheduleSnapshot,
} from "./workspaceScheduleContract";
import {
  WorkspaceScheduleScopeMismatchError,
  WorkspaceScheduleVersionConflictError,
} from "./workspaceScheduleApi";

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CLIENT_MUTATION_ID_MAX_LENGTH = 100;

/** Structural output shared by remapScheduleToTripDateRange and moveTripDayScheduleToIndex. */
export type WorkspaceTripDateTransformResult = {
  status: "success";
  startDate: string;
  endDate: string;
  items: ItineraryItem[];
  selectedDate: string;
  removedItineraryCount: number;
} | {
  status: "invalid-date" | "invalid-itinerary" | "boundary";
  items: ItineraryItem[];
};

export type WorkspaceTripDateItemAction = {
  itemId: string;
  action: "keep" | "move" | "delete";
  date?: string;
  day?: number;
};

export type WorkspaceTripDateDeletionImpact = {
  itemId: string;
  placeName: string;
  date: string;
  tickets: BackendScheduleTicket[];
  reservation?: BackendScheduleReservation;
  /** The Backend unlinks matching shared TODOs after the schedule commit. */
  willDetachTodoLinks: true;
};

export type WorkspaceTripDateChangePlan = {
  baseScheduleVersion: number;
  currentStartDate: string;
  currentEndDate: string;
  startDate: string;
  endDate: string;
  nextItinerary: ItineraryItem[];
  itemActions: WorkspaceTripDateItemAction[];
  deletionImpacts: WorkspaceTripDateDeletionImpact[];
  /** trip-dates 응답이 planning을 직렬화하지 않아도 기존 서버 planning을 잃지 않는다. */
  planning?: BackendWorkspacePlanning;
};

export type WorkspaceTripDateTodoLinkImpact = {
  action: "unlinked";
  matched: number;
  modified: number;
  scheduleItemId: string;
};

export type UpdateWorkspaceTripDatesResult = {
  startDate: string;
  endDate: string;
  schedule: WorkspaceScheduleSnapshot;
  deletionImpacts: WorkspaceTripDateDeletionImpact[];
  todoLinkImpacts: WorkspaceTripDateTodoLinkImpact[];
  /** False only when an idempotent retry had to reload schedule after the first response was lost. */
  todoLinkImpactsComplete: boolean;
};

export class WorkspaceTripDatePlanError extends Error {
  readonly reason:
    | "unsuccessful-transform"
    | "scope-mismatch"
    | "identity-changed"
    | "duplicate-item"
    | "new-item"
    | "date-out-of-range"
    | "invalid-client-mutation-id"
    | "stale-confirmation";

  constructor(reason: WorkspaceTripDatePlanError["reason"], message: string) {
    super(message);
    this.name = "WorkspaceTripDatePlanError";
    this.reason = reason;
  }
}

export class WorkspaceTripDateProtectedItemError extends Error {
  readonly itemIds: string[];

  constructor(itemIds: readonly string[]) {
    super("잠금·필수·확정 예약 일정의 날짜를 바꾸거나 삭제할 수 없어요. 먼저 보호 상태를 확인해 주세요.");
    this.name = "WorkspaceTripDateProtectedItemError";
    this.itemIds = [...new Set(itemIds)].sort();
  }
}

export class WorkspaceTripDateDeletionConfirmationRequiredError extends Error {
  readonly impacts: WorkspaceTripDateDeletionImpact[];

  constructor(impacts: readonly WorkspaceTripDateDeletionImpact[]) {
    super("여행 기간을 줄이면 범위 밖 일정과 첨부 티켓이 삭제되고 연결된 TODO 링크가 해제될 수 있어요. 삭제 영향을 확인해 주세요.");
    this.name = "WorkspaceTripDateDeletionConfirmationRequiredError";
    this.impacts = impacts.map((impact) => ({
      ...impact,
      tickets: impact.tickets.map((ticket) => ({ ...ticket })),
      ...(impact.reservation ? { reservation: { ...impact.reservation, documentTicketIds: [...impact.reservation.documentTicketIds] } } : {}),
    }));
  }
}

export class WorkspaceTripDateResponseError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "WorkspaceTripDateResponseError";
    this.path = path;
  }
}

function failPlan(reason: WorkspaceTripDatePlanError["reason"], message: string): never {
  throw new WorkspaceTripDatePlanError(reason, message);
}

function failResponse(path: string, message: string): never {
  throw new WorkspaceTripDateResponseError(path, message);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failResponse(path, "객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function asNonNegativeInteger(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return failResponse(path, "0 이상의 안전한 정수여야 합니다.");
  }
  return value as number;
}

function asRequiredString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) return failResponse(path, "비어 있지 않은 문자열이어야 합니다.");
  return value.trim();
}

function normalizeWireDate(value: unknown, path: string) {
  const raw = asRequiredString(value, path);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw.slice(0, 10) : "";
  if (!dateOnly) return failResponse(path, "YYYY-MM-DD 또는 ISO 날짜/시간이어야 합니다.");
  const parsed = Date.parse(`${dateOnly}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== dateOnly) {
    return failResponse(path, "유효한 날짜여야 합니다.");
  }
  return dateOnly;
}

function normalizeRoomIdentity(roomId: string, tripId: string) {
  const normalizedRoomId = roomId.trim();
  const normalizedTripId = tripId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalizedRoomId)) {
    throw new WorkspaceTripDatePlanError("scope-mismatch", "서버 여행방 ObjectId 형식이어야 합니다.");
  }
  if (normalizedRoomId !== normalizedTripId) {
    throw new WorkspaceTripDatePlanError("scope-mismatch", "서버 여행방과 로컬 여행 ID가 달라 날짜 변경을 중단했어요.");
  }
  return { roomId: normalizedRoomId, tripId: normalizedTripId };
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/** Date helpers must only change `date`; reject accidental edits before they reach trip-dates. */
function assertSameItemIdentity(before: ItineraryItem, after: ItineraryItem) {
  const same = before.id === after.id
    && before.tripId === after.tripId
    && before.placeId === after.placeId
    && before.startTime === after.startTime
    && before.durationMinutes === after.durationMinutes
    && before.itemType === after.itemType
    && before.note === after.note
    && before.lockedForDuri === after.lockedForDuri
    && sameStringArray(before.preferredByUserIds, after.preferredByUserIds);
  if (!same) {
    return failPlan("identity-changed", `날짜 변경 중 일정 ${before.id}의 날짜 이외 필드가 바뀌었습니다.`);
  }
}

function deletionImpact(snapshot: WorkspaceScheduleSnapshot, item: ItineraryItem): WorkspaceTripDateDeletionImpact {
  const metadata = snapshot.metadataByItemId[item.id];
  return {
    itemId: item.id,
    placeName: metadata?.placeName ?? item.note ?? "이름 없는 일정",
    date: item.date,
    tickets: (metadata?.tickets ?? []).map((ticket) => ({ ...ticket })),
    ...(metadata?.reservation
      ? { reservation: { ...metadata.reservation, documentTicketIds: [...metadata.reservation.documentTicketIds] } }
      : {}),
    willDetachTodoLinks: true,
  };
}

function itemIsProtected(snapshot: WorkspaceScheduleSnapshot, item: ItineraryItem) {
  const metadata = snapshot.metadataByItemId[item.id];
  return item.lockedForDuri === true
    || metadata?.locked === true
    || metadata?.priority === "must"
    || metadata?.reservation?.status === "confirmed"
    || snapshot.priorityProtectionsByItemId[item.id] !== undefined;
}

/**
 * Convert the existing remap/move DAY helper result to UpdateTripDatesDto
 * actions. No schedule is silently dropped: every deletion is returned as a
 * concrete impact, while protected entries make the whole plan fail.
 */
export function buildWorkspaceTripDateChangePlan(input: {
  snapshot: WorkspaceScheduleSnapshot;
  result: WorkspaceTripDateTransformResult;
}): WorkspaceTripDateChangePlan {
  if (input.result.status !== "success") {
    return failPlan("unsuccessful-transform", `날짜 변환 결과가 ${input.result.status} 상태입니다.`);
  }
  const { snapshot, result } = input;
  if (snapshot.scope.startDate > snapshot.scope.endDate) {
    return failPlan("scope-mismatch", "기존 일정 스냅샷의 날짜 범위가 올바르지 않습니다.");
  }
  const currentDates = buildScheduleTripDates(snapshot.scope.startDate, snapshot.scope.endDate);
  const nextDates = buildScheduleTripDates(result.startDate, result.endDate);
  const currentDayByDate = new Map(currentDates.map((date, index) => [date, index + 1]));
  const nextDayByDate = new Map(nextDates.map((date, index) => [date, index + 1]));
  const beforeById = new Map<string, ItineraryItem>();
  snapshot.itinerary.forEach((item) => {
    if (beforeById.has(item.id)) return failPlan("duplicate-item", `기존 일정에 ${item.id} ID가 중복되었습니다.`);
    if (!currentDayByDate.has(item.date)) return failPlan("date-out-of-range", `기존 일정 ${item.id}이 여행 기간 밖에 있습니다.`);
    beforeById.set(item.id, item);
  });
  const afterById = new Map<string, ItineraryItem>();
  result.items.forEach((item) => {
    if (afterById.has(item.id)) return failPlan("duplicate-item", `변환 일정에 ${item.id} ID가 중복되었습니다.`);
    if (!beforeById.has(item.id)) return failPlan("new-item", `trip-dates API로 새 일정 ${item.id}을 추가할 수 없습니다.`);
    if (!nextDayByDate.has(item.date)) return failPlan("date-out-of-range", `변환 일정 ${item.id}이 새 여행 기간 밖에 있습니다.`);
    afterById.set(item.id, item);
  });

  const protectedChanges: string[] = [];
  const deletionImpacts: WorkspaceTripDateDeletionImpact[] = [];
  const itemActions = snapshot.itinerary.map<WorkspaceTripDateItemAction>((before) => {
    const after = afterById.get(before.id);
    if (!after) {
      if (itemIsProtected(snapshot, before)) protectedChanges.push(before.id);
      deletionImpacts.push(deletionImpact(snapshot, before));
      return { itemId: before.id, action: "delete" };
    }
    assertSameItemIdentity(before, after);
    const previousDay = currentDayByDate.get(before.date);
    const nextDay = nextDayByDate.get(after.date);
    if (previousDay === undefined || nextDay === undefined) {
      return failPlan("date-out-of-range", `일정 ${before.id}의 DAY를 계산할 수 없습니다.`);
    }
    if ((before.date !== after.date || previousDay !== nextDay) && itemIsProtected(snapshot, before)) {
      protectedChanges.push(before.id);
    }
    return previousDay === nextDay
      ? { itemId: before.id, action: "keep" }
      : { itemId: before.id, action: "move", date: after.date, day: nextDay };
  });
  if (protectedChanges.length) throw new WorkspaceTripDateProtectedItemError(protectedChanges);
  if (result.removedItineraryCount !== deletionImpacts.length) {
    return failPlan("identity-changed", "날짜 변환 결과의 삭제 개수와 실제 삭제 항목이 일치하지 않습니다.");
  }
  if (!nextDayByDate.has(result.selectedDate)) {
    return failPlan("date-out-of-range", "날짜 변환 결과의 선택 DAY가 새 여행 기간 밖에 있습니다.");
  }

  return {
    baseScheduleVersion: snapshot.scheduleVersion,
    currentStartDate: snapshot.scope.startDate,
    currentEndDate: snapshot.scope.endDate,
    startDate: result.startDate,
    endDate: result.endDate,
    nextItinerary: result.items.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] })),
    itemActions,
    deletionImpacts,
    ...(snapshot.planning ? { planning: snapshot.planning } : {}),
  };
}

function parseTodoLinkImpacts(value: unknown): WorkspaceTripDateTodoLinkImpact[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return failResponse("tripDates.todoLinkImpacts", "배열이어야 합니다.");
  return value.map((entry, index) => {
    const path = `tripDates.todoLinkImpacts[${index}]`;
    const record = asRecord(entry, path);
    if (record.action !== "unlinked") return failResponse(`${path}.action`, "unlinked여야 합니다.");
    return {
      action: "unlinked" as const,
      matched: asNonNegativeInteger(record.matched, `${path}.matched`),
      modified: asNonNegativeInteger(record.modified, `${path}.modified`),
      scheduleItemId: asRequiredString(record.scheduleItemId, `${path}.scheduleItemId`),
    };
  });
}

function currentVersionFromApiError(error: ApiError): number | undefined {
  if (!error.payload || typeof error.payload !== "object") return undefined;
  const value = (error.payload as { currentVersion?: unknown }).currentVersion;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function overlaysFromPlan(plan: WorkspaceTripDateChangePlan): Record<string, WorkspaceScheduleLocalOverlay> {
  return Object.fromEntries(plan.nextItinerary.map((item) => [item.id, {
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    ...(item.note ? { note: item.note } : {}),
    ...(item.lockedForDuri ? { lockedForDuri: true } : {}),
  }]));
}

/** Strictly map the atomic trip-date response to the new calendar scope. */
export function mapWorkspaceTripDateUpdateResponse(input: {
  payload: unknown;
  roomId: string;
  tripId: string;
  plan: WorkspaceTripDateChangePlan;
  apiBaseUrl: string;
}): UpdateWorkspaceTripDatesResult {
  const response = asRecord(input.payload, "tripDates");
  const startDate = normalizeWireDate(response.startDate, "tripDates.startDate");
  const endDate = normalizeWireDate(response.endDate, "tripDates.endDate");
  if (startDate !== input.plan.startDate || endDate !== input.plan.endDate) {
    return failResponse("tripDates", "서버가 요청과 다른 여행 날짜를 반환했습니다.");
  }
  const parsedSchedule = mapBackendScheduleToWorkspace({
    payload: response,
    roomId: input.roomId,
    tripId: input.tripId,
    startDate,
    endDate,
    apiBaseUrl: input.apiBaseUrl,
    overlaysByItemId: overlaysFromPlan(input.plan),
  });
  const schedule = parsedSchedule.planning || !input.plan.planning
    ? parsedSchedule
    : { ...parsedSchedule, planning: input.plan.planning };
  if (schedule.scheduleVersion <= input.plan.baseScheduleVersion) {
    return failResponse("tripDates.scheduleVersion", "날짜 변경 후 일정 버전이 증가하지 않았습니다.");
  }
  return {
    startDate,
    endDate,
    schedule,
    deletionImpacts: input.plan.deletionImpacts,
    todoLinkImpacts: parseTodoLinkImpacts(response.todoLinkImpacts),
    todoLinkImpactsComplete: true,
  };
}

function parseIdempotentTripDateAcknowledgement(payload: unknown, baseScheduleVersion: number) {
  const record = asRecord(payload, "tripDates");
  if (record.startDate !== undefined || record.endDate !== undefined || record.days !== undefined) return undefined;
  const scheduleVersion = asNonNegativeInteger(record.scheduleVersion, "tripDates.scheduleVersion");
  if (scheduleVersion <= baseScheduleVersion) {
    return failResponse("tripDates.scheduleVersion", "재전송 확인 버전이 기존 일정 버전보다 커야 합니다.");
  }
  const impacts = parseTodoLinkImpacts(record.todoLinkImpacts);
  if (impacts.length) {
    return failResponse("tripDates.todoLinkImpacts", "불완전 재전송 응답에 TODO 영향이 포함될 수 없습니다.");
  }
  return scheduleVersion;
}

export function createWorkspaceTripDateMutationId() {
  return `trip-dates-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface WorkspaceTripDatesApiGateway {
  update(input: {
    roomId: string;
    tripId: string;
    snapshot: WorkspaceScheduleSnapshot;
    result: WorkspaceTripDateTransformResult;
    clientMutationId: string;
    confirmedDeletionItemIds?: readonly string[];
    signal?: AbortSignal;
  }): Promise<UpdateWorkspaceTripDatesResult>;
}

export class HttpWorkspaceTripDatesApiGateway implements WorkspaceTripDatesApiGateway {
  constructor(
    private readonly client: ApiClient = apiClient,
    private readonly apiBaseUrl = environment.apiBaseUrl,
  ) {}

  async update(input: Parameters<WorkspaceTripDatesApiGateway["update"]>[0]) {
    const identity = normalizeRoomIdentity(input.roomId, input.tripId);
    const requestedScope = {
      roomId: identity.roomId,
      tripId: identity.tripId,
      startDate: input.snapshot.scope.startDate,
      endDate: input.snapshot.scope.endDate,
    };
    if (input.snapshot.scope.roomId !== requestedScope.roomId
      || input.snapshot.scope.tripId !== requestedScope.tripId) {
      throw new WorkspaceScheduleScopeMismatchError(input.snapshot.scope, requestedScope);
    }
    const clientMutationId = input.clientMutationId.trim();
    if (!clientMutationId || clientMutationId.length > CLIENT_MUTATION_ID_MAX_LENGTH) {
      return failPlan("invalid-client-mutation-id", `clientMutationId는 1~${CLIENT_MUTATION_ID_MAX_LENGTH}자여야 합니다.`);
    }
    const plan = buildWorkspaceTripDateChangePlan({ snapshot: input.snapshot, result: input.result });
    const confirmed = new Set(input.confirmedDeletionItemIds ?? []);
    const deletedIds = new Set(plan.deletionImpacts.map((impact) => impact.itemId));
    const staleConfirmations = [...confirmed].filter((itemId) => !deletedIds.has(itemId));
    if (staleConfirmations.length) {
      return failPlan("stale-confirmation", `현재 삭제 대상이 아닌 일정 확인값이 포함되어 있습니다: ${staleConfirmations.join(", ")}`);
    }
    const unconfirmed = plan.deletionImpacts.filter((impact) => !confirmed.has(impact.itemId));
    if (unconfirmed.length) throw new WorkspaceTripDateDeletionConfirmationRequiredError(unconfirmed);

    try {
      const payload = await this.client.request<unknown>({
        path: `/rooms/${encodeURIComponent(identity.roomId)}/trip-dates`,
        method: "PATCH",
        body: {
          startDate: plan.startDate,
          endDate: plan.endDate,
          expectedVersion: plan.baseScheduleVersion,
          itemActions: plan.itemActions,
          clientMutationId,
        },
        signal: input.signal,
        auth: true,
      });
      const idempotentScheduleVersion = parseIdempotentTripDateAcknowledgement(payload, plan.baseScheduleVersion);
      if (idempotentScheduleVersion !== undefined) {
        const schedulePayload = await this.client.request<unknown>({
          path: `/rooms/${encodeURIComponent(identity.roomId)}/schedule`,
          signal: input.signal,
          auth: true,
        });
        const scheduleRecord = asRecord(schedulePayload, "schedule");
        const reloadedVersion = asNonNegativeInteger(scheduleRecord.scheduleVersion, "schedule.scheduleVersion");
        if (reloadedVersion !== idempotentScheduleVersion) {
          throw new WorkspaceScheduleVersionConflictError(idempotentScheduleVersion, reloadedVersion);
        }
        const recovered = mapWorkspaceTripDateUpdateResponse({
          payload: {
            ...scheduleRecord,
            startDate: plan.startDate,
            endDate: plan.endDate,
            todoLinkImpacts: [],
          },
          roomId: identity.roomId,
          tripId: identity.tripId,
          plan,
          apiBaseUrl: this.apiBaseUrl,
        });
        return { ...recovered, todoLinkImpactsComplete: false };
      }
      return mapWorkspaceTripDateUpdateResponse({
        payload,
        roomId: identity.roomId,
        tripId: identity.tripId,
        plan,
        apiBaseUrl: this.apiBaseUrl,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new WorkspaceScheduleVersionConflictError(
          plan.baseScheduleVersion,
          currentVersionFromApiError(error),
        );
      }
      throw error;
    }
  }
}

export const workspaceTripDatesApiGateway = new HttpWorkspaceTripDatesApiGateway();
