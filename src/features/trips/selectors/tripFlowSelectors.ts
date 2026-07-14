import type { EntityId, ItineraryItem, Region, TripCandidate, TripRoom, User } from "../../../domain";
import { formatTripDateRange, formatTripStatus } from "../../../utils/formatters";
import { calculateTripPreparationProgress } from "../logic/calculateTripPreparationProgress";
import type { TripRoomCardViewModel } from "../types";
import { getTripTimingLabel } from "../utils/tripDateUtils";
import { selectRoomPreferenceResponseSummary } from "./preferenceResponseSelectors";

export interface TripFlowSelectorState {
  currentUserId: EntityId;
  tripsById: Readonly<Record<EntityId, TripRoom>>;
  tripOrder: readonly EntityId[];
  usersById: Readonly<Record<EntityId, User>>;
  regionsById: Readonly<Record<EntityId, Region>>;
  candidatesByTripId: Readonly<Record<EntityId, TripCandidate[]>>;
  itineraryByTripId: Readonly<Record<EntityId, ItineraryItem[]>>;
  preferenceResultsByUserId: Readonly<Record<EntityId, unknown>>;
}

export function selectTripCandidateCount(state: TripFlowSelectorState, tripId: EntityId) {
  return state.candidatesByTripId[tripId]?.length ?? 0;
}

export function selectTripItineraryCount(state: TripFlowSelectorState, tripId: EntityId) {
  return state.itineraryByTripId[tripId]?.length ?? 0;
}

export function selectTripRoomCardViewModel(
  state: TripFlowSelectorState,
  tripId: EntityId,
  today?: string,
): TripRoomCardViewModel | undefined {
  const trip = state.tripsById[tripId];
  if (!trip || !trip.members.some((member) => member.userId === state.currentUserId)) return undefined;
  const region = state.regionsById[trip.regionId];
  const response = selectRoomPreferenceResponseSummary(state, tripId);
  const candidateCount = selectTripCandidateCount(state, tripId);
  const itineraryCount = selectTripItineraryCount(state, tripId);
  const timingLabel = getTripTimingLabel(trip.startDate, trip.endDate, today);
  return {
    id: trip.id,
    title: trip.title || "이름 없는 여행방",
    destinationName: region?.name ?? "목적지 미정",
    ...(region?.imageUrl ? { imageUrl: region.imageUrl } : {}),
    dateLabel: formatTripDateRange(trip.startDate, trip.endDate),
    status: trip.status,
    statusLabel: formatTripStatus(trip.status),
    ...(timingLabel ? { timingLabel } : {}),
    members: trip.members.flatMap((member) => {
      const user = state.usersById[member.userId];
      return user ? [{ userId: user.id, name: user.name, initial: user.initial, ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}) }] : [];
    }),
    memberCount: response.totalCount,
    candidateCount,
    itineraryCount,
    preferenceCompletedCount: response.completedCount,
    preferenceTotalCount: response.totalCount,
    preparation: calculateTripPreparationProgress({ trip, completedPreferenceCount: response.completedCount, preferenceTargetCount: response.totalCount, candidateCount, itineraryCount }),
    isOwner: trip.members.some((member) => member.userId === state.currentUserId && member.role === "owner"),
  };
}
