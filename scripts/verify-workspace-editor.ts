import type { ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../src/domain";
import { createDemoData } from "../src/data/mock/demoData";
import {
  MIN_DURATION_MINUTES,
  SLOT_HEIGHT_PX,
  SLOT_MINUTES,
  WORKSPACE_HOUR_LABEL_COUNT,
} from "../src/data/workspaceSchedule";
import { buildWorkspaceMutationPermissions, canEditTripWorkspace } from "../src/features/workspace/logic/workspaceCapabilities";
import { resolveDuriWorkspaceAction } from "../src/features/duri/logic/duriWorkspaceAction";
import {
  WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX,
  clampWorkspaceBoardHeight,
  getInitialWorkspaceBoardHeight,
  getWorkspaceBoardHeightBounds,
  isWorkspaceBoardCollapsed,
  resizeWorkspaceBoardHeight,
  settleWorkspaceBoardHeight,
  stepWorkspaceBoardHeight,
} from "../src/features/workspace/logic/workspaceBoardLayout";
import {
  getInitialWorkspaceModalHeight,
  getWorkspaceModalHeightBounds,
  resizeWorkspaceModalHeight,
  stepWorkspaceModalHeight,
} from "../src/features/workspace/logic/workspaceModalLayout";
import { resolveWorkspaceBackAction } from "../src/features/workspace/logic/workspaceNavigation";
import {
  buildTripEndConditionTimelineEntry,
  resolveTripEndConditionAddition,
} from "../src/features/workspace/logic/tripEndCondition";
import { getScheduleBlockDisplayMode, shouldShowScheduleResizeHandle } from "../src/features/workspace/logic/workspaceScheduleLayout";
import { resolveDayDragTargetIndex } from "../src/features/workspace/logic/workspaceDayDrag";
import { resolveWorkspaceDaySwipeTargetIndex, shouldActivateWorkspaceDaySwipe } from "../src/features/workspace/logic/workspaceDaySwipe";
import {
  addDaysToDate,
  buildTripDateRange,
  doTimeRangesOverlap,
  getSnappedDurationFromTranslation,
  getSnappedStartTimeFromTranslation,
  moveItemToDate,
  moveItemToIndexWithinDate,
  moveItemWithinDate,
  moveTripDaySchedule,
  moveTripDayScheduleToIndex,
  normalizeItineraryOrder,
  parseTimeToMinutes,
  remapScheduleToTripDateRange,
  removeTripDayFromSchedule,
  validateTimeRange,
} from "../src/features/workspace/logic/workspaceDateTime";
import {
  buildCandidatePlaceViewModels,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
  selectItineraryItemsForDate,
} from "../src/features/workspace/selectors/workspaceSelectors";
import { resolveScheduleDocumentLinkMutation, validateCreateItineraryItem } from "../src/features/workspace/validation/workspaceValidation";
import { normalizePersistedState } from "../src/store/normalizePersistedState";
import { findNextAvailableSlot, isValidGridScheduleRange, isValidScheduleRange } from "../src/utils/schedule";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(resolveScheduleDocumentLinkMutation({
  documentsHydrated: false,
  requestedDocumentIds: [],
  availableDocumentIds: new Set(),
}) === "preserve-unavailable", "문서 hydration 실패가 문서와 무관한 일정 저장을 막지 않고 기존 연결을 보존한다");
assert(resolveScheduleDocumentLinkMutation({
  documentsHydrated: false,
  requestedDocumentIds: ["unknown-document"],
  availableDocumentIds: new Set(),
}) === "invalid", "문서 저장소가 unavailable일 때 확인할 수 없는 새 연결은 거부한다");
assert(resolveScheduleDocumentLinkMutation({
  documentsHydrated: true,
  requestedDocumentIds: ["known-document"],
  availableDocumentIds: new Set(["known-document"]),
}) === "apply", "문서 hydration 성공 후 검증된 연결만 적용한다");
assert(resolveScheduleDocumentLinkMutation({
  documentsHydrated: true,
  requestedDocumentIds: [],
  availableDocumentIds: new Set(["existing-document"]),
  preserveExistingLinksWhenEmpty: true,
}) === "preserve-unavailable", "편집창을 연 뒤 hydration이 끝나는 race에서도 로드하지 못한 기존 연결을 빈 선택으로 덮어쓰지 않는다");

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

const unscheduledCandidateState = { ...emptyState, candidatesByTripId: { trip: [candidate("cafe")] } };
assert(buildCandidatePlaceViewModels(unscheduledCandidateState, "trip", "2026-07-18")[0]?.scheduleState === "unscheduled", "8. 후보 미배치");
const scheduledCandidateState = { ...unscheduledCandidateState, itineraryByTripId: { trip: [item("one", "cafe", "2026-07-18", "10:00")] } };
assert(buildCandidatePlaceViewModels(scheduledCandidateState, "trip", "2026-07-18")[0]?.scheduleState === "scheduled-on-selected-date", "9. 선택 날짜에 배치");
assert(buildCandidatePlaceViewModels(scheduledCandidateState, "trip", "2026-07-19")[0]?.scheduleState === "scheduled-on-other-date", "10. 다른 날짜에 배치");
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
const readOnlyPermissions = buildWorkspaceMutationPermissions({ sessionKind: "member", currentUserId: "owner", trip: trip("completed") });
assert(!readOnlyPermissions.permissions.canAddSchedule
  && !readOnlyPermissions.permissions.canEditSchedule
  && !readOnlyPermissions.permissions.canDeleteSchedule
  && !readOnlyPermissions.permissions.canEditTripStructure,
"28a. 완료 여행은 Add·Duplicate Add·Drag·Resize·Edit Save·Delete·DAY·여행 조건 mutation을 하나의 권한 원본에서 모두 차단");
const editablePermissions = buildWorkspaceMutationPermissions({ sessionKind: "member", currentUserId: "owner", trip: trip() });
assert(Object.values(editablePermissions.permissions).every(Boolean), "28b. 편집 가능 여행은 기존 일정 mutation 권한을 유지");

const createScheduleAction = resolveDuriWorkspaceAction({ itineraryCount: 0, hasAnalysis: true, stale: true, canUseAnalysis: true });
const runAnalysisAction = resolveDuriWorkspaceAction({ itineraryCount: 3, hasAnalysis: false, stale: false, canUseAnalysis: true });
const viewAnalysisAction = resolveDuriWorkspaceAction({ itineraryCount: 3, hasAnalysis: true, stale: false, canUseAnalysis: false });
const reanalyzeAction = resolveDuriWorkspaceAction({ itineraryCount: 3, hasAnalysis: true, stale: true, canUseAnalysis: true });
assert(createScheduleAction.kind === "create_draft" && createScheduleAction.label === "일정 초안 만들기" && createScheduleAction.destination === "analysis-route", "28c. DURI 일정 0개 상태는 stale보다 먼저 자동 초안 흐름을 선택");
assert(runAnalysisAction.kind === "run_analysis" && runAnalysisAction.label === "DURI 분석하기", "28d. DURI 일정 있음·분석 없음 상태");
assert(viewAnalysisAction.kind === "view_analysis" && viewAnalysisAction.label === "분석 결과 보기" && viewAnalysisAction.enabled, "28e. DURI 유효 분석 결과는 엔진 실행 가능 여부와 무관하게 열람 가능");
assert(reanalyzeAction.kind === "reanalyze" && reanalyzeAction.label === "다시 분석하기", "28f. DURI stale 분석 상태");
assert(!resolveDuriWorkspaceAction({ itineraryCount: 0, hasAnalysis: false, stale: false, canUseAnalysis: false }).enabled, "28g. 분석 입력을 확인하지 못한 일정 0개에서는 자동 초안 CTA를 비활성화");

const demo = createDemoData();
const restored = normalizePersistedState(demo);
assert(restored.itineraryByTripId[demo.activeTripId]?.length === demo.itineraryByTripId[demo.activeTripId]?.length && restored.candidatesByTripId[demo.activeTripId]?.length === demo.candidatesByTripId[demo.activeTripId]?.length, "29. 앱 재시작 정규화 후 후보·일정 유지");
const lockItem = demo.itineraryByTripId[demo.activeTripId]?.[0];
assert(lockItem, "29a. 잠금 복원 검증용 일정 존재");
const lockPersisted = normalizePersistedState({
  ...demo,
  itineraryByTripId: {
    ...demo.itineraryByTripId,
    [demo.activeTripId]: (demo.itineraryByTripId[demo.activeTripId] ?? []).map((entry) => entry.id === lockItem.id ? { ...entry, lockedForDuri: true } : entry),
  },
});
assert(lockPersisted.itineraryByTripId[demo.activeTripId]?.find((entry) => entry.id === lockItem.id)?.lockedForDuri === true, "29b. 두리 일정 잠금 재시작 복원");
const lockedTrip = lockPersisted.tripsById[demo.activeTripId];
assert(buildItineraryItemViewModels(lockPersisted, demo.activeTripId, lockItem.date, buildTripDateRange(lockedTrip.startDate, lockedTrip.endDate).map((entry) => entry.date)).find((entry) => entry.id === lockItem.id)?.lockedForDuri === true, "29c. 워크스페이스 일정 잠금 표시 모델 전달");

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

const duplicateScheduleState = {
  ...unscheduledCandidateState,
  itineraryByTripId: {
    trip: [
      item("first-visit", "cafe", "2026-07-18", "10:00"),
      item("second-visit", "cafe", "2026-07-19", "12:00", 30),
    ],
  },
};
const duplicateCandidateView = buildCandidatePlaceViewModels(duplicateScheduleState, "trip", "2026-07-18")[0];
assert(duplicateCandidateView?.scheduledCount === 2 && duplicateCandidateView.scheduledDates.join() === "2026-07-18,2026-07-19", "42a. 같은 후보의 독립 일정 두 개를 canonical scheduledCount로 집계");
assert(duplicateScheduleState.itineraryByTripId.trip.map((entry) => entry.id).join() === "first-visit,second-visit", "42b. 중복 배치가 첫 일정을 덮어쓰지 않고 별도 item을 유지");
const repeatValidation = validateCreateItineraryItem({ sessionKind: "member", currentUserId: "owner", trip: trip(), candidate: candidate("cafe"), place: places.cafe, itinerary: [item("first-visit", "cafe", "2026-07-18", "10:00")], date: "2026-07-18", startTime: "12:00", endTime: "13:00" });
assert(repeatValidation.valid, "42c. 이미 배치된 후보도 겹치지 않는 다른 시간에 새 일정으로 추가 가능");

const conflictValidation = validateCreateItineraryItem({ sessionKind: "member", currentUserId: "owner", trip: trip(), candidate: candidate("market"), place: places.market, itinerary: [item("existing", "cafe", "2026-07-18", "10:00", 90)], date: "2026-07-18", startTime: "11:00", endTime: "12:00" });
assert(!conflictValidation.valid && conflictValidation.conflictItemIds[0] === "existing", "추가 validation은 겹치는 item ID를 반환해야 한다");
assert(getSnappedStartTimeFromTranslation("10:00", 60, SLOT_HEIGHT_PX) === "10:15", "43. 일정 블록 한 슬롯 아래 이동");
assert(getSnappedStartTimeFromTranslation("00:00", 60, -400) === "00:00", "44. 일정 블록의 실제 날짜 시작 경계");
assert(getSnappedStartTimeFromTranslation("23:00", 60, 400) === "23:00", "45. 일정 블록 종료 경계");
assert(getSnappedDurationFromTranslation("10:00", 60, SLOT_HEIGHT_PX) === 75, "46. 체류시간 한 슬롯 늘리기");
assert(getSnappedDurationFromTranslation("10:00", MIN_DURATION_MINUTES, -400) === MIN_DURATION_MINUTES, "47. 최소 체류시간 경계");
assert(getSnappedDurationFromTranslation("10:00", MIN_DURATION_MINUTES, SLOT_HEIGHT_PX) === 30, "47b. 15분 일정 하단 손잡이를 아래로 한 슬롯 끌면 30분으로 확대");
assert(getSnappedStartTimeFromTranslation("10:01", 1, SLOT_HEIGHT_PX) === "10:16", "47c. 1분 직접 입력 일정도 드래그 이동량은 정확히 15분");
assert(getSnappedDurationFromTranslation("10:01", 1, SLOT_HEIGHT_PX) === 16, "47d. 1분 직접 입력 일정도 resize 변화량은 정확히 15분");
assert(getSnappedDurationFromTranslation("10:01", 16, -SLOT_HEIGHT_PX) === 1, "47e. 비격자 체류시간 축소도 16분에서 1분으로 정확히 15분 변화");
assert(getSnappedDurationFromTranslation("10:01", 20, -SLOT_HEIGHT_PX) === 5, "47f. 체류시간의 분 오프셋을 resize 중 보존");
assert(getSnappedStartTimeFromTranslation("10:01", 1, -10_000) === "00:01", "47g. 시작 경계 clamp도 원래 분 오프셋 보존");
assert(getSnappedDurationFromTranslation("23:30", 16, SLOT_HEIGHT_PX) === 16, "47h. 자정 전 15분 전체 증가가 불가능하면 부분 증가하지 않음");
assert(getSnappedDurationFromTranslation("23:00", 60, 400) === 60, "48. 자정 종료 경계");

const threeDaySchedule = [
  item("day-1", "cafe", "2026-07-18", "09:00"),
  item("day-2", "market", "2026-07-19", "10:00"),
  item("day-3", "cafe", "2026-07-20", "11:00"),
];
const removedMiddleDay = removeTripDayFromSchedule(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-19");
assert(removedMiddleDay.status === "success", "49. 중간 DAY 삭제 성공");
assert(removedMiddleDay.status === "success" && removedMiddleDay.endDate === "2026-07-19" && removedMiddleDay.removedItineraryCount === 1, "50. 중간 DAY 삭제 시 기간과 삭제 일정 수 조정");
assert(removedMiddleDay.status === "success" && removedMiddleDay.items.find((entry) => entry.id === "day-3")?.date === "2026-07-19", "51. 중간 DAY 삭제 시 뒤 일정 날짜 압축");

const removedFirstDay = removeTripDayFromSchedule(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18");
assert(removedFirstDay.status === "success" && removedFirstDay.startDate === "2026-07-19" && removedFirstDay.endDate === "2026-07-20", "52. 첫 DAY 삭제 시 시작일 이동");
assert(removedFirstDay.status === "success" && removedFirstDay.items.find((entry) => entry.id === "day-2")?.date === "2026-07-19", "53. 첫 DAY 삭제 시 남은 실제 날짜 유지");
assert(removeTripDayFromSchedule([threeDaySchedule[0]], "2026-07-18", "2026-07-18", "2026-07-18").status === "boundary", "54. 마지막 DAY 삭제 방지");

const movedDay = moveTripDaySchedule(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18", "next");
assert(movedDay.status === "success" && movedDay.selectedDate === "2026-07-19", "55. DAY 일정 묶음 다음 순서 이동");
assert(movedDay.status === "success" && movedDay.items.find((entry) => entry.id === "day-1")?.date === "2026-07-19" && movedDay.items.find((entry) => entry.id === "day-2")?.date === "2026-07-18", "56. 인접 DAY 일정 묶음 원자적 교환");
assert(moveTripDaySchedule(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18", "previous").status === "boundary", "57. 첫 DAY 이전 이동 방지");

const shiftedRange = remapScheduleToTripDateRange(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-08-01", "2026-08-03", "2026-07-19");
assert(shiftedRange.status === "success" && shiftedRange.selectedDate === "2026-08-02", "58. 기간 변경 시 선택 DAY 번호 유지");
assert(shiftedRange.status === "success" && shiftedRange.items.find((entry) => entry.id === "day-3")?.date === "2026-08-03", "59. 기간 이동 시 모든 일정 DAY 번호 유지");
const shortenedRange = remapScheduleToTripDateRange(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-08-01", "2026-08-02");
assert(shortenedRange.status === "success" && shortenedRange.removedItineraryCount === 1 && shortenedRange.items.length === 2, "60. 기간 축소 시 잘리는 DAY 일정만 제거");
const damagedRange = remapScheduleToTripDateRange([...threeDaySchedule, item("outside", "market", "2026-07-25", "12:00")], "2026-07-18", "2026-07-20", "2026-08-01", "2026-08-03");
assert(damagedRange.status === "invalid-itinerary" && damagedRange.items.length === 4, "61. 기간 밖 손상 일정이 있으면 전체 변경 거부");

const draggedAcrossDays = moveTripDayScheduleToIndex(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18", 2);
assert(draggedAcrossDays.status === "success" && draggedAcrossDays.selectedDate === "2026-07-20", "62. 여러 DAY를 건너뛴 드롭 위치 선택");
assert(draggedAcrossDays.status === "success" && draggedAcrossDays.items.find((entry) => entry.id === "day-1")?.date === "2026-07-20" && draggedAcrossDays.items.find((entry) => entry.id === "day-2")?.date === "2026-07-18" && draggedAcrossDays.items.find((entry) => entry.id === "day-3")?.date === "2026-07-19", "63. 다중 DAY 이동을 한 번의 순열로 반영");
assert(moveTripDayScheduleToIndex(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18", 3).status === "boundary", "64. 드롭 인덱스 범위 검증");

const dayTabStep = 120;
assert(resolveDayDragTargetIndex(0, 0, dayTabStep * 0.36, 3, dayTabStep) === 1, "65. 첫 인접 DAY 위치를 빠르게 감지");
assert(resolveDayDragTargetIndex(0, 1, dayTabStep * 1.4, 3, dayTabStep) === 1, "66. 중간 DAY 드롭 위치를 안정적으로 유지");
assert(resolveDayDragTargetIndex(0, 1, dayTabStep * 1.66, 3, dayTabStep) === 2, "67. 다음 DAY 경계를 넘으면 한 칸씩 이동");
assert(resolveDayDragTargetIndex(0, 0, dayTabStep * 4.8, 6, dayTabStep) === 5, "67b. 빠른 드래그 한 번으로 여러 DAY를 건너뛰어도 손가락 위치를 즉시 반영");
assert(resolveDayDragTargetIndex(2, 2, dayTabStep * -0.36, 3, dayTabStep) === 1, "68. 왼쪽 중간 DAY 위치를 빠르게 감지");
assert(resolveDayDragTargetIndex(4, 4, 0, 3, dayTabStep) === -1, "69. 유효하지 않은 드래그 시작 인덱스 거부");
assert(shouldActivateWorkspaceDaySwipe(16, 4) && !shouldActivateWorkspaceDaySwipe(8, 1) && !shouldActivateWorkspaceDaySwipe(16, 20), "69b. 시간표의 명확한 가로 제스처만 DAY swipe로 활성화");
assert(resolveWorkspaceDaySwipeTargetIndex(0, 3, -44) === 1 && resolveWorkspaceDaySwipeTargetIndex(1, 3, 44) === 0, "69c. 시간표 좌우 swipe로 인접 DAY 전환");
assert(resolveWorkspaceDaySwipeTargetIndex(0, 3, 44) === 0 && resolveWorkspaceDaySwipeTargetIndex(2, 3, -44) === 2, "69d. 첫·마지막 DAY 경계 유지");

const draggedToMiddle = moveTripDayScheduleToIndex(threeDaySchedule, "2026-07-18", "2026-07-20", "2026-07-18", 1);
assert(draggedToMiddle.status === "success" && draggedToMiddle.selectedDate === "2026-07-19", "70. 중간에 놓은 일정 묶음의 도착 DAY 선택");
assert(draggedToMiddle.status === "success" && draggedToMiddle.items.find((entry) => entry.id === "day-1")?.date === "2026-07-19", "71. 중간 DAY 드롭 일정 이동");

const quarterHourRange = validateTimeRange("10:15", "10:30");
assert(quarterHourRange.valid && quarterHourRange.durationMinutes === 15, "72. 15분 일정 범위 허용");
assert(validateTimeRange("10:10", "10:25").valid && validateTimeRange("10:10", "10:11").valid, "73. 직접 입력은 시작·종료를 1분 단위로 허용");
assert(isValidScheduleRange(item("one-minute", "cafe", "2026-07-18", "23:58", 1)), "73a. 하루 끝의 1분 일정도 일반 일정 유효성에서 보존");
assert(isValidScheduleRange(item("off-slot", "cafe", "2026-07-18", "10:10", 15)), "73b. Backend HH:mm 1분 단위 일정은 읽기·분석 유효성에서 보존");
assert(!isValidGridScheduleRange(item("off-slot", "cafe", "2026-07-18", "10:10", 15)), "73c. 두리 자동 생성처럼 격자가 필요한 경로는 별도 15분 검증 사용");
assert(findNextAvailableSlot({
  items: [item("quarter", "cafe", "2026-07-18", "10:00", 15)],
  date: "2026-07-18",
  durationMinutes: 15,
  fromMinutes: 10 * 60,
}) === "10:15", "74. 15분 다음 빈 슬롯 검색");
assert(SLOT_MINUTES === 15 && SLOT_HEIGHT_PX === 20 && MIN_DURATION_MINUTES === 15, "75. 15분 시간축 상수");
assert(WORKSPACE_HOUR_LABEL_COUNT === 25, "75b. 00:00부터 24:00까지 모든 정시 라벨 표시");

const boardBounds = getWorkspaceBoardHeightBounds(900, 20, 30);
const boardInitialHeight = getInitialWorkspaceBoardHeight(900, boardBounds);
assert(boardBounds.minHeight === WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX && boardBounds.maxHeight === 746, "76. 후보 보드의 안전한 연속 높이 경계");
assert(boardInitialHeight === 116 && !isWorkspaceBoardCollapsed(boardInitialHeight, boardBounds), "76b. 초기 후보 보드는 제목을 보여주되 일정표를 크게 가리지 않음");
assert(resizeWorkspaceBoardHeight(boardInitialHeight, -37, boardBounds) === boardInitialHeight + 37, "77. 드래그 중에는 연속 높이 확장");
assert(resizeWorkspaceBoardHeight(430, 37, boardBounds) === 393, "77b. 임의 높이에서도 드래그 중 연속 높이 축소");
assert(resizeWorkspaceBoardHeight(boardInitialHeight, -10_000, boardBounds) === boardBounds.maxHeight, "78. 후보 보드 최대 높이 clamp");
const collapsedBoardHeight = resizeWorkspaceBoardHeight(boardInitialHeight, 10_000, boardBounds);
assert(collapsedBoardHeight === boardBounds.minHeight && isWorkspaceBoardCollapsed(collapsedBoardHeight, boardBounds), "79. 후보 보드를 끝까지 내리면 손잡이 높이로 clamp");
assert(settleWorkspaceBoardHeight(430, boardBounds) === 430, "79b. 드래그 해제 시 사용자가 놓은 연속 높이를 유지");
assert(settleWorkspaceBoardHeight(700, boardBounds) === 700, "79c. 큰 높이에서도 세 단계로 강제 snap하지 않음");
const boardAccessibilityStep = stepWorkspaceBoardHeight(boardInitialHeight, 1, boardBounds);
assert(boardAccessibilityStep > boardBounds.minHeight && boardAccessibilityStep < boardBounds.maxHeight, "80. 접근성 높이 증가는 연속 범위 안에서 이동");
assert(stepWorkspaceBoardHeight(boardBounds.minHeight, -1, boardBounds) === boardBounds.minHeight && stepWorkspaceBoardHeight(boardBounds.maxHeight, 1, boardBounds) === boardBounds.maxHeight, "80b. 접근성 증분도 최소·최대 높이 clamp");
const compactBoardBounds = getWorkspaceBoardHeightBounds(360, 30, 30);
assert(compactBoardBounds.minHeight === WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX && compactBoardBounds.maxHeight === 196 && clampWorkspaceBoardHeight(boardBounds.maxHeight, compactBoardBounds) === compactBoardBounds.maxHeight, "81. 창 축소 시 손잡이를 유지하며 후보 보드 높이 재조정");
const tinyBoardBounds = getWorkspaceBoardHeightBounds(120, 40, 40);
assert(tinyBoardBounds.minHeight === 40 && tinyBoardBounds.maxHeight === 40, "81b. 손잡이보다 작은 safe viewport에서는 후보 보드도 실제 화면 높이로 제한");
const zeroBoardBounds = getWorkspaceBoardHeightBounds(0, 40, 40);
assert(zeroBoardBounds.minHeight === 0 && zeroBoardBounds.maxHeight === 0, "81c. 사용할 수 없는 viewport에서 음수 높이 방지");
assert(resolveWorkspaceBackAction(true, "trip").type === "back", "81d. navigation history가 있으면 기존 화면으로 돌아감");
const workspaceRoomBackAction = resolveWorkspaceBackAction(false, " trip ");
assert(workspaceRoomBackAction.type === "replace" && typeof workspaceRoomBackAction.href !== "string" && workspaceRoomBackAction.href.pathname === "/trips/[tripId]" && workspaceRoomBackAction.href.params.tripId === "trip", "81e. navigation history가 없으면 현재 여행방으로 대체 이동");
const workspaceListBackAction = resolveWorkspaceBackAction(false, "  ");
assert(workspaceListBackAction.type === "replace" && workspaceListBackAction.href === "/(tabs)/trips", "81f. tripId가 없으면 여행 목록으로 대체 이동");

const constrainedTrip: TripRoom = {
  ...trip(),
  endCondition: {
    type: "train",
    location: { name: "부산역" },
    deadline: "18:00",
    travelMinutes: 60,
    serviceBufferMinutes: 30,
  },
};
const endTimeline = buildTripEndConditionTimelineEntry(constrainedTrip);
assert(endTimeline?.date === "2026-07-19" && endTimeline.cutoffMinutes === 16 * 60 + 30, "84. 마지막 DAY 종료 조건 타임라인과 복귀 출발 시각 파생");
const roundedTimeline = buildTripEndConditionTimelineEntry({
  ...constrainedTrip,
  endCondition: { ...constrainedTrip.endCondition!, travelMinutes: 47, serviceBufferMinutes: 20 },
});
assert(roundedTimeline?.cutoffMinutes === 16 * 60 + 53, "85. 복귀 마감·이동·준비시간 계산도 1분 정밀도를 보존");
const exactCutoffAddition = [item("exact-end", "cafe", "2026-07-19", "15:30", 60)];
const exactAdditionResolution = resolveTripEndConditionAddition(constrainedTrip, exactCutoffAddition);
assert(exactAdditionResolution.status === "accepted" && exactAdditionResolution.itinerary[0]?.startTime === "15:30", "86. cutoff에 정확히 끝나는 추가는 시간 변경 없이 허용");
const lateAddition = [item("late-end", "cafe", "2026-07-19", "15:45", 60)];
const lateAdditionResolution = resolveTripEndConditionAddition(constrainedTrip, lateAddition);
assert(lateAdditionResolution.status === "rejected" && lateAdditionResolution.itinerary[0]?.startTime === "15:45", "87. cutoff를 15분 넘는 추가는 자동 앞당김 없이 거부");
assert(resolveTripEndConditionAddition(constrainedTrip, [...lateAddition, item("earlier-day", "market", "2026-07-18", "20:00")], "2026-07-18").status === "accepted", "88. 기존 마지막 DAY가 위반 상태여도 다른 DAY의 일정 추가는 종료 조건으로 차단하지 않음");
assert(getScheduleBlockDisplayMode(1) === "micro" && getScheduleBlockDisplayMode(15) === "micro" && getScheduleBlockDisplayMode(30) === "compact" && getScheduleBlockDisplayMode(45) === "compact" && getScheduleBlockDisplayMode(60) === "full", "89. 짧은 일정 표시 밀도를 1~15분·30/45분·60분 이상으로 구분");
assert(shouldShowScheduleResizeHandle(true, 1) && shouldShowScheduleResizeHandle(true, 15) && shouldShowScheduleResizeHandle(true, 30) && !shouldShowScheduleResizeHandle(false, 1), "89b. 편집 가능한 1분·15분 일정도 하단 resize 손잡이를 유지");
const modalBounds = getWorkspaceModalHeightBounds(900, 20, 30);
const modalInitialHeight = getInitialWorkspaceModalHeight(900, modalBounds);
assert(modalBounds.minHeight === 320 && modalBounds.maxHeight === 802 && modalInitialHeight === 612, "90. 후보 선택 창의 safe area 기반 연속 높이 경계");
assert(resizeWorkspaceModalHeight(modalInitialHeight, -37, modalBounds) === modalInitialHeight + 37 && resizeWorkspaceModalHeight(modalInitialHeight, 10_000, modalBounds) === modalBounds.minHeight && stepWorkspaceModalHeight(modalInitialHeight, 1, modalBounds) === modalInitialHeight + 20, "91. 후보 선택 창 위 손잡이 연속 확대·최소 clamp·접근성 증분");
const tinyModalBounds = getWorkspaceModalHeightBounds(180, 20, 30);
assert(tinyModalBounds.minHeight === 130 && tinyModalBounds.maxHeight === 130, "92. 키보드·가로 화면으로 safe viewport가 작아져도 모달 높이가 실제 화면을 넘지 않음");

console.log("Workspace editor verification passed: 100 scenarios + conflict validation");
