import type { Region, TripRoom, User, UserPreferenceResult } from "../src/domain";
import {
  buildTripInviteUrl,
  createMockTripInviteCode,
  createTripInviteRecord,
  resolveMockTripInvite,
} from "../src/features/invitations/logic/tripInviteLinks";
import { buildWebInviteShareData } from "../src/features/invitations/logic/inviteShareMessage";
import { calculateTripPreparationProgress } from "../src/features/trips/logic/calculateTripPreparationProgress";
import { selectRoomPreferenceResponseSummary, selectTripRoomCardViewModel } from "../src/features/trips/selectors";
import { PERSONAL_TEST_VERSION } from "../src/duri/preferences";
import { getTripDayCount } from "../src/features/trips/utils/tripDateUtils";
import { buildInitialTripDays, mapDraftToCreateTripRoomRequest } from "../src/features/trip-creation/mappers/createTripRoomMapper";
import { createTripDraftEditCopy, getRegionSelectionPatch, getTripEditCommitPatch } from "../src/features/trip-creation/logic/tripDraftEditing";
import { buildCalendarMonth, moveCalendarMonth, selectTripDateRange } from "../src/features/trip-creation/logic/tripDateRange";
import { createTripRoomService, validateCreateTripRoomRequest } from "../src/features/trip-creation/services/createTripRoomService";
import {
  clearApiTripLocalFacts,
  loadApiTripLocalFacts,
  loadApiTripLocalFactsWithStatus,
  parseApiTripLocalFacts,
  parseStoredApiTripLocalFacts,
  saveApiTripLocalFacts,
} from "../src/features/trip-creation/services/apiTripFactsStorage";
import { normalizeCreateTripDraft } from "../src/features/trip-creation/store/useCreateTripDraftStore";
import { createRegionService, mapRegionToOption } from "../src/features/trip-creation/services/regionService";
import { normalizeInvitedUserIds, validateCreateTripDraft } from "../src/features/trip-creation/validation/validateCreateTripDraft";
import type { CreateTripDraft } from "../src/features/trip-creation/types";
import { DEMO_MEMBER_ID } from "../src/features/auth/config";
import { MOCK_FRIEND_IDS, mockFriendProfiles } from "../src/features/compatibility/config/mock-friends";
import { resolveSavedFriendIds } from "../src/features/compatibility/logic/resolve-saved-friend-ids";
import { filterEligibleCompanionUserIds, resolveEligibleCompanionUsers } from "../src/features/trip-creation/logic/eligibleCompanionMembers";
import { CREATE_TRIP_DRAFT_VERSION } from "../src/features/trip-creation/types";
import { selectCompletedTripsForCurrentUser, selectPlanningTripsForCurrentUser } from "../src/store/selectors";
import { hasDuplicateMemberIds, parseTravelTypeSnapshotRecord, parseTravelTypeSnapshotTags } from "../src/features/trips/logic/travelTypeSnapshot";
import { selectTripHomeDuriState } from "../src/features/trips/logic/selectTripHomeDuriState";

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
    accommodationLocation: "",
    endCondition: null,
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
  assert(selectTripHomeDuriState({ itineraryCount: 0, analysisAvailable: true, analysisStatus: "idle", currentFingerprint: "current" }).kind === "no-itinerary", "빈 일정은 분석 대신 일정 만들기로 안내해야 한다");
  assert(selectTripHomeDuriState({ itineraryCount: 2, analysisAvailable: true, analysisStatus: "idle", currentFingerprint: "current" }).kind === "ready", "API 일정과 분석 입력이 준비되면 여행방 홈에서 분석을 열어야 한다");
  const existingDuriState = selectTripHomeDuriState({
    itineraryCount: 2,
    analysisAvailable: true,
    analysisStatus: "idle",
    currentFingerprint: "current",
    session: { inputFingerprint: "current", issues: [{ severity: "high" }, { severity: "info" }] },
  });
  assert(existingDuriState.kind === "existing" && existingDuriState.issueCount === 1, "현재 입력의 저장된 분석은 정보성 항목을 제외한 점검 개수로 표시해야 한다");
  assert(selectTripHomeDuriState({ itineraryCount: 2, analysisAvailable: true, analysisStatus: "idle", currentFingerprint: "new", session: { inputFingerprint: "old", issues: [] } }).kind === "stale", "서버 일정 version이 바뀌면 과거 분석을 최신 결과처럼 표시하면 안 된다");
  assert(selectTripHomeDuriState({ itineraryCount: 2, analysisAvailable: false, unavailableMessage: "일정 없음", analysisStatus: "idle", currentFingerprint: "" }).kind === "unavailable", "분석 입력이 없을 때만 준비 중 상태를 표시해야 한다");

  const parsedSnapshotTags = parseTravelTypeSnapshotTags([" 카페 ", "ＣＡＦＥ", "카페", "로컬"]);
  assert(parsedSnapshotTags.ok && parsedSnapshotTags.tags.join(",") === "카페,ＣＡＦＥ,로컬", "서버 성향 태그는 trim·Unicode 정규화 중복 제거 후 실제 값만 보존해야 한다");
  assert(!parseTravelTypeSnapshotTags("카페").ok && !parseTravelTypeSnapshotTags([" "]).ok, "서버 성향 태그가 존재하면 비어 있지 않은 문자열 배열만 허용해야 한다");
  assert(!parseTravelTypeSnapshotTags(Array.from({ length: 65 }, (_, index) => `tag-${index}`)).ok, "과도한 서버 성향 태그는 기기 분석 입력으로 받지 않아야 한다");
  assert(parseTravelTypeSnapshotTags(undefined).ok, "성향 태그 누락은 중립값이 아니라 빈 근거로 보존해야 한다");
  assert(parseTravelTypeSnapshotRecord(undefined).ok && parseTravelTypeSnapshotRecord(null).ok, "서버 성향 snapshot의 undefined/null만 미응답으로 허용해야 한다");
  assert(!parseTravelTypeSnapshotRecord("invalid").ok && !parseTravelTypeSnapshotRecord([]).ok, "존재하지만 객체가 아닌 서버 성향 snapshot을 조용히 누락시키면 안 된다");
  assert(hasDuplicateMemberIds(["owner", "owner"]) && !hasDuplicateMemberIds(["owner", "friend"]), "API 여행방 멤버 ID 중복을 계약 오류로 판별해야 한다");
  assert(selectPlanningTripsForCurrentUser(collection).map((item) => item.id).join(",") === "sooner,later", "진행 중 여행은 시작일 오름차순이며 중복 ID를 제거해야 한다");
  assert(selectCompletedTripsForCurrentUser(collection).map((item) => item.id).join(",") === "latestDone,olderDone", "완료 여행은 종료일 내림차순이어야 한다");
  assert(getTripDayCount("2026-08-01", "2026-08-02") === 2, "1박 2일은 달력일 2일이어야 한다");
  assert(getTripDayCount("2026-08-02", "2026-08-01") === undefined, "역전된 날짜 범위는 거부해야 한다");

  const validationContext = { regionsById: regions, usersById: users, currentUserId: "owner" };
  assert(validateCreateTripDraft(createDraft({ startDate: "2026-08-02", endDate: "2026-08-01" }), validationContext)?.includes("종료일"), "역전된 생성 날짜는 validation 오류여야 한다");
  assert(validateCreateTripDraft(createDraft({ dateUndecided: true, startDate: null, endDate: null }), validationContext) === undefined, "날짜 미정 Draft는 null/null 조합만 허용해야 한다");
  assert(validateCreateTripDraft(createDraft({ dateUndecided: true, startDate: "2026-08-01", endDate: null }), validationContext)?.includes("함께 저장"), "날짜 미정과 실제 범위를 함께 저장하면 안 된다");
  assert(validateCreateTripDraft(createDraft({ roomName: "   " }), validationContext)?.includes("이름"), "공백 여행방 이름은 거부해야 한다");
  assert(validateCreateTripDraft(createDraft({ transport: null }), validationContext)?.includes("이동 방식"), "새 여행방은 실제 이동 방식을 명시적으로 선택해야 한다");
  const endCondition = { type: "train" as const, location: "부산역", deadline: "18:30", travelMinutes: "45", serviceBufferMinutes: "30", note: "승강장 이동" };
  assert(validateCreateTripDraft(createDraft({ endCondition }), validationContext) === undefined, "완성된 종료 조건은 생성 validation을 통과해야 한다");
  assert(validateCreateTripDraft(createDraft({ endCondition: { ...endCondition, deadline: "18:07" } }), validationContext) === undefined, "종료 시각은 1분 단위 HH:mm을 허용해야 한다");
  assert(validateCreateTripDraft(createDraft({ endCondition: { ...endCondition, deadline: "18:60" } }), validationContext)?.includes("HH:mm"), "달력 시각으로 표현할 수 없는 종료 시각은 거부해야 한다");
  assert(validateCreateTripDraft(createDraft({ endCondition: { ...endCondition, travelMinutes: "" } }), validationContext)?.includes("이동시간"), "예상 이동시간은 빈 값일 수 없다");
  assert(validateCreateTripDraft(createDraft({ dateUndecided: true, startDate: null, endDate: null, endCondition }), validationContext)?.includes("종료 조건"), "날짜 미정 여행에는 종료 조건을 함께 저장하면 안 된다");
  assert(normalizeInvitedUserIds(["friend", "friend", "owner", "missing"], "owner", users).join(",") === "friend", "동행자는 중복·방장·없는 사용자를 제거해야 한다");

  const companionDirectory: Record<string, User> = {
    [DEMO_MEMBER_ID]: { id: DEMO_MEMBER_ID, name: "수민", initial: "수" },
    ...mockFriendProfiles,
    unrelated: { id: "unrelated", name: "무관 사용자", initial: "무" },
    guest: { id: "guest", name: "게스트", initial: "게" },
  };
  const demoFriendIds = resolveSavedFriendIds({}, DEMO_MEMBER_ID);
  assert(demoFriendIds.join(",") === MOCK_FRIEND_IDS.join(","), "데모 회원은 Friends 화면과 같은 명시적 친구 fixture를 사용해야 한다");
  assert(resolveSavedFriendIds({}, "fresh-member").length === 0, "신규 회원은 명시적 관계가 없으면 동행 후보가 0명이어야 한다");
  const eligibleCompanions = resolveEligibleCompanionUsers(demoFriendIds, DEMO_MEMBER_ID, companionDirectory);
  assert(eligibleCompanions.map((user) => user.id).join(",") === MOCK_FRIEND_IDS.join(","), "동행 후보는 canonical 친구 관계의 사용자만 포함해야 한다");
  const eligibleSelectedIds = filterEligibleCompanionUserIds(
    ["guest", MOCK_FRIEND_IDS[0], "unrelated", DEMO_MEMBER_ID, MOCK_FRIEND_IDS[0]],
    DEMO_MEMBER_ID,
    demoFriendIds,
  );
  assert(eligibleSelectedIds.join(",") === MOCK_FRIEND_IDS[0], "stale·무관·게스트·방장 ID는 동행 선택 경계에서 제거해야 한다");
  assert(normalizeInvitedUserIds(eligibleSelectedIds, DEMO_MEMBER_ID, companionDirectory).join(",") === MOCK_FRIEND_IDS[0], "최종 생성 payload에는 관계와 디렉터리를 모두 통과한 친구만 포함해야 한다");

  const migratedLegacyDraft = normalizeCreateTripDraft({ ...createDraft(), configVersion: 2, transport: "walking", budgetLevel: "premium", intensity: "packed" }).draft;
  assert(migratedLegacyDraft?.configVersion === CREATE_TRIP_DRAFT_VERSION && migratedLegacyDraft.transport === "public", "v2 walking 초안은 v3 대중교통·도보 사실값으로 이관해야 한다");
  assert(migratedLegacyDraft && !("budgetLevel" in migratedLegacyDraft) && !("intensity" in migratedLegacyDraft), "v3 생성 초안에는 개인 예산·밀도 성향을 이관하지 않아야 한다");
  const normalizedUndecidedDraft = normalizeCreateTripDraft({ ...createDraft({ endCondition }), dateUndecided: true, startDate: null, endDate: null }).draft;
  assert(normalizedUndecidedDraft?.endCondition === null, "persisted v3 초안도 날짜 미정이면 종료 조건을 제거해야 한다");
  const normalizedInvalidTransport = normalizeCreateTripDraft({ ...createDraft(), transport: "airplane" }).draft;
  assert(normalizedInvalidTransport?.transport === null, "v3 초안의 알 수 없는 이동 방식을 기본값으로 추측하면 안 된다");

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

  const baseDraft = createDraft({ accommodationLocation: "부산역 호텔", endCondition });
  const editCopy = createTripDraftEditCopy(baseDraft);
  editCopy.startDate = "2026-09-01";
  editCopy.endDate = "2026-09-01";
  assert(baseDraft.startDate === "2026-08-01", "edit local copy 변경은 원본 Draft를 바꾸지 않아야 한다");
  if (editCopy.endCondition) editCopy.endCondition.location = "부산종합버스터미널";
  assert(baseDraft.endCondition?.location === "부산역", "edit copy의 종료 조건 변경은 원본 nested 값을 바꾸지 않아야 한다");
  const dateCommit = getTripEditCommitPatch(1, editCopy);
  const committedDraft = { ...baseDraft, ...dateCommit };
  assert(committedDraft.startDate === "2026-09-01" && committedDraft.regionId === baseDraft.regionId && committedDraft.roomName === baseDraft.roomName, "날짜 수정 완료는 날짜만 반영하고 다른 값을 유지해야 한다");

  const regionOption = mapRegionToOption(regions.busan);
  const request = mapDraftToCreateTripRoomRequest(createDraft({ selectedMemberUserIds: ["friend"], accommodationLocation: "부산역 호텔", endCondition }), regionOption, ["friend"]);
  assert(request.name === "부산 여행" && request.regionId === "busan" && request.regionName === "부산광역시" && request.expectedMemberCount === 2, "Draft mapper는 이름·지역·실제 선택 인원을 request로 옮겨야 한다");
  assert(request.transport === "public" && request.accommodationLocation?.name === "부산역 호텔", "Draft mapper는 실제 이동 방식과 선택 숙소를 request로 옮겨야 한다");
  assert(request.endCondition?.location.name === "부산역" && request.endCondition.travelMinutes === 45 && request.endCondition.serviceBufferMinutes === 30, "Draft mapper는 종료 조건의 숫자형 사실 정보를 손실 없이 변환해야 한다");
  assert(!("budgetLevel" in request) && !("intensity" in request), "여행방 생성 request에는 개인 성향 필드를 포함하면 안 된다");
  assert(validateCreateTripRoomRequest(request) === undefined, "완성된 mock request는 service validation을 통과해야 한다");
  assert(validateCreateTripRoomRequest({ ...request, endCondition: request.endCondition ? { ...request.endCondition, deadline: "18:07" } : null }) === undefined, "service validation도 1분 단위 종료 시각을 보존해야 한다");
  assert(validateCreateTripRoomRequest({ ...request, dateUndecided: true, startDate: null, endDate: null })?.includes("종료 조건"), "service도 날짜 미정과 종료 조건의 동시 저장을 막아야 한다");
  const apiLocalFacts = parseApiTripLocalFacts({
    transport: "car",
    accommodationLocation: { name: " 부산역 호텔 ", address: " 부산 동구 " },
    endCondition: {
      type: "train",
      location: { name: "부산역" },
      deadline: "18:07",
      travelMinutes: 42,
      serviceBufferMinutes: 18,
    },
    companionType: " friends ",
    expectedMemberCount: 3,
    savedAt: "2026-08-19T00:00:00.000Z",
  });
  const apiLocalFactsScope = {
    roomId: "665abc123def456789012346",
    startDate: "2026-08-20",
    endDate: "2026-08-22",
  };
  assert(apiLocalFacts?.accommodationLocation?.name === "부산역 호텔" && apiLocalFacts.endCondition?.deadline === "18:07", "API 기기 사실은 중첩 위치·1분 마감 시각을 엄격 파싱해 보존해야 한다");
  assert(parseApiTripLocalFacts({ ...apiLocalFacts, endCondition: { ...apiLocalFacts?.endCondition, deadline: "18:60" } }) === null, "손상된 기기 종료 조건은 Workspace에 주입하지 않아야 한다");
  const storedApiLocalFacts = JSON.stringify({ version: 3, scope: apiLocalFactsScope, facts: apiLocalFacts });
  const loadedLocalFacts = parseStoredApiTripLocalFacts(storedApiLocalFacts, apiLocalFactsScope);
  assert(loadedLocalFacts.status === "loaded" && loadedLocalFacts.value.endCondition?.deadline === "18:07", "유효한 API 기기 사실 저장값은 loaded로 구분한다");
  assert(parseStoredApiTripLocalFacts(null, apiLocalFactsScope).status === "missing", "API 기기 사실 저장 키가 없을 때만 missing으로 구분한다");
  assert(parseStoredApiTripLocalFacts("{broken", apiLocalFactsScope).status === "unavailable"
    && parseStoredApiTripLocalFacts(JSON.stringify({ version: 3, scope: apiLocalFactsScope, facts: { ...apiLocalFacts, transport: "plane" } }), apiLocalFactsScope).status === "unavailable",
  "JSON 또는 schema가 손상된 API 기기 사실을 미설정으로 위장하지 않는다");
  assert(parseStoredApiTripLocalFacts(storedApiLocalFacts, { ...apiLocalFactsScope, endDate: "2026-08-23" }).status === "unavailable"
    && parseStoredApiTripLocalFacts(JSON.stringify(apiLocalFacts), apiLocalFactsScope).status === "unavailable",
  "여행 날짜 범위가 달라졌거나 scope 없는 구 저장값이면 과거 복귀 조건을 새 마지막 날에 적용하지 않는다");
  const failingFactsReader = { getItem: async () => { throw new Error("storage read failed"); } };
  const unavailableLocalFacts = await loadApiTripLocalFactsWithStatus("665abc123def456789012345", "665abc123def456789012346", apiLocalFactsScope, failingFactsReader);
  assert(unavailableLocalFacts.status === "unavailable", "API 기기 사실 read 실패를 unavailable로 보존한다");
  assert(await loadApiTripLocalFacts("665abc123def456789012345", "665abc123def456789012346", apiLocalFactsScope, failingFactsReader) === null, "기존 API 기기 사실 loader는 read 실패에도 null 호환 반환을 유지한다");
  const legacyFactsReader = { getItem: async (key: string) => key.includes(":v1:") ? JSON.stringify(apiLocalFacts) : null };
  assert((await loadApiTripLocalFactsWithStatus("665abc123def456789012345", "665abc123def456789012346", apiLocalFactsScope, legacyFactsReader)).status === "unavailable",
    "scope 없는 v1 저장값이 남아 있으면 missing이 아니라 사용자 확인이 필요한 unavailable로 구분한다");
  const removedFactsKeys: string[] = [];
  await clearApiTripLocalFacts("665abc123def456789012345", "665abc123def456789012346", apiLocalFactsScope, {
    removeItem: async (key) => { removedFactsKeys.push(key); },
  });
  assert(removedFactsKeys.length === 3
    && removedFactsKeys.some((key) => key.endsWith(":665abc123def456789012345:665abc123def456789012346:2026-08-20:2026-08-22"))
    && removedFactsKeys.some((key) => key.includes(":v1:"))
    && removedFactsKeys.some((key) => key.includes(":v2:")),
  "API 기기 사실 복구는 확인한 계정·여행방·날짜의 v3 key와 구형 v1/v2 key만 제거한다");

  const raceUserId = "665abc123def456789012345";
  const raceRoomId = "665abc123def456789012346";
  const factsWithoutSavedAt = {
    transport: "car" as const,
    accommodationLocation: null,
    endCondition: null,
    companionType: null,
    expectedMemberCount: null,
  };
  let firstWriteStartedResolve!: () => void;
  let releaseFirstWrite!: () => void;
  const firstWriteStarted = new Promise<void>((resolve) => { firstWriteStartedResolve = resolve; });
  const releaseFirst = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
  const sameScopeValues = new Map<string, string>();
  let sameScopeWriteCount = 0;
  const sameScopeWriter = {
    setItem: async (key: string, value: string) => {
      sameScopeWriteCount += 1;
      if (sameScopeWriteCount === 1) {
        firstWriteStartedResolve();
        await releaseFirst;
      }
      sameScopeValues.set(key, value);
    },
  };
  const firstSameScopeSave = saveApiTripLocalFacts(raceUserId, raceRoomId, apiLocalFactsScope, factsWithoutSavedAt, sameScopeWriter);
  await firstWriteStarted;
  const secondSameScopeSave = saveApiTripLocalFacts(raceUserId, raceRoomId, apiLocalFactsScope, {
    ...factsWithoutSavedAt,
    transport: "public",
  }, sameScopeWriter);
  await Promise.resolve();
  assert(sameScopeWriteCount === 1, "같은 user·room·date key의 두 번째 저장은 첫 저장 완료 전 storage에 진입하면 안 된다");
  releaseFirstWrite();
  await Promise.all([firstSameScopeSave, secondSameScopeSave]);
  const sameScopeStored = [...sameScopeValues.values()][0];
  assert(sameScopeValues.size === 1
    && sameScopeStored
    && parseStoredApiTripLocalFacts(sameScopeStored, apiLocalFactsScope).value?.transport === "public",
  "같은 범위의 동시 저장은 호출 순서대로 직렬화되어 마지막 요청이 최종값이어야 한다");

  let pendingSetStartedResolve!: () => void;
  let releasePendingSet!: () => void;
  const pendingSetStarted = new Promise<void>((resolve) => { pendingSetStartedResolve = resolve; });
  const pendingSetGate = new Promise<void>((resolve) => { releasePendingSet = resolve; });
  const saveClearValues = new Map<string, string>();
  const saveClearStorage = {
    setItem: async (key: string, value: string) => {
      pendingSetStartedResolve();
      await pendingSetGate;
      saveClearValues.set(key, value);
    },
    removeItem: async (key: string) => { saveClearValues.delete(key); },
  };
  const pendingSave = saveApiTripLocalFacts(raceUserId, raceRoomId, apiLocalFactsScope, factsWithoutSavedAt, saveClearStorage);
  await pendingSetStarted;
  const pendingClear = clearApiTripLocalFacts(raceUserId, raceRoomId, apiLocalFactsScope, saveClearStorage);
  releasePendingSet();
  await Promise.all([pendingSave, pendingClear]);
  assert(saveClearValues.size === 0, "초기화는 같은 key의 진행 중 저장 뒤에 직렬화되어 지운 값이 되살아나면 안 된다");

  let oldScopeWriteStartedResolve!: () => void;
  let releaseOldScopeWrite!: () => void;
  const oldScopeWriteStarted = new Promise<void>((resolve) => { oldScopeWriteStartedResolve = resolve; });
  const releaseOldScope = new Promise<void>((resolve) => { releaseOldScopeWrite = resolve; });
  const dateScopedValues = new Map<string, string>();
  const oldScope = { startDate: "2026-08-20", endDate: "2026-08-22" };
  const newScope = { startDate: "2026-08-20", endDate: "2026-08-23" };
  const dateScopedWriter = {
    setItem: async (key: string, value: string) => {
      if (key.endsWith(":2026-08-20:2026-08-22")) {
        oldScopeWriteStartedResolve();
        await releaseOldScope;
      }
      dateScopedValues.set(key, value);
    },
  };
  const oldScopeSave = saveApiTripLocalFacts(raceUserId, raceRoomId, oldScope, factsWithoutSavedAt, dateScopedWriter);
  await oldScopeWriteStarted;
  await saveApiTripLocalFacts(raceUserId, raceRoomId, newScope, { ...factsWithoutSavedAt, transport: "public" }, dateScopedWriter);
  releaseOldScopeWrite();
  await oldScopeSave;
  assert(dateScopedValues.size === 2
    && [...dateScopedValues.keys()].some((key) => key.endsWith(":2026-08-20:2026-08-22"))
    && [...dateScopedValues.keys()].some((key) => key.endsWith(":2026-08-20:2026-08-23")),
  "느린 과거 날짜 저장과 새 날짜 저장은 서로 다른 v3 key라 값을 덮어쓰지 않는다");
  const newScopeReads: string[] = [];
  const newScopeLoaded = await loadApiTripLocalFactsWithStatus(raceUserId, raceRoomId, newScope, {
    getItem: async (key) => {
      newScopeReads.push(key);
      return dateScopedValues.get(key) ?? null;
    },
  });
  assert(newScopeLoaded.status === "loaded"
    && newScopeLoaded.value.transport === "public"
    && newScopeReads.every((key) => !key.endsWith(":2026-08-20:2026-08-22")),
  "현재 범위 loader는 다른 날짜의 orphan v3 key를 읽거나 자동 적용하지 않는다");
  let invalidMapperRejected = false;
  try { mapDraftToCreateTripRoomRequest(createDraft({ endCondition: { ...endCondition, travelMinutes: "" } }), regionOption, []); } catch { invalidMapperRejected = true; }
  assert(invalidMapperRejected, "mapper를 직접 호출해도 빈 예상 이동시간을 숫자 0으로 위장하면 안 된다");

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
  const apiRegion = (await createRegionService("api", Object.values(regions)).searchRegions("부산"))[0];
  assert(apiRegion?.source === "reference" && apiRegion.areaCode === "6", "API 생성 화면은 검증된 TourAPI 지역 코드 reference를 사용해야 한다");

  const progress = calculateTripPreparationProgress({ trip: tripsById.sooner, completedPreferenceCount: 1, preferenceTargetCount: 2, candidateCount: 2, itineraryCount: 0 });
  assert(progress.totalSteps === 5 && progress.completedSteps === 1 && progress.activeSteps === 2 && progress.rate === 0.4, "준비율은 완료 1점·진행 0.5점 기준이어야 한다");
  const selectorSource = { ...collection, usersById: users, regionsById: regions, candidatesByTripId: {}, itineraryByTripId: {}, preferenceResultsByUserId: {} };
  assert(selectTripRoomCardViewModel(selectorSource, "missing") === undefined, "없는 tripId의 ViewModel은 undefined여야 한다");
  const card = selectTripRoomCardViewModel(selectorSource, "sooner", "2026-07-31");
  assert(card?.memberCount === 1 && card.timingLabel === "D-1" && card.destinationName === "부산", "카드 ViewModel은 관계와 D-day를 파생해야 한다");
  const ownerPreferenceResult: UserPreferenceResult = {
    userId: "owner",
    answers: { pace: 1, budget: 1, mobility: 1, activity: 1, mealStyle: 1, planningStyle: 1 },
    profileType: "legacy-owner-label",
    traits: ["균형"],
    preferredTags: ["산책"],
    completedAt: "2026-08-30T12:00:00.000Z",
    version: PERSONAL_TEST_VERSION,
  };
  const rawPreferenceSummary = selectRoomPreferenceResponseSummary({
    ...selectorSource,
    preferenceResultsByUserId: { owner: ownerPreferenceResult },
  }, "sooner");
  const canonicalPreferenceSummary = selectRoomPreferenceResponseSummary({
    ...selectorSource,
    canonicalPreferenceTitlesByUserId: { owner: "canonical-owner-label" },
    preferenceResultsByUserId: { owner: ownerPreferenceResult },
  }, "sooner");
  assert(
    rawPreferenceSummary.members[0]?.profileType === "legacy-owner-label"
      && canonicalPreferenceSummary.members[0]?.profileType === "canonical-owner-label"
      && canonicalPreferenceSummary.completedCount === rawPreferenceSummary.completedCount
      && canonicalPreferenceSummary.coverage === rawPreferenceSummary.coverage,
    "Trip Home 개인 label만 canonical presentation으로 교체하고 응답·그룹 coverage 계약은 유지해야 한다",
  );

  const firstInvite = createTripInviteRecord("sooner", 1);
  const rotatedInvite = createTripInviteRecord("sooner", 2);
  assert(firstInvite.code.length === 8 && firstInvite.code === createMockTripInviteCode("sooner", 1), "초대 코드는 여행방과 revision으로부터 결정적으로 생성되어야 한다");
  assert(rotatedInvite.code !== firstInvite.code && rotatedInvite.revision === 2, "새 링크 발급은 revision과 코드를 함께 바꿔야 한다");
  assert(buildTripInviteUrl(firstInvite) === `tripmatch://invite/${firstInvite.code}?tripId=sooner&revision=1`, "초대 링크는 코드·여행방·revision을 모두 전달해야 한다");
  const webShareData = buildWebInviteShareData({ inviteUrl: buildTripInviteUrl(firstInvite), tripTitle: "부산 여행", code: firstInvite.code });
  assert(!("url" in webShareData) && webShareData.text.includes(buildTripInviteUrl(firstInvite)), "Web Share는 custom scheme을 url 필드가 아닌 text로 전달해야 한다");

  const activeLinks = { sooner: firstInvite };
  const explicitInvite = resolveMockTripInvite({ code: firstInvite.code, tripId: "sooner", revision: "1" }, tripsById, activeLinks);
  assert(explicitInvite.status === "success" && explicitInvite.trip.id === "sooner", "활성 공유 링크는 지정한 여행방으로 해석되어야 한다");
  const manualInvite = resolveMockTripInvite({ code: firstInvite.code }, tripsById, activeLinks);
  assert(manualInvite.status === "success" && manualInvite.trip.id === "sooner", "활성 초대 코드는 수동 입력으로도 같은 여행방을 찾아야 한다");
  assert(resolveMockTripInvite({ code: firstInvite.code, tripId: "sooner", revision: 1 }, tripsById, { sooner: rotatedInvite }).status === "stale", "교체 전 링크는 최신 링크가 존재하면 거부해야 한다");
  assert(resolveMockTripInvite({ code: rotatedInvite.code, tripId: "sooner", revision: 2 }, tripsById, { sooner: { ...rotatedInvite, status: "disabled" } }).status === "disabled", "사용 중지한 링크는 참여를 거부해야 한다");
  const completedInvite = createTripInviteRecord("latestDone", 1);
  assert(resolveMockTripInvite({ code: completedInvite.code, tripId: "latestDone", revision: 1 }, tripsById, { latestDone: completedInvite }).status === "closed", "완료 여행방 초대는 활성 코드여도 거부해야 한다");
  assert(resolveMockTripInvite({ code: "AAAAAAAA", tripId: "sooner", revision: 1 }, tripsById, {}).status === "invalid", "위조된 code와 여행방 조합은 거부해야 한다");

  console.log("Trip flow verification passed: creation, date, edit, mapper, service, region, sorting, ViewModel, and invite lifecycle checks");
}

void main().catch((error: unknown) => { throw error; });
