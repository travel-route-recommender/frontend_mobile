import type { EntityId, Place, Region } from "../../../domain";
import type { PlaceSearchParams, PlaceSortOption } from "../types";

export function normalizeSearchKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function getPlaceCategoryLabel(category: string) {
  return category.trim() || "기타";
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

export function normalizeRegionFilter(regionId: string, regionsById: Readonly<Record<EntityId, Region>>): EntityId | "all" {
  return regionId === "all" || !regionsById[regionId] ? "all" : regionId;
}

export function filterPlaces(places: readonly Place[], params: Pick<PlaceSearchParams, "keyword" | "regionId" | "category">, regionsById: Readonly<Record<EntityId, Region>>) {
  const regionId = normalizeRegionFilter(params.regionId, regionsById);
  return places.filter((place) => {
    if (regionId !== "all" && place.regionId !== regionId) return false;
    if (params.category !== "all" && getPlaceCategoryLabel(place.category) !== params.category) return false;
    return matchesPlaceKeyword(place, params.keyword, regionsById[place.regionId]);
  });
}

export function sortPlaces(places: readonly Place[], sort: PlaceSortOption, savedPlaceIds: ReadonlySet<EntityId>) {
  const indexed = places.map((place, index) => ({ place, index }));
  indexed.sort((left, right) => {
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
  return sortPlaces(filterPlaces(places, params, regionsById), params.sort, savedPlaceIds);
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

