import type { EntityId, Place, PlaceClassification, PlaceInfoItem } from "../../../domain";
import { environment } from "../../../config/environment";
import { createApiClient } from "../../../services/apiClient";
import type { PlaceClassificationSelection, PlaceClassificationTreeItem } from "../logic/placeClassification";
import { buildPlaceClassificationTags, getLargeClassificationLabel } from "../logic/placeClassification";

type TourPlaceImage = {
  url?: string;
  thumbnailUrl?: string;
  name?: string;
};

type TourPlace = {
  id?: string;
  source?: "tour" | "TOUR_API";
  placeId?: string | null;
  externalId?: string;
  contentTypeId?: number;
  contentTypeLabel?: string | null;
  lclsSystm1?: string | null;
  lclsSystm1Name?: string | null;
  lclsSystm2?: string | null;
  lclsSystm2Name?: string | null;
  lclsSystm3?: string | null;
  lclsSystm3Name?: string | null;
  name?: string;
  address?: string | null;
  thumbnailUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  distanceMeters?: number | string;
  overview?: string | null;
  tel?: string | null;
  homepage?: string | null;
  intro?: Record<string, unknown> | null;
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
  classification?: PlaceClassificationSelection;
  lclsSystm1?: string;
  lclsSystm2?: string;
  lclsSystm3?: string;
  regionId?: EntityId | "all";
  areaCode?: string;
  sigunguCode?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
};

export type BackendRegionCode = {
  code: string;
  name: string;
};

export type BackendRegionCodeTree = {
  code: string;
  name: string;
  sigungu: BackendRegionCode[];
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

function normalizeTourImageUrl(value: string) {
  return value.replace(/^http:\/\/tong\.visitkorea\.or\.kr(?=\/)/i, "https://tong.visitkorea.or.kr");
}

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
  "35": "gyeongbuk",
  "36": "gyeongnam",
  "37": "jeonbuk",
  "38": "jeonnam",
  "39": "jeju",
};

const regionPatterns: readonly [EntityId, RegExp][] = [
  ["seoul", /서울|강남|강북|강서|강동|관악|광진|구로|금천|노원|도봉|동대문|동작|마포|서대문|서초|성동|성북|송파|양천|영등포|용산|은평|종로|중랑/],
  ["incheon", /인천|강화|옹진|계양|남동|미추홀|부평|연수/],
  ["daejeon", /대전|유성|대덕/],
  ["daegu", /대구|달서|달성|수성/],
  ["gwangju", /광주광역시|광산/],
  ["busan", /부산|해운대|광안|영도|사하|부산진/],
  ["ulsan", /울산|울주/],
  ["sejong", /세종/],
  ["gyeonggi", /경기|경기도|수원|고양|용인|성남|부천|화성|남양주|안산|안양|평택|시흥|파주|김포|의정부|광주시|광명|군포|하남|오산|양주|이천|구리|안성|포천|의왕|양평|여주|동두천|과천|가평|연천/],
  ["chungbuk", /충북|충청북도|청주|충주|제천|보은|옥천|영동|증평|진천|괴산|음성|단양/],
  ["chungnam", /충남|충청남도|천안|공주|보령|아산|서산|논산|계룡|당진|금산|부여|서천|청양|홍성|예산|태안/],
  ["jeonbuk", /전북|전라북도|전북특별자치도|전주|군산|익산|정읍|남원|김제|완주|진안|무주|장수|임실|순창|고창|부안/],
  ["gyeongnam", /경남|경상남도|창원|진주|통영|사천|김해|밀양|거제|양산|의령|함안|창녕|고성|남해|하동|산청|함양|거창|합천/],
  ["jeju", /제주|서귀포/],
  ["gyeongbuk", /경북|경상북도|포항|경주|김천|안동|구미|영주|영천|상주|문경|경산|군위|의성|청송|영양|영덕|청도|고령|성주|칠곡|예천|봉화|울진|울릉/],
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
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function getContentTypeLabel(contentTypeId?: number, label?: string | null) {
  return firstString([label, contentTypeId ? TOUR_CONTENT_TYPE_LABELS[contentTypeId] : undefined], "관광지");
}

function contentTypeIdForCategory(category?: string) {
  const normalized = category?.trim();
  if (!normalized || normalized === "all") return undefined;
  return CATEGORY_TO_CONTENT_TYPE_ID.get(normalized);
}

function appendClassificationParams(query: URLSearchParams, params: Pick<BackendPlaceSearchParams, "classification" | "lclsSystm1" | "lclsSystm2" | "lclsSystm3">) {
  const lclsSystm1 = params.lclsSystm1 ?? params.classification?.lclsSystm1;
  const lclsSystm2 = params.lclsSystm2 ?? params.classification?.lclsSystm2;
  const lclsSystm3 = params.lclsSystm3 ?? params.classification?.lclsSystm3;
  if (lclsSystm1) query.set("lclsSystm1", lclsSystm1);
  if (lclsSystm2) query.set("lclsSystm2", lclsSystm2);
  if (lclsSystm3) query.set("lclsSystm3", lclsSystm3);
}

function firstIntroString(intro: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!intro) return "";
  return firstString(keys.map((key) => intro[key])).replace(/\s*<br\s*\/?>\s*/gi, "\n");
}

const introInfoFields: readonly { label: string; keys: readonly string[]; tag?: string }[] = [
  { label: "문의", keys: ["infocenter", "infocenterculture", "infocenterleports", "infocenterfood", "infocentershopping", "infocenterlodging", "infocentertourcourse"] },
  { label: "휴무일", keys: ["restdate", "restdateculture", "restdateleports", "restdatefood", "restdateshopping"], tag: "휴무일 확인" },
  { label: "이용시간", keys: ["usetime", "usetimeculture", "usetimeleports", "opentime", "opentimefood", "opentimeparking", "opentimefestival"], tag: "운영시간 확인" },
  { label: "행사기간", keys: ["eventstartdate", "eventenddate"] },
  { label: "공연시간", keys: ["playtime"], tag: "운영시간 확인" },
  { label: "행사장소", keys: ["eventplace"] },
  { label: "입장료", keys: ["usefee", "usetimefestival", "usefeeleports"], tag: "요금 확인" },
  { label: "주차", keys: ["parking", "parkingculture", "parkingleports", "parkingfood", "parkingshopping", "parkinglodging"], tag: "주차 정보" },
  { label: "주차요금", keys: ["parkingfee"] },
  { label: "체크인", keys: ["checkintime"], tag: "운영시간 확인" },
  { label: "체크아웃", keys: ["checkouttime"], tag: "운영시간 확인" },
  { label: "예약", keys: ["reservation", "reservationfood", "reservationlodging", "bookingplace"] },
  { label: "대표 메뉴", keys: ["firstmenu", "treatmenu"], tag: "대표 메뉴" },
  { label: "판매 품목", keys: ["saleitem"] },
  { label: "장서는 날", keys: ["fairday"] },
  { label: "소요시간", keys: ["spendtime", "taketime"] },
  { label: "코스 거리", keys: ["distance"] },
];

function normalizeInfoValue(value: string) {
  return stripHtml(value).replace(/\n[ \t]+/g, "\n").trim();
}

function buildTourPlaceInfoItems(place: TourPlace): PlaceInfoItem[] {
  const intro = place.intro ?? undefined;
  const items = introInfoFields.flatMap((field) => {
    const value = normalizeInfoValue(firstIntroString(intro, field.keys));
    if (!value || value === "0") return [];
    if (/^(없음|없다|미제공|문의)$/i.test(value)) return [];
    return [{ label: field.label, value, ...(field.tag ? { tag: field.tag } : {}) }];
  });
  const tel = normalizeInfoValue(firstString([place.tel]));
  const homepage = normalizeInfoValue(firstString([place.homepage]));
  const extras: PlaceInfoItem[] = [
    ...(tel && !items.some((item) => item.label === "문의") ? [{ label: "문의", value: tel }] : []),
    ...(homepage ? [{ label: "홈페이지", value: homepage }] : []),
  ];
  return [...items, ...extras].slice(0, 12);
}

function buildPracticalInfoTags(infoItems: readonly PlaceInfoItem[]) {
  const tags = new Set<string>();
  infoItems.forEach((item) => {
    if (item.tag) tags.add(item.tag);
    if (item.label === "주차" && !/(불가|없음|협소|미제공)/.test(item.value)) tags.add("주차 가능");
    if (["이용시간", "공연시간", "체크인", "체크아웃"].includes(item.label)) tags.add("운영시간 확인");
    if (item.label === "휴무일") tags.add("휴무일 확인");
  });
  return [...tags].slice(0, 4);
}

function buildTourPlaceClassification(place: TourPlace): PlaceClassification | undefined {
  const lclsSystm1 = firstString([place.lclsSystm1]);
  const lclsSystm2 = firstString([place.lclsSystm2]);
  const lclsSystm3 = firstString([place.lclsSystm3]);
  if (!lclsSystm1 && !lclsSystm2 && !lclsSystm3) return undefined;
  return {
    ...(lclsSystm1 ? { lclsSystm1, lclsSystm1Name: firstString([place.lclsSystm1Name], getLargeClassificationLabel(lclsSystm1)) } : {}),
    ...(lclsSystm2 ? { lclsSystm2, ...(firstString([place.lclsSystm2Name]) ? { lclsSystm2Name: firstString([place.lclsSystm2Name]) } : {}) } : {}),
    ...(lclsSystm3 ? { lclsSystm3, ...(firstString([place.lclsSystm3Name]) ? { lclsSystm3Name: firstString([place.lclsSystm3Name]) } : {}) } : {}),
  };
}

function areaCodeForRegion(regionId?: EntityId | "all") {
  if (!regionId || regionId === "all") return undefined;
  return REGION_TO_AREA_CODE[regionId];
}

export function resolveAreaCodeForRegion(regionId?: EntityId | "all") {
  return areaCodeForRegion(regionId);
}

export function resolveRegionIdForAreaCode(areaCode?: string | null) {
  if (!areaCode) return undefined;
  return AREA_CODE_TO_REGION[areaCode];
}

export function buildTourSearchPath(params: BackendPlaceSearchParams) {
  const query = new URLSearchParams();
  const keyword = params.keyword?.trim();
  const areaCode = params.areaCode ?? areaCodeForRegion(params.regionId);
  const contentTypeId = contentTypeIdForCategory(params.category);

  if (keyword) query.set("keyword", keyword);
  if (areaCode) query.set("areaCode", areaCode);
  if (params.sigunguCode) query.set("sigunguCode", params.sigunguCode);
  if (contentTypeId) query.set("contentTypeId", String(contentTypeId));
  appendClassificationParams(query, params);
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
  const areaCode = params.areaCode ?? areaCodeForRegion(params.regionId);
  const eventStartDate = dateOnlyToTourDate(params.eventStartDate) ?? dateOnlyToTourDate(todayDateOnly());
  const eventEndDate = dateOnlyToTourDate(params.eventEndDate);

  if (eventStartDate) query.set("eventStartDate", eventStartDate);
  if (eventEndDate) query.set("eventEndDate", eventEndDate);
  if (areaCode) query.set("areaCode", areaCode);
  if (params.sigunguCode) query.set("sigunguCode", params.sigunguCode);
  appendClassificationParams(query, params);
  query.set("page", String(params.page ?? 1));
  query.set("size", String(params.limit ?? 50));

  return `/tour/festivals?${query.toString()}`;
}

function inferRegionId(place: TourPlace): EntityId {
  const areaCode = firstString([place.areaCode]);
  const mapped = resolveRegionIdForAreaCode(areaCode);
  if (mapped) return mapped;

  const source = `${place.address ?? ""} ${place.name ?? ""}`;
  const matched = regionPatterns.find(([, pattern]) => pattern.test(source))?.[0];
  if (matched) return matched;

  return "backend";
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
  const latitude = asNumber(place.latitude) ?? asNumber(place.lat);
  const longitude = asNumber(place.longitude) ?? asNumber(place.lng);
  const eventStartDate = tourDateToDateOnly(place.eventStartDate);
  const eventEndDate = tourDateToDateOnly(place.eventEndDate);
  const eventDateTag = formatEventDateTag(eventStartDate, eventEndDate);
  const classification = buildTourPlaceClassification(place);
  const infoItems = buildTourPlaceInfoItems(place);
  const classificationTags = classification ? buildPlaceClassificationTags({ classification }) : [];
  const practicalTags = buildPracticalInfoTags(infoItems);
  const rawImage = firstString([
    place.thumbnailUrl,
    place.images?.[0]?.thumbnailUrl,
    place.images?.[0]?.url,
  ]);
  const image = rawImage ? normalizeTourImageUrl(rawImage) : "";

  return {
    id,
    regionId: inferRegionId(place),
    name,
    category,
    ...(place.contentTypeId ? { contentTypeId: place.contentTypeId } : {}),
    ...(classification ? { classification } : {}),
    ...(infoItems.length ? { infoItems } : {}),
    tags: [...new Set([...(eventDateTag ? [eventDateTag] : []), ...classificationTags, ...practicalTags])],
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

export async function fetchBackendRegionCodes(signal?: AbortSignal) {
  return apiClient.request<BackendRegionCode[]>({
    path: "/tour/meta/ldong-codes?size=1000",
    signal,
  });
}

export async function fetchBackendRegionCodeTree(signal?: AbortSignal) {
  // The current Backend exposes legal-district codes (`ldong-codes`), not a
  // TourAPI areaCode/sigunguCode tree. Treating those different code systems
  // as interchangeable would send wrong region filters. Explore already has
  // the verified TourAPI province mapping and safely falls back to it when the
  // remote tree is empty.
  if (signal?.aborted) throw signal.reason ?? new Error("지역 코드 요청이 취소됐어요.");
  return [] satisfies BackendRegionCodeTree[];
}

export async function fetchBackendCategoryCodeTree(signal?: AbortSignal) {
  const largeCodes = await apiClient.request<BackendRegionCode[]>({
    path: "/tour/meta/category-codes?size=1000",
    signal,
  });
  const tree: PlaceClassificationTreeItem[] = [];
  // Keep provider pressure bounded while collecting the second level. The
  // current Backend has no aggregate tree endpoint and no leaf-on-demand UI.
  for (let offset = 0; offset < largeCodes.length; offset += 4) {
    const group = largeCodes.slice(offset, offset + 4);
    const middleGroups = await Promise.all(group.map(async (large) => {
      const params = new URLSearchParams({ lclsSystm1: large.code, size: "1000" });
      const middleCodes = await apiClient.request<BackendRegionCode[]>({
        path: `/tour/meta/category-codes?${params.toString()}`,
        signal,
      });
      return {
        code: large.code,
        name: large.name,
        children: middleCodes.map((middle) => ({
          code: middle.code,
          name: middle.name,
          children: [],
        })),
      } satisfies PlaceClassificationTreeItem;
    }));
    tree.push(...middleGroups);
  }
  return tree;
}

export async function suggestBackendRegions(keyword: string, size = 10, signal?: AbortSignal) {
  const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
  const codes = await fetchBackendRegionCodes(signal);
  return codes
    .filter((region) => !normalized || `${region.name} ${region.code}`.toLocaleLowerCase("ko-KR").includes(normalized))
    .slice(0, Math.max(0, size));
}

export async function searchBackendRegionPlacePage(
  region: string,
  params: BackendPlaceSearchParams = {},
): Promise<BackendPlacePageResult> {
  const areaCode = /^\d+$/.test(region.trim())
    ? region.trim()
    : resolveAreaCodeForRegion(region.trim());
  return searchBackendPlacePage({
    ...params,
    ...(areaCode ? { areaCode } : { regionId: region.trim() }),
  });
}

export async function getBackendPlace(placeId: EntityId, signal?: AbortSignal) {
  const normalizedId = placeId.trim();
  const tourContentId = normalizedId.match(/^tour:(\d+)$/)?.[1]
    ?? (/^\d+$/.test(normalizedId) ? normalizedId : undefined);
  const path = tourContentId
    ? `/tour/places/${encodeURIComponent(tourContentId)}`
    : `/places/${encodeURIComponent(normalizedId)}`;
  const place = await apiClient.request<TourPlace>({
    path,
    signal,
  });
  return mapTourPlaceToPlace(place);
}
