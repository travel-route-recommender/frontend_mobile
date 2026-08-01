import type { EntityId, ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../../../domain";
import type { PlaceCandidateState, PlaceCardViewModel } from "../types";
import { getPlaceCategoryLabel } from "../logic/placeSearch";

const isGenericTourSummary = (summary: string) => /TourAPI/i.test(summary);
const REGION_NAME_FALLBACKS: readonly [RegExp, string][] = [
  [/^서울/, "서울특별시"],
  [/^부산/, "부산광역시"],
  [/^대구/, "대구광역시"],
  [/^인천/, "인천광역시"],
  [/^광주/, "광주광역시"],
  [/^대전/, "대전광역시"],
  [/^울산/, "울산광역시"],
  [/^세종/, "세종특별자치시"],
  [/^경기/, "경기도"],
  [/^강원/, "강원특별자치도"],
  [/^충청북도|^충북/, "충청북도"],
  [/^충청남도|^충남/, "충청남도"],
  [/^전북|^전라북도/, "전북특별자치도"],
  [/^전라남도|^전남/, "전라남도"],
  [/^경상북도|^경북/, "경상북도"],
  [/^경상남도|^경남/, "경상남도"],
  [/^제주/, "제주특별자치도"],
];

function resolvePlaceRegionName(place: Place, regionsById: Readonly<Record<EntityId, Region>>) {
  const regionName = regionsById[place.regionId]?.name;
  if (regionName) return regionName;

  const address = place.address.trim();
  const fallback = REGION_NAME_FALLBACKS.find(([pattern]) => pattern.test(address))?.[1];
  if (fallback) return fallback;

  const firstToken = address.split(/\s+/)[0]?.trim();
  return firstToken && firstToken !== "주소" ? firstToken : "지역 정보 없음";
}

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
  }).sort((left, right) => (left.startDate ?? "9999-12-31").localeCompare(right.startDate ?? "9999-12-31") || left.title.localeCompare(right.title, "ko") || left.id.localeCompare(right.id));
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
    regionName: resolvePlaceRegionName(place, state.regionsById),
    categoryLabel,
    tags,
    hiddenTagCount: 0,
    ...(Number.isFinite(place.rating) ? { rating: place.rating } : {}),
    ...(place.distanceLabel ? { distanceLabel: place.distanceLabel } : {}),
    isSaved: savedIds.has(place.id),
    candidateTripIds,
    activeTripCandidateState: activeState,
  };
}
