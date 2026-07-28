import type { EntityId, ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../../../domain";
import type { PlaceCandidateState, PlaceCardViewModel } from "../types";
import { getPlaceCategoryLabel } from "../logic/placeSearch";

const isGenericTourSummary = (summary: string) => /TourAPI/i.test(summary);

export interface PlaceSelectorState {
  currentUserId: EntityId;
  activeTripId: EntityId;
  usersById: Readonly<Record<EntityId, User>>;
  placesById: Readonly<Record<EntityId, Place>>;
  regionsById: Readonly<Record<EntityId, Region>>;
  tripsById: Readonly<Record<EntityId, TripRoom>>;
  tripOrder: readonly EntityId[];
  savedPlaceIdsByUserId: Readonly<Record<EntityId, EntityId[]>>;
  candidatesByTripId: Readonly<Record<EntityId, TripCandidate[]>>;
  itineraryByTripId: Readonly<Record<EntityId, ItineraryItem[]>>;
}

export function selectResolvedSavedPlaces(state: Pick<PlaceSelectorState, "currentUserId" | "savedPlaceIdsByUserId" | "placesById">) {
  const ids = state.savedPlaceIdsByUserId[state.currentUserId] ?? [];
  const seen = new Set<EntityId>();
  const places: Place[] = [];
  const missingIds: EntityId[] = [];
  ids.forEach((placeId) => {
    if (seen.has(placeId)) return;
    seen.add(placeId);
    const place = state.placesById[placeId];
    if (place) places.push(place);
    else missingIds.push(placeId);
  });
  return { places, missingIds };
}

export function selectCandidateForPlace(state: Pick<PlaceSelectorState, "candidatesByTripId">, tripId: EntityId, placeId: EntityId) {
  return (state.candidatesByTripId[tripId] ?? []).find((candidate) => candidate.placeId === placeId);
}

export function selectCandidateStateForPlace(state: Pick<PlaceSelectorState, "candidatesByTripId" | "itineraryByTripId">, tripId: EntityId, placeId: EntityId): PlaceCandidateState {
  if ((state.itineraryByTripId[tripId] ?? []).some((item) => item.placeId === placeId)) return "scheduled";
  return selectCandidateForPlace(state, tripId, placeId) ? "candidate" : "not-added";
}

export function selectEligibleTripsForPlaceCandidate(state: Pick<PlaceSelectorState, "currentUserId" | "tripOrder" | "tripsById">) {
  const seen = new Set<EntityId>();
  return [...state.tripOrder, ...Object.keys(state.tripsById)].flatMap((tripId) => {
    if (seen.has(tripId)) return [];
    seen.add(tripId);
    const trip = state.tripsById[tripId];
    return trip && trip.status !== "completed" && trip.members.some((member) => member.userId === state.currentUserId) ? [trip] : [];
  }).sort((left, right) => left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title, "ko") || left.id.localeCompare(right.id));
}

export function selectActiveCandidateTrip(state: Pick<PlaceSelectorState, "activeTripId" | "currentUserId" | "tripsById">) {
  const trip = state.tripsById[state.activeTripId];
  return trip && trip.status !== "completed" && trip.members.some((member) => member.userId === state.currentUserId) ? trip : undefined;
}

export function buildPlaceCardViewModel(state: PlaceSelectorState, placeId: EntityId): PlaceCardViewModel | null {
  const place = state.placesById[placeId];
  if (!place) return null;
  const savedIds = new Set(state.savedPlaceIdsByUserId[state.currentUserId] ?? []);
  const candidateTripIds = Object.entries(state.candidatesByTripId).flatMap(([tripId, candidates]) => {
    const trip = state.tripsById[tripId];
    return trip?.members.some((member) => member.userId === state.currentUserId) && candidates.some((candidate) => candidate.placeId === placeId) ? [tripId] : [];
  });
  const activeState = state.activeTripId ? selectCandidateStateForPlace(state, state.activeTripId, placeId) : "not-added";
  const categoryLabel = getPlaceCategoryLabel(place.category);
  const tags = [...new Set((Array.isArray(place.tags) ? place.tags : [])
    .map((tag) => tag.trim())
    .filter((tag) => tag && tag !== categoryLabel && !/^\d+$/.test(tag)))];
  const summary = place.summary.trim();
  return {
    id: place.id,
    name: place.name,
    ...(place.imageUrl ? { imageUrl: place.imageUrl } : {}),
    address: place.address,
    summary: isGenericTourSummary(summary) ? "" : summary,
    regionName: state.regionsById[place.regionId]?.name ?? "지역 정보 없음",
    categoryLabel,
    tags: tags.slice(0, 3),
    hiddenTagCount: Math.max(tags.length - 3, 0),
    ...(Number.isFinite(place.rating) ? { rating: place.rating } : {}),
    ...(place.distanceLabel ? { distanceLabel: place.distanceLabel } : {}),
    isSaved: savedIds.has(place.id),
    candidateTripIds,
    activeTripCandidateState: activeState,
  };
}
