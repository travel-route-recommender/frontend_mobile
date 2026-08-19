import type { ItineraryItem, Place, TripCandidate, TripRoom } from "../../../domain";
import type { SessionKind } from "../../auth/types";
import { canEditTripWorkspace } from "../logic/workspaceCapabilities";
import { buildTripDateRange, findConflictingItems, validateTimeRange } from "../logic/workspaceDateTime";

export type ItineraryValidationResult = {
  valid: boolean;
  errors: string[];
  conflictItemIds: string[];
  durationMinutes?: number;
};

export type ScheduleDocumentLinkMutation = "apply" | "preserve-unavailable" | "invalid";

/** 문서 저장소 장애가 문서와 무관한 일정 편집까지 막거나 기존 연결을 지우지 않게 한다. */
export function resolveScheduleDocumentLinkMutation(input: {
  documentsHydrated: boolean;
  requestedDocumentIds: readonly string[];
  availableDocumentIds: ReadonlySet<string>;
  preserveExistingLinksWhenEmpty?: boolean;
}): ScheduleDocumentLinkMutation {
  const requested = [...new Set(input.requestedDocumentIds.filter(Boolean))];
  if (!requested.length && input.preserveExistingLinksWhenEmpty) return "preserve-unavailable";
  if (!input.documentsHydrated) return requested.length ? "invalid" : "preserve-unavailable";
  return requested.every((id) => input.availableDocumentIds.has(id)) ? "apply" : "invalid";
}

export function validateCreateItineraryItem(input: {
  sessionKind: SessionKind | null;
  currentUserId: string;
  trip: TripRoom | undefined;
  candidate: TripCandidate | undefined;
  place: Place | undefined;
  itinerary: readonly ItineraryItem[];
  date: string;
  startTime: string;
  endTime: string;
}): ItineraryValidationResult {
  const errors: string[] = [];
  const capability = canEditTripWorkspace(input);
  if (!capability.allowed) errors.push(capability.reason);
  if (!input.candidate || input.candidate.tripId !== input.trip?.id) errors.push("여행방 후보 장소를 찾을 수 없어요.");
  if (!input.place || input.place.id !== input.candidate?.placeId) errors.push("장소 정보를 찾을 수 없어요.");
  const dates = input.trip ? buildTripDateRange(input.trip.startDate, input.trip.endDate).map((date) => date.date) : [];
  if (!dates.includes(input.date)) errors.push("여행 기간 안의 날짜를 선택해 주세요.");
  const time = validateTimeRange(input.startTime, input.endTime);
  if (!time.valid) errors.push(time.message);
  const conflicts = time.valid ? findConflictingItems(input.itinerary, { date: input.date, startTime: input.startTime, endTime: input.endTime }) : [];
  return {
    valid: errors.length === 0 && conflicts.length === 0,
    errors,
    conflictItemIds: conflicts.map((item) => item.id),
    ...(time.valid ? { durationMinutes: time.durationMinutes } : {}),
  };
}

export function validateUpdateItineraryItem(input: {
  sessionKind: SessionKind | null;
  currentUserId: string;
  trip: TripRoom | undefined;
  item: ItineraryItem | undefined;
  itinerary: readonly ItineraryItem[];
  date: string;
  startTime: string;
  endTime: string;
}): ItineraryValidationResult {
  const errors: string[] = [];
  const capability = canEditTripWorkspace(input);
  if (!capability.allowed) errors.push(capability.reason);
  if (!input.item || input.item.tripId !== input.trip?.id) errors.push("일정 항목을 찾을 수 없어요.");
  const dates = input.trip ? buildTripDateRange(input.trip.startDate, input.trip.endDate).map((date) => date.date) : [];
  if (!dates.includes(input.date)) errors.push("여행 기간 안의 날짜를 선택해 주세요.");
  const time = validateTimeRange(input.startTime, input.endTime);
  if (!time.valid) errors.push(time.message);
  const conflicts = time.valid ? findConflictingItems(
    input.itinerary,
    { date: input.date, startTime: input.startTime, endTime: input.endTime },
    input.item?.id,
  ) : [];
  return {
    valid: errors.length === 0 && conflicts.length === 0,
    errors,
    conflictItemIds: conflicts.map((item) => item.id),
    ...(time.valid ? { durationMinutes: time.durationMinutes } : {}),
  };
}
