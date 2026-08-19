import type { ItineraryItem, Place, TripCandidate, TripRoom } from "../../../domain";
import type { ItineraryMutationResult } from "../../../store/useDuriStore";
import { createUniqueEntityId } from "../../../utils/ids";
import {
  findTimeConflictsForDate,
  normalizeItineraryOrder,
  parseTimeToMinutes,
} from "./workspaceDateTime";
import { analyzeTripEndCondition } from "./tripEndCondition";
import {
  createWorkspaceScheduleItemMetadataFromPlace,
  type WorkspaceScheduleItemMetadata,
  type WorkspaceScheduleSnapshot,
} from "../services/workspaceScheduleContract";

export type ApiWorkspaceScheduleDraft = Pick<WorkspaceScheduleSnapshot, "itinerary" | "metadataByItemId">;

export type ApiWorkspaceScheduleMutation =
  | { ok: true; draft: ApiWorkspaceScheduleDraft; itemId?: string }
  | { ok: false; status: Exclude<ItineraryMutationResult, "success" | "success-adjusted" | "invalid-attachment"> };

type ScheduleValue = {
  date: string;
  startTime: string;
  durationMinutes: number;
  note: string;
  lockedForDuri: boolean;
};

function canEdit(trip: TripRoom, currentUserId: string): ApiWorkspaceScheduleMutation | undefined {
  if (trip.status === "completed") return { ok: false, status: "trip-not-editable" };
  if (!trip.members.some((member) => member.userId === currentUserId)) return { ok: false, status: "not-member" };
  return undefined;
}

function isBackendTimeRange(value: Pick<ScheduleValue, "startTime" | "durationMinutes">) {
  const start = parseTimeToMinutes(value.startTime);
  return start !== null
    && start < 24 * 60
    && Number.isInteger(value.durationMinutes)
    && value.durationMinutes >= 1
    && start + value.durationMinutes <= 23 * 60 + 59;
}

function isTripDate(trip: TripRoom, date: string) {
  return Boolean(trip.startDate && trip.endDate && date >= trip.startDate && date <= trip.endDate);
}

function hasConflict(items: readonly ItineraryItem[], item: ItineraryItem) {
  const next = items.filter((entry) => entry.id !== item.id).concat(item);
  return findTimeConflictsForDate(next, item.date).some((conflict) => conflict.itemId === item.id);
}

function violatesEndCondition(trip: TripRoom, itinerary: readonly ItineraryItem[]) {
  const result = analyzeTripEndCondition(trip, itinerary);
  return result.status === "infeasible" || result.status === "invalid";
}

function cloneMetadata(metadata: Readonly<Record<string, WorkspaceScheduleItemMetadata>>) {
  return Object.fromEntries(Object.entries(metadata).map(([id, value]) => [id, {
    ...value,
    tags: [...value.tags],
    tickets: value.tickets.map((ticket) => ({ ...ticket })),
  }]));
}

export function prepareApiWorkspaceScheduleAddition(input: {
  trip: TripRoom;
  currentUserId: string;
  snapshot: WorkspaceScheduleSnapshot;
  candidate: TripCandidate | undefined;
  place: Place | undefined;
  value: ScheduleValue;
}): ApiWorkspaceScheduleMutation {
  const permission = canEdit(input.trip, input.currentUserId);
  if (permission) return permission;
  if (!input.place) return { ok: false, status: "invalid-place" };
  if (!input.candidate || input.candidate.tripId !== input.trip.id || input.candidate.placeId !== input.place.id) {
    return { ok: false, status: "invalid-candidate" };
  }
  if (!isTripDate(input.trip, input.value.date)) return { ok: false, status: "invalid-date" };
  if (!isBackendTimeRange(input.value)) return { ok: false, status: "invalid-time" };
  const itemId = createUniqueEntityId("api-itinerary", input.snapshot.itinerary.map((item) => item.id));
  const note = input.value.note.trim();
  const item: ItineraryItem = {
    id: itemId,
    tripId: input.trip.id,
    placeId: input.place.id,
    date: input.value.date,
    startTime: input.value.startTime,
    durationMinutes: input.value.durationMinutes,
    itemType: "place",
    preferredByUserIds: input.candidate.addedByUserIds.length
      ? [...input.candidate.addedByUserIds]
      : [input.currentUserId],
    ...(note ? { note } : {}),
    ...(input.value.lockedForDuri ? { lockedForDuri: true } : {}),
  };
  if (hasConflict(input.snapshot.itinerary, item)) return { ok: false, status: "overlap" };
  const itinerary = normalizeItineraryOrder([...input.snapshot.itinerary, item]);
  if (violatesEndCondition(input.trip, itinerary)) return { ok: false, status: "end-condition" };
  let metadata: WorkspaceScheduleItemMetadata;
  try {
    metadata = createWorkspaceScheduleItemMetadataFromPlace({
      itemId,
      place: input.place,
      reason: note,
      priority: "optional",
    });
  } catch {
    return { ok: false, status: "invalid-place" };
  }
  return {
    ok: true,
    itemId,
    draft: {
      itinerary,
      metadataByItemId: {
        ...cloneMetadata(input.snapshot.metadataByItemId),
        [itemId]: metadata,
      },
    },
  };
}

export function prepareApiWorkspaceScheduleUpdate(input: {
  trip: TripRoom;
  currentUserId: string;
  snapshot: WorkspaceScheduleSnapshot;
  itemId: string;
  value: ScheduleValue;
}): ApiWorkspaceScheduleMutation {
  const permission = canEdit(input.trip, input.currentUserId);
  if (permission) return permission;
  const current = input.snapshot.itinerary.find((item) => item.id === input.itemId);
  if (!current) return { ok: false, status: "invalid-item" };
  if (!isTripDate(input.trip, input.value.date)) return { ok: false, status: "invalid-date" };
  if (!isBackendTimeRange(input.value)) return { ok: false, status: "invalid-time" };
  const note = input.value.note.trim();
  const next: ItineraryItem = {
    ...current,
    date: input.value.date,
    startTime: input.value.startTime,
    durationMinutes: input.value.durationMinutes,
    ...(note ? { note } : { note: undefined }),
    ...(input.value.lockedForDuri ? { lockedForDuri: true } : { lockedForDuri: undefined }),
  };
  if (hasConflict(input.snapshot.itinerary, next)) return { ok: false, status: "overlap" };
  const itinerary = normalizeItineraryOrder(input.snapshot.itinerary.map((item) => item.id === input.itemId ? next : item));
  if (violatesEndCondition(input.trip, itinerary)) return { ok: false, status: "end-condition" };
  const metadata = input.snapshot.metadataByItemId[input.itemId];
  if (!metadata) return { ok: false, status: "invalid-item" };
  return {
    ok: true,
    draft: {
      itinerary,
      metadataByItemId: {
        ...cloneMetadata(input.snapshot.metadataByItemId),
        [input.itemId]: { ...metadata, reason: note },
      },
    },
  };
}

export function prepareApiWorkspaceScheduleRemoval(input: {
  trip: TripRoom;
  currentUserId: string;
  snapshot: WorkspaceScheduleSnapshot;
  itemId: string;
}): ApiWorkspaceScheduleMutation {
  const permission = canEdit(input.trip, input.currentUserId);
  if (permission) return permission;
  if (!input.snapshot.itinerary.some((item) => item.id === input.itemId)) return { ok: false, status: "invalid-item" };
  const metadataByItemId = cloneMetadata(input.snapshot.metadataByItemId);
  delete metadataByItemId[input.itemId];
  return {
    ok: true,
    draft: {
      itinerary: input.snapshot.itinerary.filter((item) => item.id !== input.itemId),
      metadataByItemId,
    },
  };
}
