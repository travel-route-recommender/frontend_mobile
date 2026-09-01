import { environment } from "../../../config/environment";
import type { ItineraryItem } from "../../../domain";
import { ApiError, apiClient, type ApiClient } from "../../../services/apiClient";
import {
  findTicketRemovalImpacts,
  mapBackendScheduleToWorkspace,
  mapWorkspaceScheduleToBatch,
  type TicketRemovalImpact,
  type WorkspaceScheduleItemMetadata,
  type WorkspaceScheduleLocalOverlay,
  type WorkspaceScheduleScope,
  type WorkspaceScheduleSnapshot,
} from "./workspaceScheduleContract";

export class WorkspaceScheduleVersionConflictError extends Error {
  readonly currentVersion?: number;
  readonly expectedVersion: number;

  constructor(expectedVersion: number, currentVersion?: number) {
    super("다른 동행자가 일정을 먼저 수정했어요. 최신 일정을 불러온 뒤 다시 시도해 주세요.");
    this.name = "WorkspaceScheduleVersionConflictError";
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

export class WorkspaceFactsVersionConflictError extends Error {
  readonly currentFactsVersion?: number;
  readonly expectedFactsVersion: number;

  constructor(expectedFactsVersion: number, currentFactsVersion?: number) {
    super("분석 이후 예약·성향·후보 사실이 변경됐어요. 최신 정보로 다시 분석해 주세요.");
    this.name = "WorkspaceFactsVersionConflictError";
    this.expectedFactsVersion = expectedFactsVersion;
    this.currentFactsVersion = currentFactsVersion;
  }
}

export class ScheduleTicketRemovalConfirmationRequiredError extends Error {
  readonly impacts: TicketRemovalImpact[];

  constructor(impacts: TicketRemovalImpact[]) {
    super("첨부된 입장권이나 예약 문서가 있는 일정은 확인 없이 삭제하거나 다른 장소로 바꿀 수 없어요.");
    this.name = "ScheduleTicketRemovalConfirmationRequiredError";
    this.impacts = impacts;
  }
}

/**
 * The current batch DTO preserves tickets by item ID and has no way to detach
 * them while replacing that item's place. Allowing the save would therefore
 * attach the old place's ticket to the new place. The safe frontend operation
 * is to delete the old item and create a new item with a different ID.
 */
export class ScheduleTicketPlaceReplacementUnsupportedError extends Error {
  readonly impacts: TicketRemovalImpact[];

  constructor(impacts: TicketRemovalImpact[]) {
    super("입장권이나 예약 문서가 있는 일정은 같은 항목 ID로 장소만 바꿀 수 없어요. 기존 일정을 삭제한 뒤 새 일정으로 추가해 주세요.");
    this.name = "ScheduleTicketPlaceReplacementUnsupportedError";
    this.impacts = impacts;
  }
}

/**
 * Backend batch save currently carries a reservation by item ID when the item
 * has no ticket, even if its place changes. Until the server clears both
 * atomically, require the user to remove the reservation before replacement.
 */
export class ScheduleReservationPlaceReplacementUnsupportedError extends Error {
  readonly itemIds: string[];

  constructor(itemIds: readonly string[]) {
    super("예약 정보가 있는 일정은 같은 항목 ID로 장소만 바꿀 수 없어요. 예약 정보를 먼저 삭제한 뒤 장소를 바꿔 주세요.");
    this.name = "ScheduleReservationPlaceReplacementUnsupportedError";
    this.itemIds = [...new Set(itemIds)].sort();
  }
}

export class WorkspaceScheduleScopeMismatchError extends Error {
  readonly snapshotScope: WorkspaceScheduleScope;
  readonly requestedScope: WorkspaceScheduleScope;

  constructor(snapshotScope: WorkspaceScheduleScope, requestedScope: WorkspaceScheduleScope) {
    super("불러온 일정과 저장 대상 여행방·여행·날짜 범위가 달라 저장을 중단했어요. 최신 일정을 다시 불러와 주세요.");
    this.name = "WorkspaceScheduleScopeMismatchError";
    this.snapshotScope = snapshotScope;
    this.requestedScope = requestedScope;
  }
}

export class WorkspaceScheduleProtectedItemError extends Error {
  readonly itemIds: string[];

  constructor(itemIds: readonly string[]) {
    super("서버에서 필수로 지정한 일정은 삭제하거나 장소·날짜를 바꿀 수 없어요. 최신 일정을 다시 확인해 주세요.");
    this.name = "WorkspaceScheduleProtectedItemError";
    this.itemIds = [...new Set(itemIds)].sort();
  }
}

export class WorkspaceScheduleIdentityError extends Error {
  readonly reason: "invalid-room-id" | "room-trip-id-mismatch";

  constructor(reason: WorkspaceScheduleIdentityError["reason"]) {
    super(reason === "invalid-room-id"
      ? "서버 여행방 ID 형식이 올바르지 않아 일정을 요청하지 않았어요."
      : "서버 여행방 ID와 프론트 여행 ID가 일치하지 않아 일정 혼합을 막았어요.");
    this.name = "WorkspaceScheduleIdentityError";
    this.reason = reason;
  }
}

export type LoadWorkspaceScheduleInput = {
  roomId: string;
  tripId: string;
  startDate: string;
  endDate: string;
  overlaysByItemId?: Readonly<Record<string, WorkspaceScheduleLocalOverlay | undefined>>;
  signal?: AbortSignal;
};

export type SaveWorkspaceScheduleInput = {
  roomId: string;
  tripId: string;
  startDate: string;
  endDate: string;
  snapshot: WorkspaceScheduleSnapshot;
  itinerary: readonly ItineraryItem[];
  metadataByItemId: Readonly<Record<string, WorkspaceScheduleItemMetadata | undefined>>;
  /** Explicit user lock intent, separate from effective Backend must protection. */
  userLockedItemIds?: readonly string[];
  /** Ticket-bearing item deletion or place replacement requires explicit confirmation. */
  confirmedTicketRemovalItemIds?: readonly string[];
  signal?: AbortSignal;
};

export type ApplyWorkspaceScheduleProposalInput = SaveWorkspaceScheduleInput & {
  expectedFactsVersion: number;
};

function encodePathSegment(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}가 비어 있습니다.`);
  return encodeURIComponent(normalized);
}

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function assertGatewayIdentity(input: Pick<LoadWorkspaceScheduleInput, "roomId" | "tripId">) {
  const roomId = input.roomId.trim();
  const tripId = input.tripId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(roomId)) {
    throw new WorkspaceScheduleIdentityError("invalid-room-id");
  }
  // The current frontend has no persisted, authoritative room-to-trip mapping.
  // Until one exists, only the server room ID itself may key the local trip.
  if (roomId !== tripId) {
    throw new WorkspaceScheduleIdentityError("room-trip-id-mismatch");
  }
  return { roomId, tripId };
}

function normalizedScope(input: Pick<SaveWorkspaceScheduleInput, "roomId" | "tripId" | "startDate" | "endDate">): WorkspaceScheduleScope {
  return {
    roomId: input.roomId.trim(),
    tripId: input.tripId.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

function assertSnapshotScope(
  snapshot: WorkspaceScheduleSnapshot,
  input: Pick<SaveWorkspaceScheduleInput, "roomId" | "tripId" | "startDate" | "endDate">,
) {
  const requestedScope = normalizedScope(input);
  const scopeMatches = snapshot.scope.roomId === requestedScope.roomId
    && snapshot.scope.tripId === requestedScope.tripId
    && snapshot.scope.startDate === requestedScope.startDate
    && snapshot.scope.endDate === requestedScope.endDate;
  if (!scopeMatches) {
    throw new WorkspaceScheduleScopeMismatchError(snapshot.scope, requestedScope);
  }
}

function currentVersionFromApiError(error: ApiError): number | undefined {
  if (!error.payload || typeof error.payload !== "object") return undefined;
  const value = (error.payload as { currentVersion?: unknown }).currentVersion;
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function factsConflictFromApiError(error: ApiError) {
  if (!error.payload || typeof error.payload !== "object") return undefined;
  const payload = error.payload as { code?: unknown; currentFactsVersion?: unknown };
  if (payload.code !== "FACTS_VERSION_CONFLICT") return undefined;
  return Number.isInteger(payload.currentFactsVersion) && (payload.currentFactsVersion as number) >= 0
    ? payload.currentFactsVersion as number
    : undefined;
}

function localOverlays(
  items: readonly ItineraryItem[],
  userLockedItemIds: ReadonlySet<string>,
): Record<string, WorkspaceScheduleLocalOverlay> {
  return Object.fromEntries(items.map((item) => [item.id, {
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    ...(item.note ? { note: item.note } : {}),
    ...(userLockedItemIds.has(item.id) ? { lockedForDuri: true } : {}),
  }]));
}

function resolveUserLockedItemIds(input: SaveWorkspaceScheduleInput) {
  if (input.userLockedItemIds === undefined) {
    return new Set(input.snapshot.itinerary.flatMap((item) => {
      const protection = input.snapshot.priorityProtectionsByItemId[item.id];
      const userLocked = protection ? protection.userLockAlsoPresent : item.lockedForDuri === true;
      return userLocked ? [item.id] : [];
    }));
  }
  const itineraryIds = new Set(input.itinerary.map((item) => item.id));
  const result = new Set<string>();
  input.userLockedItemIds.forEach((itemId) => {
    if (!itineraryIds.has(itemId)) throw new Error(`사용자 잠금 대상 일정 ${itemId}을 찾을 수 없어요.`);
    result.add(itemId);
  });
  return result;
}

function assertPriorityProtectionsPreserved(input: SaveWorkspaceScheduleInput) {
  const nextById = new Map(input.itinerary.map((item) => [item.id, item]));
  const protectedItemIds = Object.keys(input.snapshot.priorityProtectionsByItemId).filter((itemId) => {
    const protection = input.snapshot.priorityProtectionsByItemId[itemId];
    const before = input.snapshot.itinerary.find((item) => item.id === itemId);
    const after = nextById.get(itemId);
    const nextMetadata = input.metadataByItemId[itemId];
    if (!before || !after || !nextMetadata) return true;
    if (before.placeId !== after.placeId || before.date !== after.date) return true;
    if (protection?.source === "backend-priority-must") return nextMetadata.priority !== "must";
    const previousReservation = input.snapshot.metadataByItemId[itemId]?.reservation;
    return before.startTime !== after.startTime
      || before.durationMinutes !== after.durationMinutes
      || previousReservation?.status !== "confirmed"
      || nextMetadata.reservation?.id !== previousReservation.id
      || nextMetadata.reservation.status !== "confirmed";
  });
  if (protectedItemIds.length) throw new WorkspaceScheduleProtectedItemError(protectedItemIds);
}

function assertReservationPlaceReplacementSafe(input: SaveWorkspaceScheduleInput) {
  const nextById = new Map(input.itinerary.map((item) => [item.id, item]));
  const changedItemIds = input.snapshot.itinerary.flatMap((before) => {
    const reservation = input.snapshot.metadataByItemId[before.id]?.reservation;
    const after = nextById.get(before.id);
    if (!reservation || !after || before.placeId === after.placeId) return [];
    return [before.id];
  });
  if (changedItemIds.length) {
    throw new ScheduleReservationPlaceReplacementUnsupportedError(changedItemIds);
  }
}

export interface WorkspaceScheduleApiGateway {
  load(input: LoadWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot>;
  save(input: SaveWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot>;
  applyProposal(input: ApplyWorkspaceScheduleProposalInput): Promise<WorkspaceScheduleSnapshot>;
}

function mutationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class HttpWorkspaceScheduleApiGateway implements WorkspaceScheduleApiGateway {
  constructor(
    private readonly client: ApiClient = apiClient,
    private readonly apiBaseUrl = environment.apiBaseUrl,
  ) {}

  async load(input: LoadWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot> {
    const identity = assertGatewayIdentity(input);
    const payload = await this.client.request<unknown>({
      path: `/rooms/${encodePathSegment(identity.roomId, "roomId")}/schedule`,
      signal: input.signal,
      auth: true,
    });
    return mapBackendScheduleToWorkspace({
      payload,
      roomId: identity.roomId,
      tripId: identity.tripId,
      startDate: input.startDate,
      endDate: input.endDate,
      apiBaseUrl: this.apiBaseUrl,
      overlaysByItemId: input.overlaysByItemId,
    });
  }

  async save(input: SaveWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot> {
    const identity = assertGatewayIdentity(input);
    assertSnapshotScope(input.snapshot, input);
    assertPriorityProtectionsPreserved(input);
    assertReservationPlaceReplacementSafe(input);
    const impacts = findTicketRemovalImpacts(input.snapshot, input.itinerary, input.metadataByItemId);
    const replacementImpacts = impacts.filter((impact) => impact.action === "replace");
    if (replacementImpacts.length) {
      throw new ScheduleTicketPlaceReplacementUnsupportedError(replacementImpacts);
    }
    const confirmed = new Set(input.confirmedTicketRemovalItemIds ?? []);
    const unconfirmed = impacts.filter((impact) => !confirmed.has(impact.itemId));
    if (unconfirmed.length) throw new ScheduleTicketRemovalConfirmationRequiredError(unconfirmed);

    const userLockedItemIds = resolveUserLockedItemIds(input);
    const body = mapWorkspaceScheduleToBatch({
      itinerary: input.itinerary,
      metadataByItemId: input.metadataByItemId,
      tripId: identity.tripId,
      startDate: input.startDate,
      endDate: input.endDate,
      expectedVersion: input.snapshot.scheduleVersion,
      userLockedItemIds,
      clientMutationId: mutationId("schedule-save"),
    });
    try {
      const payload = await this.client.request<unknown>({
        path: `/rooms/${encodePathSegment(identity.roomId, "roomId")}/schedule`,
        method: "PUT",
        body,
        signal: input.signal,
        auth: true,
      });
      return mapBackendScheduleToWorkspace({
        payload,
        roomId: identity.roomId,
        tripId: identity.tripId,
        startDate: input.startDate,
        endDate: input.endDate,
        apiBaseUrl: this.apiBaseUrl,
        overlaysByItemId: localOverlays(input.itinerary, userLockedItemIds),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new WorkspaceScheduleVersionConflictError(
          input.snapshot.scheduleVersion,
          currentVersionFromApiError(error),
        );
      }
      throw error;
    }
  }

  async applyProposal(input: ApplyWorkspaceScheduleProposalInput): Promise<WorkspaceScheduleSnapshot> {
    const identity = assertGatewayIdentity(input);
    assertSnapshotScope(input.snapshot, input);
    assertPriorityProtectionsPreserved(input);
    assertReservationPlaceReplacementSafe(input);
    const impacts = findTicketRemovalImpacts(input.snapshot, input.itinerary, input.metadataByItemId);
    if (impacts.length) {
      throw new ScheduleTicketRemovalConfirmationRequiredError(impacts);
    }
    const userLockedItemIds = resolveUserLockedItemIds(input);
    const batch = mapWorkspaceScheduleToBatch({
      itinerary: input.itinerary,
      metadataByItemId: input.metadataByItemId,
      tripId: identity.tripId,
      startDate: input.startDate,
      endDate: input.endDate,
      expectedVersion: input.snapshot.scheduleVersion,
      userLockedItemIds,
      clientMutationId: mutationId("schedule-apply"),
    });
    try {
      const payload = await this.client.request<unknown>({
        path: `/rooms/${encodePathSegment(identity.roomId, "roomId")}/schedule/apply`,
        method: "POST",
        body: { ...batch, expectedFactsVersion: input.expectedFactsVersion },
        signal: input.signal,
        auth: true,
      });
      return mapBackendScheduleToWorkspace({
        payload,
        roomId: identity.roomId,
        tripId: identity.tripId,
        startDate: input.startDate,
        endDate: input.endDate,
        apiBaseUrl: this.apiBaseUrl,
        overlaysByItemId: localOverlays(input.itinerary, userLockedItemIds),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if ((error.payload as { code?: unknown } | undefined)?.code === "FACTS_VERSION_CONFLICT") {
          throw new WorkspaceFactsVersionConflictError(
            input.expectedFactsVersion,
            factsConflictFromApiError(error),
          );
        }
        throw new WorkspaceScheduleVersionConflictError(
          input.snapshot.scheduleVersion,
          currentVersionFromApiError(error),
        );
      }
      throw error;
    }
  }
}

export const workspaceScheduleApiGateway = new HttpWorkspaceScheduleApiGateway();
