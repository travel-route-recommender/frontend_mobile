import type { Region, TripRoom, User } from "../src/domain";
import { calculateTripPreparationProgress } from "../src/features/trips/logic/calculateTripPreparationProgress";
import { selectTripRoomCardViewModel } from "../src/features/trips/selectors";
import { getTripDayCount } from "../src/features/trips/utils/tripDateUtils";
import { buildInitialTripDays, mapDraftToCreateTripRoomRequest } from "../src/features/trip-creation/mappers/createTripRoomMapper";
import { createTripDraftEditCopy, getRegionSelectionPatch, getTripEditCommitPatch } from "../src/features/trip-creation/logic/tripDraftEditing";
import { buildCalendarMonth, moveCalendarMonth, selectTripDateRange } from "../src/features/trip-creation/logic/tripDateRange";
import { createTripRoomService, validateCreateTripRoomRequest } from "../src/features/trip-creation/services/createTripRoomService";
import { createRegionService, mapRegionToOption } from "../src/features/trip-creation/services/regionService";
import { normalizeInvitedUserIds, validateCreateTripDraft } from "../src/features/trip-creation/validation/validateCreateTripDraft";
import type { CreateTripDraft } from "../src/features/trip-creation/types";
import { CREATE_TRIP_DRAFT_VERSION } from "../src/features/trip-creation/types";
import { selectCompletedTripsForCurrentUser, selectPlanningTripsForCurrentUser } from "../src/store/selectors";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const users: Record<string, User> = {
  owner: { id: "owner", name: "방장", initial: "방" },
  friend: { id: "friend", name: "친구", initial: "친" },
};
const regions: Record<string, Region> = { busan: { id: "busan", name: "부산", shortName: "부산", description: "바다", spots: 1, weather: "맑음", imageUrl: "image" } };
const trip = (id: string, startDate: string, endDate: string, status: TripRoom["status"] = "planning"): TripRoom => ({ id, title: id, regionId: "busan", startDate, endDate, dateUndecided: false, status, transport: "public", budgetLevel: "standard", intensity: "balanced", members: [{ userId: "owner", role: "owner" }] });
const tripsById = {
  later: trip("later", "2026-08-10", "2026-08-11"),
  sooner: trip("sooner", "2026-08-01", "2026-08-02"),
  latestDone: trip("latestDone", "2026-06-01", "2026-06-05", "completed"),
  olderDone: trip("olderDone", "2026-05-01", "2026-05-02", "completed"),
};
const collection = { currentUserId: "owner", tripsById, tripOrder: ["later", "sooner", "later", "olderDone", "latestDone"] };

function createDraft(overrides: Partial<CreateTripDraft> = {}): CreateTripDraft {
  return {
    configVersion: CREATE_TRIP_DRAFT_VERSION,
    ownerUserId: "owner",
    currentStep: 4,
    regionId: "busan",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    dateUndecided: false,
    transport: "public",
    budgetLevel: "standard",
    intensity: "balanced",
    companionType: "friends",
    expectedMemberCount: null,
    selectedMemberUserIds: [],
    roomName: "부산 여행",
    isRoomNameCustomized: false,
    startedAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

async function main() {
  assert(selectPlanningTripsForCurrentUser(collection).map((item) => item.id).join(",") === "sooner,later", "진행 중 여행은 시작일 오름차순이며 중복 ID를 제거해야 한다");
  assert(selectCompletedTripsForCurrentUser(collection).map((item) => item.id).join(",") === "latestDone,olderDone", "완료 여행은 종료일 내림차순이어야 한다");
  assert(getTripDayCount("2026-08-01", "2026-08-02") === 2, "1박 2일은 달력일 2일이어야 한다");
  assert(getTripDayCount("2026-08-02", "2026-08-01") === undefined, "역전된 날짜 범위는 거부해야 한다");

  const validationContext = { regionsById: regions, usersById: users, currentUserId: "owner" };
  assert(validateCreateTripDraft(createDraft({ startDate: "2026-08-02", endDate: "2026-08-01" }), validationContext)?.includes("종료일"), "역전된 생성 날짜는 validation 오류여야 한다");
  assert(validateCreateTripDraft(createDraft({ dateUndecided: true, startDate: null, endDate: null }), validationContext) === undefined, "날짜 미정 Draft는 null/null 조합만 허용해야 한다");
  assert(validateCreateTripDraft(createDraft({ dateUndecided: true, startDate: "2026-08-01", endDate: null }), validationContext)?.includes("함께 저장"), "날짜 미정과 실제 범위를 함께 저장하면 안 된다");
  assert(validateCreateTripDraft(createDraft({ roomName: "   " }), validationContext)?.includes("이름"), "공백 여행방 이름은 거부해야 한다");
  assert(normalizeInvitedUserIds(["friend", "friend", "owner", "missing"], "owner", users).join(",") === "friend", "동행자는 중복·방장·없는 사용자를 제거해야 한다");

  const firstSelection = selectTripDateRange(null, null, "2026-07-22");
  assert(firstSelection.startDate === "2026-07-22" && firstSelection.endDate === null, "달력 첫 선택은 시작일이어야 한다");
  const sameDay = selectTripDateRange(firstSelection.startDate, firstSelection.endDate, "2026-07-22");
  assert(sameDay.startDate === sameDay.endDate, "같은 날짜 두 번 선택은 당일치기여야 한다");
  assert(buildCalendarMonth("2026-07-01").length === 42 && moveCalendarMonth("2026-12-01", 1) === "2027-01-01", "월 달력은 6주 grid와 연도 경계를 지원해야 한다");

  const undecidedDays = buildInitialTripDays({ startDate: null, endDate: null, dateUndecided: true });
  assert(undecidedDays.length === 1 && undecidedDays[0].dayNumber === 1 && undecidedDays[0].date === null, "날짜 미정 초기 상태는 날짜 없는 Day 1 하나여야 한다");
  const datedDays = buildInitialTripDays({ startDate: "2026-07-22", endDate: "2026-07-24", dateUndecided: false });
  assert(datedDays.map((day) => day.date).join(",") === "2026-07-22,2026-07-23,2026-07-24", "날짜가 있으면 양 끝을 포함한 Day 목록을 만들어야 한다");

  const autoNamePatch = getRegionSelectionPatch(createDraft({ isRoomNameCustomized: false }), "busan", "부산");
  assert(autoNamePatch.roomName === "부산 여행", "자동 이름 상태에서는 지역 선택으로 기본 이름을 만들어야 한다");
  const customDraft = createDraft({ roomName: "여름방학 졸업여행", isRoomNameCustomized: true });
  const customNamePatch = getRegionSelectionPatch(customDraft, "busan", "부산");
  assert(customNamePatch.roomName === undefined, "사용자 이름은 지역 변경으로 덮어쓰면 안 된다");

  const baseDraft = createDraft();
  const editCopy = createTripDraftEditCopy(baseDraft);
  editCopy.startDate = "2026-09-01";
  editCopy.endDate = "2026-09-01";
  assert(baseDraft.startDate === "2026-08-01", "edit local copy 변경은 원본 Draft를 바꾸지 않아야 한다");
  const dateCommit = getTripEditCommitPatch(1, editCopy);
  const committedDraft = { ...baseDraft, ...dateCommit };
  assert(committedDraft.startDate === "2026-09-01" && committedDraft.regionId === baseDraft.regionId && committedDraft.roomName === baseDraft.roomName, "날짜 수정 완료는 날짜만 반영하고 다른 값을 유지해야 한다");

  const regionOption = mapRegionToOption(regions.busan);
  const request = mapDraftToCreateTripRoomRequest(createDraft({ selectedMemberUserIds: ["friend"] }), regionOption, ["friend"]);
  assert(request.name === "부산 여행" && request.regionId === "busan" && request.expectedMemberCount === 2, "Draft mapper는 이름·지역·실제 선택 인원을 request로 옮겨야 한다");
  assert(request.travelStyles.join(",") === "transport:public,budget:standard,intensity:balanced", "기존 세 조건은 mock request travelStyles로 명시적으로 매핑해야 한다");
  assert(validateCreateTripRoomRequest(request) === undefined, "완성된 mock request는 service validation을 통과해야 한다");

  let createCallCount = 0;
  const service = createTripRoomService("mock", () => { createCallCount += 1; return "trip-created"; });
  const response = await service.createTripRoom(request);
  assert(response.roomId === "trip-created" && response.inviteToken === "mock-trip-created" && createCallCount === 1, "mock service는 roomId와 명시적 mock invite token을 반환해야 한다");
  const failingService = createTripRoomService("mock", () => "");
  let failed = false;
  try { await failingService.createTripRoom(request); } catch { failed = true; }
  assert(failed, "mock persistence 실패는 성공 응답으로 위장하면 안 된다");

  const regionService = createRegionService("mock", Object.values(regions));
  const popular = await regionService.getPopularRegions();
  const search = await regionService.searchRegions("부산");
  assert(popular.length === 1 && search[0]?.id === "busan" && !search[0]?.areaCode, "지역 service는 mock 목록을 검색하되 허위 공식 코드를 만들면 안 된다");

  const progress = calculateTripPreparationProgress({ trip: tripsById.sooner, completedPreferenceCount: 1, preferenceTargetCount: 2, candidateCount: 2, itineraryCount: 0 });
  assert(progress.totalSteps === 5 && progress.completedSteps === 1 && progress.activeSteps === 2 && progress.rate === 0.4, "준비율은 완료 1점·진행 0.5점 기준이어야 한다");
  const selectorSource = { ...collection, usersById: users, regionsById: regions, candidatesByTripId: {}, itineraryByTripId: {}, preferenceResultsByUserId: {} };
  assert(selectTripRoomCardViewModel(selectorSource, "missing") === undefined, "없는 tripId의 ViewModel은 undefined여야 한다");
  const card = selectTripRoomCardViewModel(selectorSource, "sooner", "2026-07-31");
  assert(card?.memberCount === 1 && card.timingLabel === "D-1" && card.destinationName === "부산", "카드 ViewModel은 관계와 D-day를 파생해야 한다");

  console.log("Trip flow verification passed: 29 creation, date, edit, mapper, service, region, sorting, and ViewModel checks");
}

void main().catch((error: unknown) => { throw error; });
