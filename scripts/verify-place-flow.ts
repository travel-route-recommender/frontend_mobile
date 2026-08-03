import type { ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../src/domain";
import {
  buildExploreListHref,
  buildExploreMapHref,
  buildPlaceDetailHref,
  buildTripExploreHref,
  buildTripExploreReturnHref,
  resolveTripExploreContext,
} from "../src/features/explore/logic/exploreNavigation";
import {
  createMapSheetSnapPoints,
  projectMapSheetHeight,
  resolveMapSheetPosition,
} from "../src/features/explore/logic/mapSheetLayout";
import { canAddPlaceCandidate, canSavePlace } from "../src/features/places/logic/placeCapabilities";
import { buildPlaceLocationOptions, getPlaceLocationDisplayLabel, getPlaceLocationValue, getPlaceProvinceSortOrder } from "../src/features/places/logic/placeFilterOptions";
import { enrichPlaceClassificationTags } from "../src/features/places/logic/placeClassification";
import { dedupePlacesForDisplay, filterPlaces, findSimilarPlaces, getPlaceDistanceProximityLabel, normalizeSearchKeyword, parsePlaceCoordinate, searchPlaces } from "../src/features/places/logic/placeSearch";
import { buildPlaceCardViewModel, selectCandidateStateForPlace, selectResolvedSavedPlaces } from "../src/features/places/selectors/placeSelectors";
import { toggleUniqueId } from "../src/utils/entityRelations";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const users: Record<string, User> = { owner: { id: "owner", name: "수민", initial: "수" }, outsider: { id: "outsider", name: "다른 사람", initial: "다" } };
const regions: Record<string, Region> = {
  busan: { id: "busan", name: "부산", shortName: "부산", description: "바다", spots: 2, weather: "맑음", imageUrl: "busan" },
  jeju: { id: "jeju", name: "제주도", shortName: "제주", description: "오름", spots: 1, weather: "맑음", imageUrl: "jeju" },
};
const places: Place[] = [
  { id: "cafe", regionId: "busan", name: "바다 카페", category: "카페", tags: ["바다", "여유"], rating: 4.8, distanceLabel: "1km", imageUrl: "cafe", address: "부산 수영구 해변로", summary: "바다를 보는 카페" },
  { id: "market", regionId: "busan", name: "국제시장", category: "시장", tags: ["로컬", "맛집"], rating: 4.7, distanceLabel: "2km", imageUrl: "market", address: "부산 중구", summary: "지역 먹거리" },
  { id: "oreum", regionId: "jeju", name: "새별오름", category: "자연", tags: ["산책", "풍경"], rating: 4.9, distanceLabel: "5km", imageUrl: "oreum", address: "제주 제주시", summary: "걷기 좋은 오름" },
];
const gyeongjuRegion: Region = { id: "gyeongju", name: "경주", shortName: "경주", description: "유적", spots: 1, weather: "맑음", imageUrl: "gyeongju" };
const gyeongjuPlace: Place = { id: "gyeongju-place", regionId: "gyeongju", name: "경주 보문호", category: "관광지", tags: ["역사"], rating: 4.8, distanceLabel: "3km", imageUrl: "gyeongju-place", address: "경상북도 경주시 보문로", summary: "경주 여행지" };
const trip = (id: string, member = "owner", status: TripRoom["status"] = "planning"): TripRoom => ({ id, title: id, regionId: "busan", startDate: "2026-08-01", endDate: "2026-08-02", status, transport: "public", budgetLevel: "standard", intensity: "balanced", members: [{ userId: member, role: "owner" }] });
const candidate: TripCandidate = { tripId: "trip-a", placeId: "cafe", addedByUserIds: ["owner"], recommendedByDuri: false };
const itinerary: ItineraryItem = { id: "schedule", tripId: "trip-a", placeId: "cafe", date: "2026-08-01", startTime: "10:00", durationMinutes: 60, itemType: "place", preferredByUserIds: ["owner"] };

assert(normalizeSearchKeyword("  바다   카페  ") === "바다 카페", "1. 검색어 공백을 정규화해야 한다");
assert(filterPlaces(places, { keyword: "바다 카페", regionId: "all", category: "all" }, regions).map((place) => place.id).join() === "cafe", "2. 장소명 검색이 동작해야 한다");
assert(filterPlaces(places, { keyword: "수영구", regionId: "all", category: "all" }, regions)[0]?.id === "cafe", "3. 주소 검색이 동작해야 한다");
assert(filterPlaces(places, { keyword: "풍경", regionId: "all", category: "all" }, regions)[0]?.id === "oreum", "4. tag 검색이 동작해야 한다");
assert(filterPlaces(places, { keyword: "", regionId: "jeju", category: "all" }, regions).length === 1, "5. regionId 필터가 동작해야 한다");
assert(filterPlaces(places, { keyword: "", regionId: "all", locations: [
  { value: "busan::all", label: "부산", regionId: "busan", district: "all" },
  { value: "jeju::all", label: "제주", regionId: "jeju", district: "all" },
], category: "all" }, regions).map((place) => place.id).join() === "cafe,market,oreum", "다중 지역 필터는 선택 지역들의 합집합으로 동작해야 한다");
assert(filterPlaces(places, { keyword: "", regionId: "all", category: "카페" }, regions).length === 1, "6. 실제 category 필터가 동작해야 한다");
assert(filterPlaces(places, { keyword: "없는 장소", regionId: "all", category: "all" }, regions).length === 0, "7. 검색 결과 없음이 빈 배열이어야 한다");
assert(filterPlaces(places, { keyword: "", regionId: "invalid", category: "all" }, regions).length === 3, "8. 잘못된 regionId는 전체로 fallback해야 한다");
const eventUnionPlaces: Place[] = [
  { ...places[0], id: "museum", name: "부산 문화관", category: "문화시설" },
  { ...places[1], id: "old-festival", name: "지난 축제", category: "행사/공연/축제", eventStartDate: "2026-07-01", eventEndDate: "2026-07-02" },
  { ...places[2], id: "current-festival", name: "현재 축제", category: "행사/공연/축제", eventStartDate: "2026-08-01", eventEndDate: "2026-08-02" },
];
assert(filterPlaces(eventUnionPlaces, { keyword: "", regionId: "all", category: "all", categories: ["문화시설", "행사/공연/축제"], eventStartDate: "2026-08-01", eventEndDate: "2026-08-02" }, regions).map((place) => place.id).join() === "museum,current-festival", "행사일정 필터는 행사 카테고리에만 적용하고 다른 카테고리 합집합을 유지해야 한다");
const classifiedPlaces: Place[] = [
  { ...places[0], id: "forest", name: "숲 산책길", classification: { lclsSystm1: "NA", lclsSystm2: "NA02", lclsSystm3: "NA020400" } },
  { ...places[1], id: "history", name: "근대 역사관", classification: { lclsSystm1: "HS", lclsSystm2: "HS01", lclsSystm3: "HS010100" } },
];
assert(filterPlaces(classifiedPlaces, { keyword: "", regionId: "all", category: "all", classification: { value: "NA::::", label: "자연관광", level: "large", lclsSystm1: "NA" } }, regions).map((place) => place.id).join() === "forest", "상세 테마 대분류 필터가 동작해야 한다");
assert(filterPlaces(classifiedPlaces, { keyword: "", regionId: "all", category: "all", classification: { value: "NA::NA02::NA020400", label: "자연관광 · 자연생태 · 숲", level: "small", lclsSystm1: "NA", lclsSystm2: "NA02", lclsSystm3: "NA020400" } }, regions).map((place) => place.id).join() === "forest", "상세 테마 소분류 필터가 동작해야 한다");
assert(filterPlaces(classifiedPlaces, { keyword: "", regionId: "all", category: "all", classifications: [
  { value: "NA::::", label: "자연관광", level: "large", lclsSystm1: "NA" },
  { value: "HS::HS01::HS010100", label: "역사관광 · 역사문화유산 · 역사관광지", level: "small", lclsSystm1: "HS", lclsSystm2: "HS01", lclsSystm3: "HS010100" },
] }, regions).map((place) => place.id).join() === "forest,history", "상세 테마 다중 필터는 합집합으로 동작해야 한다");
assert(enrichPlaceClassificationTags(classifiedPlaces[0], { NA: "자연관광", NA02: "자연생태", NA020400: "숲" }).tags.slice(0, 3).join() === "자연관광,자연생태,숲", "분류 코드 태그는 메타 이름으로 보강되어야 한다");
assert(dedupePlacesForDisplay([places[0], { ...places[0], id: "cafe-copy" }, places[1], places[0]]).map((place) => place.id).join() === "cafe,market", "페이지 병합 시 장소 중복을 제거해야 한다");
assert([
  getPlaceLocationDisplayLabel({ regionId: "gyeongnam", district: "all", label: "경남 전체" }),
  getPlaceLocationDisplayLabel({ regionId: "gyeongnam", district: "구미시", label: "경상남도 구미시" }),
  getPlaceLocationDisplayLabel({ regionId: "seoul", district: "강남구", label: "서울시 강남구" }),
].join("|") === "경상남도|경남 구미|서울 강남구", "지역 표시 라벨은 전체/시군구 문맥에 맞게 축약해야 한다");
assert([
  getPlaceProvinceSortOrder({ regionId: "seoul", district: "all" }),
  getPlaceProvinceSortOrder({ regionId: "gyeonggi", district: "all" }),
  getPlaceProvinceSortOrder({ regionId: "jeju", district: "all" }),
  getPlaceProvinceSortOrder({ regionId: "busan", district: "all" }),
  getPlaceProvinceSortOrder({ regionId: "sejong", district: "all" }),
].join() === "0,10,30,40,60", "지역 시트 왼쪽 목록은 서울, 팔도, 제주, 광역, 특별자치권역 순서여야 한다");
const locationOptions = buildPlaceLocationOptions({ ...regions, gyeongju: gyeongjuRegion }, [gyeongjuPlace], []);
assert(!locationOptions.some((option) => option.level === "province" && option.regionId === "gyeongju"), "경주는 왼쪽 시도 목록에 province로 노출하지 않아야 한다");
assert(locationOptions.some((option) => option.value === getPlaceLocationValue("gyeongbuk", "경주시") && option.description === "경북 경주시"), "경주는 경북 경주시 district 옵션으로 노출해야 한다");
assert(filterPlaces([gyeongjuPlace], { keyword: "", regionId: "gyeongbuk", district: "경주시", category: "all" }, { ...regions, gyeongju: gyeongjuRegion })[0]?.id === "gyeongju-place", "경북 경주시 필터는 경주 regionId 장소도 포함해야 한다");

assert(toggleUniqueId([], "cafe").join() === "cafe", "9. 저장 ID를 추가해야 한다");
assert(toggleUniqueId(["cafe"], "cafe").length === 0, "10. 저장 ID를 해제해야 한다");
assert(toggleUniqueId(["market", "market"], "cafe").join() === "market,cafe", "11. 저장 관계 중복을 정규화해야 한다");

const baseState = { currentUserId: "owner", activeTripId: "trip-a", usersById: users, placesById: Object.fromEntries(places.map((place) => [place.id, place])), regionsById: regions, tripsById: { "trip-a": trip("trip-a"), "trip-b": trip("trip-b") }, tripOrder: ["trip-a", "trip-b"], savedPlaceIdsByUserId: { owner: ["cafe", "missing"] }, candidatesByTripId: { "trip-a": [] }, itineraryByTripId: { "trip-a": [] } };
const resolved = selectResolvedSavedPlaces(baseState);
assert(resolved.places.length === 1 && resolved.missingIds[0] === "missing", "12. 누락 Place를 분리하고 관계를 보존해야 한다");
const seoulPlaceWithoutRegionDictionary: Place = { ...places[0], id: "seoul-park", regionId: "backend", name: "서울창포원", category: "관광지", address: "서울특별시 도봉구 마들로 916", summary: "서울 공원" };
assert(buildPlaceCardViewModel({ ...baseState, placesById: { ...baseState.placesById, [seoulPlaceWithoutRegionDictionary.id]: seoulPlaceWithoutRegionDictionary } }, "seoul-park")?.regionName === "서울특별시", "상세 장소 regionId가 사전에 없어도 주소 기반 지역명을 표시해야 한다");

assert(canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("trip-a"), place: places[0], candidates: [], itinerary: [] }).allowed, "13. member는 참여 여행방 후보를 추가할 수 있어야 한다");
assert(!canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("trip-a"), place: places[0], candidates: [candidate], itinerary: [] }).allowed, "14. 같은 여행방 중복 후보를 막아야 한다");
assert(canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("trip-b"), place: places[0], candidates: [], itinerary: [] }).allowed, "15. 다른 여행방에는 같은 장소를 추가할 수 있어야 한다");
assert(!canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("trip-a"), place: places[0], candidates: [], itinerary: [itinerary] }).allowed, "16. 일정 배치 장소의 중복 후보를 막아야 한다");
assert(!canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("trip-a", "outsider"), place: places[0], candidates: [], itinerary: [] }).allowed, "17. 비멤버 후보 추가를 막아야 한다");
assert(!canAddPlaceCandidate({ sessionKind: "member", currentUserId: "owner", trip: trip("done", "owner", "completed"), place: places[0], candidates: [], itinerary: [] }).allowed, "18. 완료 여행 후보 추가를 막아야 한다");
assert(!canSavePlace("anonymous", undefined, places[0]).allowed && !canAddPlaceCandidate({ sessionKind: "anonymous", currentUserId: "", trip: trip("trip-a"), place: places[0], candidates: [], itinerary: [] }).allowed, "19. anonymous 저장·후보 추가를 막아야 한다");
assert(!canSavePlace("guest", users.owner, places[0]).allowed && canAddPlaceCandidate({ sessionKind: "guest", currentUserId: "owner", trip: trip("trip-a"), place: places[0], candidates: [], itinerary: [] }).allowed, "20. guest는 개인 저장 없이 참여 여행방 후보 추가가 가능해야 한다");

assert(parsePlaceCoordinate({ latitude: "35.1", longitude: "129.1" })?.latitude === 35.1 && parsePlaceCoordinate({ latitude: 0, longitude: 0 }) === undefined && parsePlaceCoordinate({ latitude: 91, longitude: 0 }) === undefined, "21. 좌표 범위와 0,0을 검증해야 한다");
assert(getPlaceDistanceProximityLabel({ ...places[1], latitude: 35.012, longitude: 129 }, { ...places[0], latitude: 35, longitude: 129 }) === "3km 이내", "거리순 카드에는 구간형 거리만 표시해야 한다");
const similar = findSimilarPlaces({ place: places[0], places, limit: 3 });
assert(!similar.some((place) => place.id === "cafe") && similar[0]?.id === "market", "22. 유사 장소는 현재 장소를 제외하고 같은 지역을 우선해야 한다");
assert(buildPlaceCardViewModel(baseState, "invalid") === null, "23. 잘못된 placeId ViewModel은 null이어야 한다");

assert(searchPlaces(places, { keyword: "", regionId: "all", category: "all", sort: "name" }, regions, new Set()).map((place) => place.id).join() === "market,cafe,oreum", "이름순은 결정적이어야 한다");
assert(searchPlaces(places, { keyword: "", regionId: "all", category: "all", sort: "saved-first" }, regions, new Set(["market"]))[0]?.id === "market", "저장 우선 정렬이 동작해야 한다");
assert(selectCandidateStateForPlace({ candidatesByTripId: { "trip-a": [candidate] }, itineraryByTripId: { "trip-a": [itinerary] } }, "trip-a", "cafe") === "scheduled", "일정 관계가 candidate보다 우선해야 한다");

assert(resolveTripExploreContext(undefined, undefined) === undefined, "24. 하단 탐색은 여행방 복귀 문맥을 만들지 않아야 한다");
const roomExplore = resolveTripExploreContext("trip-a", "room");
const workspaceExplore = resolveTripExploreContext(["trip-a"], ["workspace"]);
assert(roomExplore?.origin === "room" && workspaceExplore?.origin === "workspace", "25. 여행방과 워크스페이스 탐색 출처를 구분해야 한다");
assert(roomExplore && buildTripExploreHref(roomExplore).pathname === "/trips/[tripId]/explore", "26. 여행방 전용 탐색 route를 사용해야 한다");
assert(roomExplore && buildTripExploreReturnHref(roomExplore).pathname === "/trips/[tripId]", "27. 여행방 탐색은 여행방 홈으로 복귀해야 한다");
assert(workspaceExplore && buildTripExploreReturnHref(workspaceExplore).pathname === "/trips/[tripId]/workspace", "28. 워크스페이스 탐색은 일정표로 복귀해야 한다");
assert(buildExploreListHref() === "/(tabs)/explore" && roomExplore && typeof buildExploreListHref(roomExplore) === "object", "29. 하단 탐색과 여행방 탐색 목록 route를 분리해야 한다");
assert(roomExplore && typeof buildExploreMapHref(roomExplore) === "object" && buildPlaceDetailHref("cafe", roomExplore).params.origin === "room", "30. 지도와 장소 상세에 여행방 문맥을 전달해야 한다");

const mapSnapPoints = createMapSheetSnapPoints(720, 160);
assert(
  Object.values(mapSnapPoints).join() === "112,360,560",
  "31. 지도 시트 스냅 지점은 실제 지도 컨테이너 높이에서 계산해야 한다",
);
assert(
  resolveMapSheetPosition(projectMapSheetHeight(360, -120, -1000, mapSnapPoints), mapSnapPoints) === "expanded",
  "32. 위쪽 플릭은 이동 거리와 속도를 함께 반영해 확장 상태로 스냅해야 한다",
);
assert(
  resolveMapSheetPosition(projectMapSheetHeight(360, 150, 900, mapSnapPoints), mapSnapPoints) === "collapsed",
  "33. 아래쪽 플릭은 접힌 상태로 스냅해야 한다",
);

console.log("Place flow verification passed: search, region, classification, sorting, scheduled, and alias assertions");
