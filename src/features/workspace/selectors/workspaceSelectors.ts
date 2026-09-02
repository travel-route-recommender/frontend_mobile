import type { ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../../../domain";
import { getPlaceCategoryLabel, normalizeSearchKeyword } from "../../places/logic/placeSearch";
import { selectPlaceTripRelation } from "../../places/selectors/placeSelectors";
import type { SessionKind } from "../../auth/types";
import { buildWorkspaceMutationPermissions } from "../logic/workspaceCapabilities";
import {
  buildTripDateRange,
  findTimeConflictsForDate,
  getItineraryEndTime,
  isValidDateOnly,
  parseTimeToMinutes,
} from "../logic/workspaceDateTime";
import type {
  CandidateBoardFilter,
  CandidatePlaceViewModel,
  CandidateScheduleState,
  ItineraryItemViewModel,
  WorkspaceViewModel,
} from "../types";

export interface WorkspaceSelectorState {
  currentUserId: string;
  usersById: Readonly<Record<string, User>>;
  regionsById: Readonly<Record<string, Region>>;
  placesById: Readonly<Record<string, Place>>;
  tripsById: Readonly<Record<string, TripRoom>>;
  candidatesByTripId: Readonly<Record<string, TripCandidate[]>>;
  itineraryByTripId: Readonly<Record<string, ItineraryItem[]>>;
}

function selectCandidateScheduleState(scheduledDates: readonly string[], selectedDate: string): CandidateScheduleState {
  const dates = scheduledDates;
  if (!dates.length) return "unscheduled";
  return dates.includes(selectedDate) ? "scheduled-on-selected-date" : "scheduled-on-other-date";
}

export function selectItineraryItemsForDate(
  state: Pick<WorkspaceSelectorState, "itineraryByTripId">,
  tripId: string,
  date: string,
) {
  if (!tripId || !isValidDateOnly(date)) return [];
  const seen = new Set<string>();
  return (state.itineraryByTripId[tripId] ?? [])
    .filter((item) => item.tripId === tripId && item.date === date && Boolean(item.id) && !seen.has(item.id) && Boolean(seen.add(item.id)))
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => {
      const leftMinutes = parseTimeToMinutes(left.item.startTime);
      const rightMinutes = parseTimeToMinutes(right.item.startTime);
      if (leftMinutes === null && rightMinutes !== null) return 1;
      if (leftMinutes !== null && rightMinutes === null) return -1;
      if (leftMinutes !== null && rightMinutes !== null && leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;
      return left.sourceIndex - right.sourceIndex || left.item.id.localeCompare(right.item.id);
    })
    .map(({ item }) => item);
}

export function resolveWorkspaceSelectedDate(
  dates: readonly string[],
  requestedDate: string,
  itinerary: readonly ItineraryItem[],
  today: string,
) {
  if (dates.includes(requestedDate)) return requestedDate;
  if (dates.includes(today)) return today;
  const firstScheduledDate = dates.find((date) => itinerary.some((item) => item.date === date));
  return firstScheduledDate ?? dates[0] ?? "";
}

export function buildWorkspaceViewModel(
  state: WorkspaceSelectorState,
  tripId: string,
  requestedDate: string,
  sessionKind: SessionKind | null,
  today: string,
): WorkspaceViewModel | null {
  const trip = state.tripsById[tripId];
  if (!trip) return null;
  if (!trip.startDate || !trip.endDate) return null;
  const itinerary = state.itineraryByTripId[tripId] ?? [];
  const candidates = dedupeCandidates(state.candidatesByTripId[tripId] ?? []);
  const rawDates = buildTripDateRange(trip.startDate, trip.endDate);
  if (!rawDates.length) return null;
  const dateValues = rawDates.map((date) => date.date);
  const selectedDate = resolveWorkspaceSelectedDate(dateValues, requestedDate, itinerary, today);
  const scheduledCandidateCount = candidates.filter((candidate) => selectPlaceTripRelation(state, tripId, candidate.placeId).isScheduled).length;
  const { decision, permissions } = buildWorkspaceMutationPermissions({ sessionKind, currentUserId: state.currentUserId, trip });
  return {
    tripId: trip.id,
    title: trip.title || "이름 없는 여행방",
    startDate: trip.startDate,
    endDate: trip.endDate,
    regionName: state.regionsById[trip.regionId]?.name ?? "지역 미정",
    dates: rawDates.map((date) => ({ ...date, itineraryCount: itinerary.filter((item) => item.date === date.date).length })),
    selectedDate,
    candidateCount: candidates.length,
    unscheduledCandidateCount: candidates.length - scheduledCandidateCount,
    scheduledCandidateCount,
    itineraryCount: itinerary.length,
    memberCount: trip.members.length,
    permissions,
    canEdit: permissions.canEditSchedule,
    ...(!decision.allowed ? { readOnlyReason: decision.reason } : {}),
  };
}

function dedupeCandidates(candidates: readonly TripCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.placeId || seen.has(candidate.placeId)) return false;
    seen.add(candidate.placeId);
    return true;
  });
}

export function buildCandidatePlaceViewModels(
  state: WorkspaceSelectorState,
  tripId: string,
  selectedDate: string,
): CandidatePlaceViewModel[] {
  const trip = state.tripsById[tripId];
  const dayLabelByDate = new Map(
    trip?.startDate && trip.endDate
      ? buildTripDateRange(trip.startDate, trip.endDate).map((date) => [date.date, date.dayLabel] as const)
      : [],
  );
  return dedupeCandidates(state.candidatesByTripId[tripId] ?? []).map((candidate) => {
    const place = state.placesById[candidate.placeId];
    const addedByNames = candidate.addedByUserIds.flatMap((userId) => state.usersById[userId]?.name ? [state.usersById[userId].name] : []);
    const relation = selectPlaceTripRelation(state, tripId, candidate.placeId);
    const scheduledDates = [...new Set(relation.scheduledItems
      .map((item) => item.date)
      .filter(isValidDateOnly))].sort();
    return {
      tripId,
      placeId: candidate.placeId,
      name: place?.name ?? "장소 정보를 불러오지 못했어요",
      ...(place?.imageUrl ? { imageUrl: place.imageUrl } : {}),
      categoryLabel: place ? getPlaceCategoryLabel(place.category) : "장소 정보 없음",
      address: place?.address ?? "연결된 장소 데이터가 없어요.",
      tags: place?.tags.slice(0, 3) ?? [],
      addedByUserIds: [...candidate.addedByUserIds],
      addedByNames,
      addedByCount: candidate.addedByUserIds.length,
      recommendedByDuri: candidate.recommendedByDuri,
      scheduleState: selectCandidateScheduleState(scheduledDates, selectedDate),
      scheduledCount: relation.scheduledCount,
      scheduledDates,
      scheduledPlacements: relation.scheduledItems
        .filter((item) => isValidDateOnly(item.date))
        .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id))
        .map((item) => ({
          itemId: item.id,
          date: item.date,
          dayLabel: dayLabelByDate.get(item.date) ?? item.date,
          startTime: item.startTime,
          endTime: getItineraryEndTime(item),
        })),
      placeMissing: !place,
    };
  });
}

export function filterCandidatePlaceViewModels(
  candidates: readonly CandidatePlaceViewModel[],
  keyword: string,
  filter: CandidateBoardFilter,
  currentUserId = "",
) {
  const normalized = normalizeSearchKeyword(keyword);
  return candidates.filter((candidate) => {
    const matchesFilter = filter === "all"
      || (filter === "common" && candidate.addedByCount > 1)
      || (filter === "mine" && candidate.addedByUserIds.includes(currentUserId))
      || (filter === "companion" && candidate.addedByUserIds.some((userId) => userId !== currentUserId));
    if (!matchesFilter) return false;
    if (!normalized) return true;
    return normalizeSearchKeyword([
      candidate.name,
      candidate.address,
      candidate.categoryLabel,
      ...candidate.tags,
    ].join(" ")).includes(normalized);
  });
}

export function buildItineraryItemViewModels(
  state: WorkspaceSelectorState,
  tripId: string,
  selectedDate: string,
  dates: readonly string[],
): ItineraryItemViewModel[] {
  const items = selectItineraryItemsForDate(state, tripId, selectedDate);
  const conflicts = Object.fromEntries(findTimeConflictsForDate(items, selectedDate).map((conflict) => [conflict.itemId, conflict.conflictingItemIds]));
  return items.map((item) => {
    const place = item.placeId ? state.placesById[item.placeId] : undefined;
    const preferredByNames = item.preferredByUserIds.flatMap((userId) => state.usersById[userId]?.name ? [state.usersById[userId].name] : []);
    const conflictItemIds = conflicts[item.id] ?? [];
    return {
      id: item.id,
      tripId: item.tripId,
      ...(item.placeId ? { placeId: item.placeId } : {}),
      placeName: place?.name ?? item.note ?? "장소 정보를 불러오지 못했어요",
      ...(place?.imageUrl ? { imageUrl: place.imageUrl } : {}),
      date: item.date,
      dayIndex: dates.indexOf(item.date),
      startTime: parseTimeToMinutes(item.startTime) === null ? "시간 미정" : item.startTime,
      endTime: getItineraryEndTime(item),
      durationMinutes: item.durationMinutes,
      ...(item.note ? { note: item.note } : {}),
      lockedForDuri: Boolean(item.lockedForDuri),
      categoryLabel: place ? getPlaceCategoryLabel(place.category) : item.itemType === "reservation" ? "예약 일정" : item.itemType,
      preferredByNames,
      conflictItemIds,
      hasTimeConflict: conflictItemIds.length > 0,
      placeMissing: Boolean(item.placeId && !place),
    };
  });
}
