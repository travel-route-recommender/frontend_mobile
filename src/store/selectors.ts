import type { EntityId, Place, TripCandidate, TripRoom } from "../domain";
import { analyzeTrip } from "../duri/duri-analysis";
import type { DuriAnalysisInput } from "../duri/duri-analysis";
import { diagnoseGroupPreferences } from "../duri/group-preferences";
import {
  selectMemberPreferenceStatus,
  selectRoomPreferenceResponseSummary,
} from "../features/trips/selectors";
import type {
  MemberPreferenceStatus,
  RoomPreferenceResponseSummary,
} from "../features/trips/selectors";
import type { DuriState } from "./useDuriStore";

export interface TripCollectionSelectorState {
  currentUserId: EntityId;
  tripsById: Readonly<Record<EntityId, TripRoom>>;
  tripOrder: readonly EntityId[];
}

const emptyEntityIds: EntityId[] = [];

const getSortableDate = (value: string, fallback: number) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
};

export const selectTripsForCurrentUser = (state: TripCollectionSelectorState) => {
  const orderedIds = [...new Set([
    ...state.tripOrder,
    ...Object.keys(state.tripsById).filter((tripId) => !state.tripOrder.includes(tripId)),
  ])];

  return orderedIds.flatMap((tripId) => {
    const trip = state.tripsById[tripId];
    return trip?.members.some((member) => member.userId === state.currentUserId) ? [trip] : [];
  });
};

export const selectPlanningTripsForCurrentUser = (state: TripCollectionSelectorState) =>
  selectTripsForCurrentUser(state)
    .filter((trip) => trip.status !== "completed")
    .sort((left, right) => getSortableDate(left.startDate, Number.POSITIVE_INFINITY) - getSortableDate(right.startDate, Number.POSITIVE_INFINITY) || left.title.localeCompare(right.title, "ko") || left.id.localeCompare(right.id));

export const selectCompletedTripsForCurrentUser = (state: TripCollectionSelectorState) =>
  selectTripsForCurrentUser(state)
    .filter((trip) => trip.status === "completed")
    .sort((left, right) => getSortableDate(right.endDate, Number.NEGATIVE_INFINITY) - getSortableDate(left.endDate, Number.NEGATIVE_INFINITY) || left.title.localeCompare(right.title, "ko") || left.id.localeCompare(right.id));

export const selectCurrentUser = (state: DuriState) => state.usersById[state.currentUserId];
export const selectCurrentUserPreferenceResult = (state: DuriState) =>
  state.preferenceResultsByUserId[state.currentUserId];
export const selectCurrentUserTripSummary = (state: DuriState) => {
  const planningCount = selectPlanningTripsForCurrentUser(state).length;
  const completedCount = selectCompletedTripsForCurrentUser(state).length;
  return {
    planningCount,
    completedCount,
    totalCount: planningCount + completedCount,
  };
};
export const selectCurrentUserNextTrip = (state: DuriState) =>
  selectPlanningTripsForCurrentUser(state)[0];
export const selectActiveTrip = (state: DuriState) => state.tripsById[state.activeTripId];
export const selectActiveTripForCurrentUser = (state: DuriState) => {
  const trip = selectActiveTrip(state);
  return trip?.members.some((member) => member.userId === state.currentUserId) ? trip : undefined;
};
export const selectSavedPlaceIdsForCurrentUser = (state: DuriState) => {
  const savedIds = state.savedPlaceIdsByUserId?.[state.currentUserId];
  return Array.isArray(savedIds) ? savedIds : emptyEntityIds;
};
export const selectIsPlaceSavedByCurrentUser = (state: DuriState, placeId: EntityId) =>
  selectSavedPlaceIdsForCurrentUser(state).includes(placeId);
export const selectEligibleTripsForCandidate = selectPlanningTripsForCurrentUser;
export const selectIsPlaceCandidateForTrip = (state: DuriState, tripId: EntityId, placeId: EntityId) =>
  (state.candidatesByTripId[tripId] ?? []).some((candidate) => candidate.placeId === placeId);
export const selectIsPlaceCandidateForActiveTrip = (state: DuriState, placeId: EntityId) => {
  const activeTrip = selectActiveTripForCurrentUser(state);
  return Boolean(
    activeTrip &&
    activeTrip.status !== "completed" &&
    selectIsPlaceCandidateForTrip(state, activeTrip.id, placeId),
  );
};
export const selectScheduledPlacementForPlace = (state: DuriState, placeId: EntityId) => {
  const activeTrip = selectActiveTripForCurrentUser(state);
  if (!activeTrip || activeTrip.status === "completed") return undefined;
  return (state.itineraryByTripId[activeTrip.id] ?? []).find((item) => item.placeId === placeId);
};
export const selectTripById = (state: DuriState, tripId: EntityId) => state.tripsById[tripId];
export const selectTripMembers = (state: DuriState, tripId: EntityId) => {
  const trip = selectTripById(state, tripId);
  return trip?.members.map((member) => state.usersById[member.userId]).filter(Boolean) ?? [];
};

export type TripPreferenceMemberView = MemberPreferenceStatus;

export type TripPreferenceProgress = RoomPreferenceResponseSummary & {
  status: "not-started" | "in-progress" | "completed";
  completedMembers: TripPreferenceMemberView[];
  pendingMembers: TripPreferenceMemberView[];
};

export const selectTripPreferenceResponseStatus = selectMemberPreferenceStatus;

export const selectCompletedPreferenceMemberIds = (state: DuriState, tripId: EntityId) =>
  selectRoomPreferenceResponseSummary(state, tripId).completedMemberIds;

export const selectPendingPreferenceMembers = (state: DuriState, tripId: EntityId) =>
  selectTripPreferenceResponseStatus(state, tripId).filter((member) => member.state !== "completed");

export const selectTripPreferenceProgress = (state: DuriState, tripId: EntityId): TripPreferenceProgress => {
  const summary = selectRoomPreferenceResponseSummary(state, tripId);
  const completedMembers = summary.members.filter((member) => member.state === "completed");
  const pendingMembers = summary.members.filter((member) => member.state !== "completed");
  const status = summary.isComplete
    ? "completed"
    : summary.completedCount > 0
      ? "in-progress"
      : "not-started";
  return {
    ...summary,
    status,
    completedMembers,
    pendingMembers,
  };
};
export const selectTripCandidates = (state: DuriState, tripId: EntityId) => state.candidatesByTripId[tripId] ?? [];
export const selectTripItinerary = (state: DuriState, tripId: EntityId) => state.itineraryByTripId[tripId] ?? [];
export const selectSavedPlacesForCurrentUser = (state: DuriState) => {
  const seen = new Set<EntityId>();
  return selectSavedPlaceIdsForCurrentUser(state).flatMap((placeId) => {
    if (seen.has(placeId)) return [];
    seen.add(placeId);
    const place = state.placesById[placeId];
    return place ? [place] : [];
  });
};
export const selectSavedPlaceCountForCurrentUser = (state: DuriState) =>
  selectSavedPlacesForCurrentUser(state).length;
export const selectTripAnalysisInput = (state: DuriState, tripId: EntityId): DuriAnalysisInput | undefined => {
  const trip = state.tripsById[tripId];
  if (!trip) return undefined;
  return {
    trip,
    members: trip.members.flatMap((member) => (state.usersById[member.userId] ? [state.usersById[member.userId]] : [])),
    placesById: state.placesById,
    candidates: state.candidatesByTripId[tripId] ?? [],
    itinerary: state.itineraryByTripId[tripId] ?? [],
    preferenceResults: state.preferenceResultsByUserId,
    groupPreferenceDiagnosis: diagnoseGroupPreferences(trip, state.preferenceResultsByUserId),
  };
};
export const selectTripAnalysis = (state: DuriState, tripId: EntityId) => {
  const input = selectTripAnalysisInput(state, tripId);
  return input ? analyzeTrip(input) : undefined;
};
export const selectPlaceById = (state: DuriState, placeId: EntityId) => state.placesById[placeId];
export const selectAllPlaces = (state: DuriState) => Object.values(state.placesById);
export const selectScheduledPlaceIds = (state: DuriState, tripId: EntityId) =>
  new Set(selectTripItinerary(state, tripId).flatMap((item) => (item.placeId ? [item.placeId] : [])));
export const selectAvailableCandidates = (state: DuriState, tripId: EntityId) => {
  const scheduledIds = selectScheduledPlaceIds(state, tripId);
  return selectTripCandidates(state, tripId).filter((candidate) => !scheduledIds.has(candidate.placeId));
};

export type TripStats = {
  candidateCount: number;
  scheduledCount: number;
  unplannedCount: number;
  companionCount: number;
  completedPreferenceCount: number;
  preferenceTargetCount: number;
};

export function selectTripStats(state: DuriState, tripId: EntityId): TripStats {
  const candidates = selectTripCandidates(state, tripId);
  const candidateIds = new Set(candidates.map((candidate) => candidate.placeId));
  const scheduledCandidateIds = new Set(
    selectTripItinerary(state, tripId).flatMap((item) => (item.placeId && candidateIds.has(item.placeId) ? [item.placeId] : [])),
  );
  const preferenceProgress = selectTripPreferenceProgress(state, tripId);
  const preferenceTargetCount = preferenceProgress.totalCount;
  const completedPreferenceCount = preferenceProgress.completedCount;
  return {
    candidateCount: candidates.length,
    scheduledCount: scheduledCandidateIds.size,
    unplannedCount: Math.max(candidates.length - scheduledCandidateIds.size, 0),
    companionCount: preferenceTargetCount,
    completedPreferenceCount,
    preferenceTargetCount,
  };
}

export function resolveCandidatePlaces(
  candidates: TripCandidate[],
  placesById: Record<EntityId, Place>,
) {
  return candidates.flatMap((candidate) => {
    const place = placesById[candidate.placeId];
    return place ? [{ candidate, place }] : [];
  });
}
