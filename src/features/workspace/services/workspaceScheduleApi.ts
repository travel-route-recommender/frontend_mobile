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
  /** Ticket-bearing item deletion or place replacement requires explicit confirmation. */
  confirmedTicketRemovalItemIds?: readonly string[];
  signal?: AbortSignal;
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

function localOverlays(
  items: readonly ItineraryItem[],
  priorityProtectionsByItemId: WorkspaceScheduleSnapshot["priorityProtectionsByItemId"],
): Record<string, WorkspaceScheduleLocalOverlay> {
  return Object.fromEntries(items.map((item) => [item.id, {
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    ...(item.note ? { note: item.note } : {}),
    ...(item.lockedForDuri === true
      && (!priorityProtectionsByItemId[item.id] || priorityProtectionsByItemId[item.id].userLockAlsoPresent)
      ? { lockedForDuri: true }
      : {}),
  }]));
}

export interface WorkspaceScheduleApiGateway {
  load(input: LoadWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot>;
  save(input: SaveWorkspaceScheduleInput): Promise<WorkspaceScheduleSnapshot>;
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
    const impacts = findTicketRemovalImpacts(input.snapshot, input.itinerary, input.metadataByItemId);
    const replacementImpacts = impacts.filter((impact) => impact.action === "replace");
    if (replacementImpacts.length) {
      throw new ScheduleTicketPlaceReplacementUnsupportedError(replacementImpacts);
    }
    const confirmed = new Set(input.confirmedTicketRemovalItemIds ?? []);
    const unconfirmed = impacts.filter((impact) => !confirmed.has(impact.itemId));
    if (unconfirmed.length) throw new ScheduleTicketRemovalConfirmationRequiredError(unconfirmed);

    const body = mapWorkspaceScheduleToBatch({
      itinerary: input.itinerary,
      metadataByItemId: input.metadataByItemId,
      tripId: identity.tripId,
      startDate: input.startDate,
      endDate: input.endDate,
      expectedVersion: input.snapshot.scheduleVersion,
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
        overlaysByItemId: localOverlays(input.itinerary, input.snapshot.priorityProtectionsByItemId),
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
}

export const workspaceScheduleApiGateway = new HttpWorkspaceScheduleApiGateway();
