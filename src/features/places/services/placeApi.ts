import type { EntityId, Place } from "../../../domain";
import { environment } from "../../../config/environment";
import { createApiClient } from "../../../services/apiClient";

type TourPlaceImage = {
  url?: string;
  thumbnailUrl?: string;
  name?: string;
};

type TourPlace = {
  id?: string;
  source?: "TOUR_API";
  contentTypeId?: number;
  contentTypeLabel?: string | null;
  name?: string;
  address?: string | null;
  thumbnailUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | string;
  overview?: string | null;
  tel?: string | null;
  homepage?: string | null;
  areaCode?: string | null;
  sigunguCode?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  images?: TourPlaceImage[];
};

type TourPlacePage = {
  data?: TourPlace[];
  meta?: {
    total?: number;
    page?: number;
    size?: number;
  };
};

export type BackendPlacePageResult = {
  places: Place[];
  page: number;
  size: number;
  total?: number;
  hasNextPage: boolean;
};

export type BackendPlaceSearchParams = {
  keyword?: string;
  category?: string;
  regionId?: EntityId | "all";
  eventStartDate?: string;
  eventEndDate?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
};

const apiClient = createApiClient(environment.apiBaseUrl);

const TOUR_CONTENT_TYPE_LABELS: Record<number, string> = {
  12: "관광지",
  14: "문화시설",
  15: "행사/공연/축제",
  25: "여행코스",
  28: "레포츠",
  32: "숙박",
  38: "쇼핑",
  39: "음식점",
};

export const TOUR_FESTIVAL_CATEGORY = TOUR_CONTENT_TYPE_LABELS[15];
export const TOUR_PLACE_CATEGORIES = Object.values(TOUR_CONTENT_TYPE_LABELS);

const CATEGORY_TO_CONTENT_TYPE_ID = new Map(
  Object.entries(TOUR_CONTENT_TYPE_LABELS).map(([id, label]) => [label, Number(id)]),
);

const REGION_TO_AREA_CODE: Record<EntityId, string> = {
  seoul: "1",
  incheon: "2",
  daejeon: "3",
  daegu: "4",
  gwangju: "5",
  busan: "6",
  ulsan: "7",
  sejong: "8",
  gyeonggi: "31",
  gangwon: "32",
  chungbuk: "33",
  chungnam: "34",
  gyeongju: "35",
  gyeongbuk: "35",
  gyeongnam: "36",
  jeonbuk: "37",
  jeonnam: "38",
  jeju: "39",
};

const AREA_CODE_TO_REGION: Record<string, EntityId> = {
  "1": "seoul",
  "2": "incheon",
  "3": "daejeon",
  "4": "daegu",
  "5": "gwangju",
  "6": "busan",
  "7": "ulsan",
  "8": "sejong",
  "31": "gyeonggi",
  "32": "gangwon",
  "33": "chungbuk",
  "34": "chungnam",
  "35": "gyeongju",
  "36": "gyeongnam",
  "37": "jeonbuk",
  "38": "jeonnam",
  "39": "jeju",
};

const regionPatterns: readonly [EntityId, RegExp][] = [
  ["jeju", /제주|서귀포/],
  ["busan", /부산|해운대|광안|영도|사하|부산진/],
  ["gyeongju", /경주|경상북도\s*경주/],
  ["gangwon", /강원|강릉|속초|평창|춘천|동해|양양/],
  ["jeonnam", /전남|전라남도|여수|순천|목포|담양/],
];

function firstString(values: readonly unknown[], fallback = "") {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getContentTypeLabel(contentTypeId?: number, label?: string | null) {
  return firstString([label, contentTypeId ? TOUR_CONTENT_TYPE_LABELS[contentTypeId] : undefined], "관광지");
}

function contentTypeIdForCategory(category?: string) {
  const normalized = category?.trim();
  if (!normalized || normalized === "all") return undefined;
  return CATEGORY_TO_CONTENT_TYPE_ID.get(normalized);
}

function areaCodeForRegion(regionId?: EntityId | "all") {
  if (!regionId || regionId === "all") return undefined;
  return REGION_TO_AREA_CODE[regionId];
}

function buildTourSearchPath(params: BackendPlaceSearchParams) {
  const query = new URLSearchParams();
  const keyword = params.keyword?.trim();
  const areaCode = areaCodeForRegion(params.regionId);
  const contentTypeId = contentTypeIdForCategory(params.category);

  if (keyword) query.set("keyword", keyword);
  if (areaCode) query.set("areaCode", areaCode);
  if (contentTypeId) query.set("contentTypeId", String(contentTypeId));
  query.set("page", String(params.page ?? 1));
  query.set("size", String(params.limit ?? 50));

  const endpoint = keyword ? "/tour/places/search" : "/tour/places";
  return `${endpoint}?${query.toString()}`;
}

function tourDateToDateOnly(value?: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function dateOnlyToTourDate(value?: string) {
  if (!value) return undefined;
  if (/^\d{8}$/.test(value)) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, "") : undefined;
}

function todayDateOnly() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatEventDateTag(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const format = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
  if (startDate && endDate && startDate !== endDate) return `${format(startDate)}~${format(endDate)}`;
  return format(startDate ?? endDate!);
}

function buildTourFestivalPath(params: BackendPlaceSearchParams) {
  const query = new URLSearchParams();
  const areaCode = areaCodeForRegion(params.regionId);
  const eventStartDate = dateOnlyToTourDate(params.eventStartDate) ?? dateOnlyToTourDate(todayDateOnly());
  const eventEndDate = dateOnlyToTourDate(params.eventEndDate);

  if (eventStartDate) query.set("eventStartDate", eventStartDate);
  if (eventEndDate) query.set("eventEndDate", eventEndDate);
  if (areaCode) query.set("areaCode", areaCode);
  query.set("page", String(params.page ?? 1));
  query.set("size", String(params.limit ?? 50));

  return `/tour/festivals?${query.toString()}`;
}

function inferRegionId(place: TourPlace): EntityId {
  const source = `${place.address ?? ""} ${place.name ?? ""}`;
  const matched = regionPatterns.find(([, pattern]) => pattern.test(source))?.[0];
  if (matched) return matched;

  const areaCode = firstString([place.areaCode]);
  const mapped = AREA_CODE_TO_REGION[areaCode];
  return mapped ?? "backend";
}

function formatDistanceLabel(place: TourPlace) {
  const distanceMeters = asNumber(place.distanceMeters);
  if (distanceMeters !== undefined) {
    return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)}km` : `${Math.round(distanceMeters)}m`;
  }

  return "";
}

export function mapTourPlaceToPlace(place: TourPlace): Place | null {
  const id = firstString([place.id]);
  const name = firstString([place.name]);
  if (!id || !name) return null;

  const category = getContentTypeLabel(place.contentTypeId, place.contentTypeLabel);
  const overview = firstString([place.overview]);
  const latitude = asNumber(place.latitude);
  const longitude = asNumber(place.longitude);
  const eventStartDate = tourDateToDateOnly(place.eventStartDate);
  const eventEndDate = tourDateToDateOnly(place.eventEndDate);
  const eventDateTag = formatEventDateTag(eventStartDate, eventEndDate);
  const image = firstString([
    place.thumbnailUrl,
    place.images?.[0]?.thumbnailUrl,
    place.images?.[0]?.url,
  ]);

  return {
    id,
    regionId: inferRegionId(place),
    name,
    category,
    tags: eventDateTag ? [eventDateTag] : [],
    distanceLabel: formatDistanceLabel(place),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(eventStartDate ? { eventStartDate } : {}),
    ...(eventEndDate ? { eventEndDate } : {}),
    imageUrl: image,
    address: firstString([place.address], "주소 정보 없음"),
    summary: overview ? stripHtml(overview) : "",
  };
}

export async function searchBackendPlaces(params: BackendPlaceSearchParams = {}) {
  return (await searchBackendPlacePage(params)).places;
}

export async function searchBackendPlacePage(params: BackendPlaceSearchParams = {}): Promise<BackendPlacePageResult> {
  const page = await apiClient.request<TourPlacePage>({
    path: buildTourSearchPath(params),
    signal: params.signal,
  });
  const places = Array.isArray(page.data) ? page.data.flatMap((place) => {
    const mapped = mapTourPlaceToPlace(place);
    return mapped ? [mapped] : [];
  }) : [];
  const requestedPage = params.page ?? 1;
  const requestedSize = params.limit ?? 50;
  const currentPage = asNumber(page.meta?.page) ?? requestedPage;
  const size = asNumber(page.meta?.size) ?? requestedSize;
  const total = asNumber(page.meta?.total);
  const hasNextPage = total !== undefined ? currentPage * size < total : places.length >= requestedSize;

  return {
    places,
    page: currentPage,
    size,
    ...(total !== undefined ? { total } : {}),
    hasNextPage,
  };
}

export async function searchBackendFestivalPage(params: BackendPlaceSearchParams = {}): Promise<BackendPlacePageResult> {
  const page = await apiClient.request<TourPlacePage>({
    path: buildTourFestivalPath(params),
    signal: params.signal,
  });
  const places = Array.isArray(page.data) ? page.data.flatMap((place) => {
    const mapped = mapTourPlaceToPlace(place);
    return mapped ? [mapped] : [];
  }) : [];
  const requestedPage = params.page ?? 1;
  const requestedSize = params.limit ?? 50;
  const currentPage = asNumber(page.meta?.page) ?? requestedPage;
  const size = asNumber(page.meta?.size) ?? requestedSize;
  const total = asNumber(page.meta?.total);
  const hasNextPage = total !== undefined ? currentPage * size < total : places.length >= requestedSize;

  return {
    places,
    page: currentPage,
    size,
    ...(total !== undefined ? { total } : {}),
    hasNextPage,
  };
}

export async function getBackendPlace(placeId: EntityId, signal?: AbortSignal) {
  const place = await apiClient.request<TourPlace>({
    path: `/tour/places/${encodeURIComponent(placeId)}`,
    signal,
  });
  return mapTourPlaceToPlace(place);
}
