import type { ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../src/domain";
import { createDemoData } from "../src/data/mock/demoData";
import { canEditTripWorkspace } from "../src/features/workspace/logic/workspaceCapabilities";
import {
  addDaysToDate,
  buildTripDateRange,
  doTimeRangesOverlap,
  moveItemToDate,
  moveItemToIndexWithinDate,
  moveItemWithinDate,
  normalizeItineraryOrder,
  parseTimeToMinutes,
  validateTimeRange,
} from "../src/features/workspace/logic/workspaceDateTime";
import {
  buildCandidatePlaceViewModels,
  buildCandidateScheduleLookup,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
  selectCandidateScheduleState,
  selectItineraryItemsForDate,
} from "../src/features/workspace/selectors/workspaceSelectors";
import { validateCreateItineraryItem } from "../src/features/workspace/validation/workspaceValidation";
import { normalizePersistedState } from "../src/store/normalizePersistedState";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const users: Record<string, User> = {
  owner: { id: "owner", name: "수민", initial: "수" },
  guest: { id: "guest", name: "지윤", initial: "지" },
  outsider: { id: "outsider", name: "외부", initial: "외" },
};
const regions: Record<string, Region> = {
  busan: { id: "busan", name: "부산", shortName: "부산", description: "바다", spots: 3, weather: "맑음", imageUrl: "busan" },
};
const places: Record<string, Place> = {
  cafe: { id: "cafe", regionId: "busan", name: "바다 카페", category: "카페", tags: ["바다"], rating: 4.8, distanceLabel: "1km", imageUrl: "cafe", address: "부산 수영구", summary: "바다 카페" },
  market: { id: "market", regionId: "busan", name: "시장", category: "시장", tags: ["로컬"], rating: 4.6, distanceLabel: "2km", imageUrl: "market", address: "부산 중구", summary: "시장" },
};
const trip = (status: TripRoom["status"] = "drafting"): TripRoom => ({
  id: "trip",
  title: "부산 여행",
  regionId: "busan",
  startDate: "2026-07-18",
  endDate: "2026-07-19",
  status,
  transport: "public",
  budgetLevel: "standard",
  intensity: "balanced",
  members: [{ userId: "owner", role: "owner" }, { userId: "guest", role: "member" }],
});
const candidate = (placeId: string): TripCandidate => ({ tripId: "trip", placeId, addedByUserIds: ["owner"], recommendedByDuri: false });
const item = (id: string, placeId: string, date: string, startTime: string, durationMinutes = 60): ItineraryItem => ({ id, tripId: "trip", placeId, date, startTime, durationMinutes, itemType: "place", preferredByUserIds: ["owner"] });

const emptyState = {
  currentUserId: "owner",
  usersById: users,
  regionsById: regions,
  placesById: places,
  tripsById: { trip: trip() },
  candidatesByTripId: { trip: [] as TripCandidate[] },
  itineraryByTripId: { trip: [] as ItineraryItem[] },
};

assert(buildTripDateRange("2026-07-18", "2026-07-18").length === 1, "1. 당일치기 날짜 배열");
assert(buildTripDateRange("2026-07-18", "2026-07-19").map((date) => date.date).join() === "2026-07-18,2026-07-19", "2. 1박 2일 날짜 배열");
assert(buildTripDateRange("2026-01-31", "2026-02-01").map((date) => date.date).join() === "2026-01-31,2026-02-01", "3. 월 경계");
assert(buildTripDateRange("2026-12-31", "2027-01-01").map((date) => date.date).join() === "2026-12-31,2027-01-01", "4. 연도 경계");
assert(buildTripDateRange("2026-07-20", "2026-07-19").length === 0, "5. 잘못된 날짜 범위");

const emptyView = buildWorkspaceViewModel(emptyState, "trip", "", "member", "2026-01-01");
assert(emptyView?.candidateCount === 0, "6. 후보 0개");
assert(emptyView?.itineraryCount === 0, "7. 일정 0개");

const lookupNone = buildCandidateScheduleLookup([]);
assert(selectCandidateScheduleState(lookupNone, "cafe", "2026-07-18") === "unscheduled", "8. 후보 미배치");
const lookupSelected = buildCandidateScheduleLookup([item("one", "cafe", "2026-07-18", "10:00")]);
assert(selectCandidateScheduleState(lookupSelected, "cafe", "2026-07-18") === "scheduled-on-selected-date", "9. 선택 날짜에 배치");
assert(selectCandidateScheduleState(lookupSelected, "cafe", "2026-07-19") === "scheduled-on-other-date", "10. 다른 날짜에 배치");
const legacyCandidate = { ...candidate("cafe"), scheduled: true } as TripCandidate & { scheduled: boolean };
const mismatchState = { ...emptyState, candidatesByTripId: { trip: [legacyCandidate] } };
assert(buildCandidatePlaceViewModels(mismatchState, "trip", "2026-07-18")[0]?.scheduleState === "unscheduled", "11. candidate.scheduled 불일치에서 itinerary 우선");

assert(validateTimeRange("10:00", "11:30").valid, "12. 정상 시간 범위");
assert(parseTimeToMinutes("25:00") === null && !validateTimeRange("10:70", "11:30").valid, "13. 잘못된 HH:mm");
assert(!validateTimeRange("11:00", "11:00").valid && !validateTimeRange("12:00", "11:00").valid, "14. 종료 <= 시작");
assert(!doTimeRangesOverlap("10:00", "11:00", "11:00", "12:00"), "15. 시간이 맞닿는 일정");
assert(doTimeRangesOverlap("10:00", "11:30", "11:00", "12:00"), "16. 시간이 겹치는 일정");

const ordered = [item("first", "cafe", "2026-07-18", "10:00"), item("second", "market", "2026-07-18", "12:00")];
const movedUp = moveItemWithinDate(ordered, "second", "up");
assert(movedUp.status === "success" && movedUp.items[0]?.id === "second" && movedUp.items[0]?.startTime === "10:00", "17. 같은 날짜 순서 변경");
assert(moveItemWithinDate(ordered, "first", "up").status === "boundary", "18. 첫 항목 위 이동");
assert(moveItemWithinDate(ordered, "second", "down").status === "boundary", "19. 마지막 항목 아래 이동");
assert(moveItemToDate(ordered, "first", "2026-07-19", "10:00").find((entry) => entry.id === "first")?.date === "2026-07-19", "20. 다른 날짜 이동");
assert(normalizeItineraryOrder(ordered.filter((entry) => entry.id !== "first"))[0]?.id === "second", "21. 일정 삭제 후 순서 정규화");

const missingItineraryState = { ...emptyState, itineraryByTripId: { trip: [item("missing-item", "missing", "2026-07-18", "10:00")] } };
assert(buildItineraryItemViewModels(missingItineraryState, "trip", "2026-07-18", ["2026-07-18", "2026-07-19"])[0]?.placeMissing, "22. Place 누락 일정");
const missingCandidateState = { ...emptyState, candidatesByTripId: { trip: [candidate("missing")] } };
assert(buildCandidatePlaceViewModels(missingCandidateState, "trip", "2026-07-18")[0]?.placeMissing, "23. candidate 누락 Place");
const duplicateItemsState = { ...emptyState, itineraryByTripId: { trip: [item("same", "cafe", "2026-07-18", "10:00"), item("same", "market", "2026-07-18", "12:00")] } };
assert(selectItineraryItemsForDate(duplicateItemsState, "trip", "2026-07-18").length === 1, "24. 중복 item ID");
assert(buildWorkspaceViewModel(emptyState, "missing", "", "member", "2026-01-01") === null, "25. 잘못된 tripId");
assert(!canEditTripWorkspace({ sessionKind: "member", currentUserId: "owner", trip: trip("completed") }).allowed, "26. 완료 여행방 편집 시도");
assert(!canEditTripWorkspace({ sessionKind: "anonymous", currentUserId: "", trip: trip() }).allowed, "27. anonymous 편집 시도");
assert(canEditTripWorkspace({ sessionKind: "guest", currentUserId: "guest", trip: trip() }).allowed, "28. guest 편집 권한");

const demo = createDemoData();
const restored = normalizePersistedState(demo);
assert(restored.itineraryByTripId[demo.activeTripId]?.length === demo.itineraryByTripId[demo.activeTripId]?.length && restored.candidatesByTripId[demo.activeTripId]?.length === demo.candidatesByTripId[demo.activeTripId]?.length, "29. 앱 재시작 정규화 후 후보·일정 유지");

const orderedThree = [...ordered, item("third", "cafe", "2026-07-18", "14:00")];
const draggedToEnd = moveItemToIndexWithinDate(orderedThree, "first", 2);
assert(draggedToEnd.status === "success" && draggedToEnd.items.map((entry) => entry.id).join() === "second,third,first", "30. 드래그로 여러 칸 순서 변경");
assert(draggedToEnd.items.map((entry) => entry.startTime).join() === "10:00,12:00,14:00", "31. 드래그 후 시간 슬롯 보존");
assert(moveItemToIndexWithinDate(orderedThree, "first", 3).status === "boundary", "32. 드래그 대상 인덱스 범위 검증");
assert(addDaysToDate("2026-01-31", 1) === "2026-02-01", "33. DAY 추가 월 경계");
assert(addDaysToDate("2026-12-31", 1) === "2027-01-01", "34. DAY 추가 연도 경계");

const extendedState = { ...emptyState, tripsById: { trip: { ...trip(), endDate: "2026-07-20" } } };
const extendedView = buildWorkspaceViewModel(extendedState, "trip", "2026-07-20", "member", "2026-01-01");
assert(extendedView?.dates.length === 3 && extendedView.selectedDate === "2026-07-20", "35. 추가 DAY 생성 및 자동 선택 모델");

const demoTrip = demo.tripsById[demo.activeTripId];
const persistedEndDate = addDaysToDate(demoTrip.endDate, 1);
assert(Boolean(persistedEndDate), "36. demo 여행 종료일 확장");
const extendedDemo = {
  ...demo,
  tripsById: {
    ...demo.tripsById,
    [demo.activeTripId]: { ...demoTrip, endDate: persistedEndDate as string },
  },
  itineraryByTripId: {
    ...demo.itineraryByTripId,
    [demo.activeTripId]: [
      ...(demo.itineraryByTripId[demo.activeTripId] ?? []),
      {
        id: "persisted-added-day-rest",
        tripId: demo.activeTripId,
        date: persistedEndDate as string,
        startTime: "08:00",
        durationMinutes: 30,
        itemType: "rest" as const,
        preferredByUserIds: [],
      },
    ],
  },
};
const restoredExtended = normalizePersistedState(extendedDemo);
assert(restoredExtended.tripsById[demo.activeTripId]?.endDate === persistedEndDate, "37. 확장된 종료일 재시작 복원");
assert(restoredExtended.itineraryByTripId[demo.activeTripId]?.some((entry) => entry.id === "persisted-added-day-rest"), "38. 추가 DAY 일정 재시작 복원");

const relationshipFilterState = {
  ...emptyState,
  candidatesByTripId: {
    trip: [
      candidate("cafe"),
      { ...candidate("market"), addedByUserIds: ["owner", "guest"] },
    ],
  },
};
const relationshipCandidates = buildCandidatePlaceViewModels(relationshipFilterState, "trip", "2026-07-18");
assert(filterCandidatePlaceViewModels(relationshipCandidates, "", "all", "owner").length === 2, "39. 후보 전체 필터");
assert(filterCandidatePlaceViewModels(relationshipCandidates, "", "common", "owner")[0]?.placeId === "market", "40. 공통 관심 필터");
assert(filterCandidatePlaceViewModels(relationshipCandidates, "", "mine", "owner").length === 2, "41. 내가 담은 장소 필터");
assert(filterCandidatePlaceViewModels(relationshipCandidates, "", "companion", "owner")[0]?.placeId === "market", "42. 동행자가 담은 장소 필터");

const conflictValidation = validateCreateItineraryItem({ sessionKind: "member", currentUserId: "owner", trip: trip(), candidate: candidate("market"), place: places.market, itinerary: [item("existing", "cafe", "2026-07-18", "10:00", 90)], date: "2026-07-18", startTime: "11:00", endTime: "12:00" });
assert(!conflictValidation.valid && conflictValidation.conflictItemIds[0] === "existing", "추가 validation은 겹치는 item ID를 반환해야 한다");

console.log("Workspace editor verification passed: 42 scenarios + conflict validation");
