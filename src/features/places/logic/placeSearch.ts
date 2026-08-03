import type { EntityId, Place, Region } from "../../../domain";
import type { PlaceSearchParams, PlaceSortOption } from "../types";
import { matchesPlaceClassifications } from "./placeClassification";

const TOUR_REGION_IDS = new Set([
  "seoul",
  "incheon",
  "daejeon",
  "daegu",
  "gwangju",
  "busan",
  "ulsan",
  "sejong",
  "gyeonggi",
  "gangwon",
  "chungbuk",
  "chungnam",
  "gyeongju",
  "gyeongbuk",
  "gyeongnam",
  "jeonbuk",
  "jeonnam",
  "jeju",
]);

const DISTRICT_REGION_ALIASES: Readonly<Record<string, { regionId: EntityId; district: string }>> = {
  gyeongju: { regionId: "gyeongbuk", district: "경주시" },
};

const TOUR_FESTIVAL_CATEGORY_LABEL = "행사/공연/축제";

export function normalizeSearchKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function getPlaceCategoryLabel(category: string) {
  return category.trim() || "기타";
}

function normalizePlaceIdentityPart(value: string) {
  return normalizeSearchKeyword(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[·ㆍ,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPlaceDisplayFingerprint(place: Place) {
  const name = normalizePlaceIdentityPart(place.name);
  const address = normalizePlaceIdentityPart(place.address);
  if (!name || !address || address === normalizePlaceIdentityPart("주소 정보 없음")) return "";
  return `${name}::${address}`;
}

export function dedupePlacesForDisplay(places: readonly Place[]) {
  const seenIds = new Set<EntityId>();
  const seenFingerprints = new Set<string>();
  const result: Place[] = [];

  places.forEach((place) => {
    if (seenIds.has(place.id)) return;
    const fingerprint = getPlaceDisplayFingerprint(place);
    if (fingerprint && seenFingerprints.has(fingerprint)) return;
    seenIds.add(place.id);
    if (fingerprint) seenFingerprints.add(fingerprint);
    result.push(place);
  });

  return result;
}

export function matchesPlaceKeyword(place: Place, keyword: string, region?: Region) {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) return true;
  const searchable = [place.name, place.address, place.category, place.summary, region?.name, region?.shortName, ...(Array.isArray(place.tags) ? place.tags : [])]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeSearchKeyword)
    .join(" ");
  return searchable.includes(normalized);
}

export function normalizeRegionFilter(regionId: string, _regionsById: Readonly<Record<EntityId, Region>>): EntityId | "all" {
  return regionId === "all" || _regionsById[regionId] || TOUR_REGION_IDS.has(regionId) ? regionId : "all";
}

function matchesLocation(place: Place, regionId: EntityId | "all", district: string | "all" | undefined, regionsById: Readonly<Record<EntityId, Region>>) {
  const normalizedRegion = normalizeRegionFilter(regionId, regionsById);
  const alias = DISTRICT_REGION_ALIASES[place.regionId];
  if (normalizedRegion !== "all" && place.regionId !== normalizedRegion && alias?.regionId !== normalizedRegion) return false;
  const normalizedDistrict = district && district !== "all" ? normalizeSearchKeyword(district) : "";
  return !normalizedDistrict || normalizeSearchKeyword(`${place.address} ${place.name} ${alias?.district ?? ""}`).includes(normalizedDistrict);
}

function dateToNumber(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number(value.replace(/-/g, ""));
}

function matchesEventDateRange(place: Place, startDate?: string, endDate?: string) {
  const filterStart = dateToNumber(startDate);
  const filterEnd = dateToNumber(endDate) ?? filterStart;
  if (filterStart === undefined && filterEnd === undefined) return true;
  const eventStart = dateToNumber(place.eventStartDate) ?? dateToNumber(place.eventEndDate);
  const eventEnd = dateToNumber(place.eventEndDate) ?? eventStart;
  if (eventStart === undefined || eventEnd === undefined) return false;
  return eventStart <= (filterEnd ?? Number.POSITIVE_INFINITY) && eventEnd >= (filterStart ?? Number.NEGATIVE_INFINITY);
}

export function filterPlaces(places: readonly Place[], params: Pick<PlaceSearchParams, "keyword" | "regionId" | "district" | "locations" | "category" | "categories" | "classification" | "classifications" | "eventStartDate" | "eventEndDate">, regionsById: Readonly<Record<EntityId, Region>>) {
  const regionId = normalizeRegionFilter(params.regionId, regionsById);
  const locations = params.locations?.filter((location) => location.regionId !== "all") ?? [];
  const categoryFilters = params.categories?.length ? params.categories : params.category !== "all" ? [params.category] : [];
  const classificationFilters = params.classifications?.length ? params.classifications : params.classification ? [params.classification] : [];
  const hasEventDateFilter = Boolean(params.eventStartDate || params.eventEndDate);
  return places.filter((place) => {
    const placeCategory = getPlaceCategoryLabel(place.category);
    if (locations.length) {
      if (!locations.some((location) => matchesLocation(place, location.regionId, location.district, regionsById))) return false;
    } else {
      if (!matchesLocation(place, regionId, params.district, regionsById)) return false;
    }
    if (!matchesPlaceClassifications(place, classificationFilters)) return false;
    if (categoryFilters.length && !categoryFilters.includes(placeCategory)) return false;
    if (hasEventDateFilter && placeCategory === TOUR_FESTIVAL_CATEGORY_LABEL && !matchesEventDateRange(place, params.eventStartDate, params.eventEndDate)) return false;
    return matchesPlaceKeyword(place, params.keyword, regionsById[place.regionId]);
  });
}

function parseDistanceMeters(label?: string) {
  if (!label) return Number.POSITIVE_INFINITY;
  const compact = label.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
  const match = compact.match(/^(\d+(?:\.\d+)?)(km|m)$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return match[2] === "km" ? value * 1000 : value;
}

function getPlaceCoordinate(place?: Place) {
  if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") return undefined;
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return undefined;
  return { latitude: place.latitude, longitude: place.longitude };
}

function distanceBetweenMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSortableDistanceMeters(place: Place, baseCoordinate?: { latitude: number; longitude: number }) {
  const coordinate = getPlaceCoordinate(place);
  if (baseCoordinate && coordinate) return distanceBetweenMeters(baseCoordinate, coordinate);
  return parseDistanceMeters(place.distanceLabel);
}

export function getPlaceDistanceMeters(place: Place, basePlace?: Place) {
  const baseCoordinate = getPlaceCoordinate(basePlace);
  if (!baseCoordinate) return undefined;
  const distanceMeters = getSortableDistanceMeters(place, baseCoordinate);
  return Number.isFinite(distanceMeters) ? distanceMeters : undefined;
}

export function getPlaceDistanceProximityLabel(place: Place, basePlace?: Place) {
  const distanceMeters = getPlaceDistanceMeters(place, basePlace);
  if (distanceMeters === undefined) return undefined;
  return distanceMeters <= 1000
    ? "1km 이내"
    : distanceMeters <= 3000
      ? "3km 이내"
      : distanceMeters <= 10000
        ? "10km 이내"
        : distanceMeters <= 30000
          ? "30km 이내"
          : "30km 이상";
}

export function sortPlaces(places: readonly Place[], sort: PlaceSortOption, savedPlaceIds: ReadonlySet<EntityId>, distanceBasePlace?: Place) {
  const baseCoordinate = getPlaceCoordinate(distanceBasePlace);
  const indexed = places.map((place, index) => ({ place, index }));
  indexed.sort((left, right) => {
    if (sort === "popular") return left.index - right.index;
    if (sort === "rating") return (right.place.rating ?? 0) - (left.place.rating ?? 0) || left.index - right.index;
    if (sort === "distance") return getSortableDistanceMeters(left.place, baseCoordinate) - getSortableDistanceMeters(right.place, baseCoordinate) || left.index - right.index;
    if (sort === "name") return left.place.name.localeCompare(right.place.name, "ko") || left.place.id.localeCompare(right.place.id);
    if (sort === "saved-first") {
      const savedOrder = Number(savedPlaceIds.has(right.place.id)) - Number(savedPlaceIds.has(left.place.id));
      return savedOrder || left.index - right.index;
    }
    return left.index - right.index;
  });
  return indexed.map(({ place }) => place);
}

export function searchPlaces(places: readonly Place[], params: PlaceSearchParams, regionsById: Readonly<Record<EntityId, Region>>, savedPlaceIds: ReadonlySet<EntityId>) {
  const distanceBasePlace = params.distanceBasePlaceId ? places.find((place) => place.id === params.distanceBasePlaceId) : undefined;
  return sortPlaces(filterPlaces(places, params, regionsById), params.sort, savedPlaceIds, distanceBasePlace);
}

export function findSimilarPlaces({ place, places, limit = 3 }: { place: Place; places: readonly Place[]; limit?: number }) {
  const sourceTags = new Set(place.tags);
  return places
    .filter((candidate) => candidate.id !== place.id)
    .map((candidate) => ({
      place: candidate,
      score: Number(candidate.regionId === place.regionId) * 4 + Number(candidate.category === place.category) * 2 + candidate.tags.filter((tag) => sourceTags.has(tag)).length,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.place.name.localeCompare(right.place.name, "ko") || left.place.id.localeCompare(right.place.id))
    .slice(0, Math.max(0, limit))
    .map(({ place: candidate }) => candidate);
}

export type PlaceCoordinate = { latitude: number; longitude: number };

export function parsePlaceCoordinate(value: unknown): PlaceCoordinate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const latitude = typeof source.latitude === "number" ? source.latitude : typeof source.latitude === "string" ? Number(source.latitude) : Number.NaN;
  const longitude = typeof source.longitude === "number" ? source.longitude : typeof source.longitude === "string" ? Number(source.longitude) : Number.NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;
  return { latitude, longitude };
}
