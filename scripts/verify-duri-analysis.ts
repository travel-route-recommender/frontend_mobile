import type { ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../src/domain";
import { analyzeDensity, isMealPlace } from "../src/duri/duri-analysis";
import type { ConfirmedScheduleConstraint, DuriAnalysisInput, PlaceCongestionEvidence, RouteLegEstimate } from "../src/duri/duri-analysis";
import { buildItineraryFingerprint, generateSuggestionId } from "../src/duri/duri-suggestions";
import type { DuriSuggestion, ScheduleChangePreview } from "../src/duri/duri-suggestions";
import { DURI_SUGGESTION_VERSION } from "../src/features/duri/constants";
import { analyzeCandidateUsage, analyzeDayBalance, analyzeEndCondition, analyzeOvernightRecovery, analyzeTimeConflicts, calculateAnalysisCoverage } from "../src/features/duri/logic/analysisContext";
import { buildApiDuriAnalysisInput } from "../src/features/duri/logic/apiAnalysisInput";
import { buildDuriAnalysisInputWithDocuments, isDuriAnalysisCompletionCurrent } from "../src/features/duri/logic/analysisInput";
import { isDuriAnalysisEntryBlocked } from "../src/features/duri/logic/analysisEntry";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability, isSuggestionStale } from "../src/features/duri/logic/analysisSnapshot";
import { apiScheduleMatchesProposal, restoreProposalLocalOverlays } from "../src/features/duri/logic/apiApplyReconciliation";
import { analyzePlaceCongestionConstraints, analyzePlaceOperatingConstraints, analyzePlacePracticalConstraints, analyzeRecommendedDurations, hasEvaluableOperatingFactForDate, parseExplicitParkingAvailability, parseOperatingWindows, parseRecommendedDurationMinutes } from "../src/features/duri/logic/placeConstraintAnalysis";
import { analyzePreferenceConstraints } from "../src/features/duri/logic/preferenceConstraintAnalysis";
import { plainDuriUserText } from "../src/features/duri/presentation/plainDuriUserText";
import { buildScheduledRouteLegs, collectCarRouteEvidence, isRouteOptimizationFixedItem } from "../src/features/duri/logic/routeEvidence";
import { analyzeConfirmedScheduleConstraints, analyzeDocumentReferences, analyzeDuplicateVisits, analyzeRouteCostEvidence, analyzeRouteOptimization, analyzeRouteTimeConstraints } from "../src/features/duri/logic/scheduleConstraintAnalysis";
import { generateDuriSuggestions } from "../src/features/duri/logic/suggestionGeneration";
import { getDuriItemProtection } from "../src/features/duri/logic/suggestionProtection";
import { createDuriSuggestionPreview, diffItinerarySnapshots } from "../src/features/duri/logic/suggestionPreview";
import { buildDuriAnalysisInputFromState } from "../src/features/duri/selectors/duriSelectors";
import { enrichDuriAnalysisInput, enrichPreferenceAutoFillCandidateEvidence, normalizeTourCongestionDays } from "../src/features/duri/services/duriEvidenceService";
import { useDuriAnalysisStore } from "../src/features/duri/store/useDuriAnalysisStore";
import type { DuriInputSource, DuriSuggestionEnvelope } from "../src/features/duri/types";
import { prepareDuriSuggestionAtomicApply, validateDuriSuggestion } from "../src/features/duri/validation/atomicSuggestionApply";
import {
  confirmTravelDocumentFact,
  extractTravelDocumentFactsFromText,
} from "../src/features/trip-documents/logic/documentExtraction";
import type { TravelDocument } from "../src/features/trip-documents/types";
import { analyzeTripEndCondition, buildTripEndConditionAdjustment, resolveTripEndConditionMutation } from "../src/features/workspace/logic/tripEndCondition";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const plainInternalTerms = plainDuriUserText("rule-based-4axis · Kemeny · Pareto 효율 · Nash 후생 · leximin · MST · 2-opt · 1-swap");
assert(!/rule-based-4axis|Kemeny|Pareto|Nash|leximin|\bMST\b|2-opt|1-swap/i.test(plainInternalTerms), "일반 화면용 문구에서 내부 계산 명칭을 제거한다");
assert(plainDuriUserText("Nashville · Capital Hotel · The Local") === "Nashville · Capital Hotel · The Local", "장소명 일부를 내부 용어로 오인해 바꾸지 않는다");

useDuriAnalysisStore.getState().clearAll();
assert(useDuriAnalysisStore.getState().beginAnalysis("cancelled-trip"), "cancelled analysis fixture must start");
useDuriAnalysisStore.getState().cancelAnalysis("cancelled-trip");
assert(useDuriAnalysisStore.getState().analysisStatusByTripId["cancelled-trip"] === "idle"
  && useDuriAnalysisStore.getState().analysisErrorByTripId["cancelled-trip"] === undefined,
"an intentional analysis cancellation must return to idle without a visible failure");
useDuriAnalysisStore.getState().clearAll();

const users: Record<string, User> = {
  owner: { id: "owner", name: "수민", initial: "수" },
  friend: { id: "friend", name: "지윤", initial: "지" },
  third: { id: "third", name: "민재", initial: "민" },
  outsider: { id: "outsider", name: "외부", initial: "외" },
};

function place(id: string, category = "명소", address = "부산 중구 중앙동", tags = ["산책"]): Place {
  return { id, regionId: "busan", name: id, category, tags, rating: 4.5, distanceLabel: "", imageUrl: "", address, summary: id };
}

const places: Record<string, Place> = Object.fromEntries([
  place("a", "명소", "부산 중구 중앙동"),
  place("b", "명소", "부산 해운대구 우동"),
  place("c", "명소", "부산 중구 남포동"),
  place("d"), place("e"), place("f"), place("g"), place("h"),
  place("meal", "식당", "부산 중구 중앙동", ["맛집", "한식"]),
  place("shared", "카페", "부산 수영구 광안동", ["카페", "바다"]),
].map((entry) => [entry.id, entry]));

function trip(status: TripRoom["status"] = "planning"): TripRoom {
  return {
    id: "trip",
    title: "부산 여행",
    regionId: "busan",
    startDate: "2026-07-18",
    endDate: "2026-07-19",
    status,
    transport: "public",
    budgetLevel: "standard",
    intensity: "balanced",
    members: [{ userId: "owner", role: "owner" }, { userId: "friend", role: "member" }, { userId: "third", role: "member" }],
  };
}

function item(id: string, placeId: string, date: string, startTime: string, durationMinutes = 60, preferredByUserIds = ["owner"]): ItineraryItem {
  return { id, tripId: "trip", placeId, date, startTime, durationMinutes, itemType: "place", preferredByUserIds };
}

function preference(userId: string): UserPreferenceResult {
  return {
    userId,
    answers: { pace: 0, budget: 1, mobility: 0, activity: 1, mealStyle: 1, planningStyle: 1 },
    profileType: "여유형",
    traits: ["산책"],
    preferredTags: ["산책", "카페"],
    completedAt: "2026-07-01",
    version: 1,
  };
}

function candidate(placeId: string, addedByUserIds = ["owner"]): TripCandidate {
  return { tripId: "trip", placeId, addedByUserIds, recommendedByDuri: false };
}

function travelDocument(id: string, tripId = "trip"): TravelDocument {
  return {
    id,
    tripId,
    itineraryItemIds: [],
    kind: "admission",
    displayName: `${id}.png`,
    fileName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 1_024,
    localUri: `file:///documents/${id}.png`,
    storage: "native-private",
    createdByUserId: "owner",
    createdAt: "2026-07-10T00:00:00.000Z",
  };
}

function state(overrides: Partial<DuriInputSource> = {}): DuriInputSource {
  return {
    currentUserId: "owner",
    usersById: users,
    placesById: places,
    tripsById: { trip: trip(), other: { ...trip(), id: "other", title: "다른 여행" } },
    candidatesByTripId: { trip: [candidate("a"), candidate("b"), candidate("c"), candidate("d"), candidate("e"), candidate("meal"), candidate("shared", ["owner", "friend"])], other: [] },
    itineraryByTripId: { trip: [], other: [{ ...item("other-i", "h", "2026-07-18", "10:00"), tripId: "other" }] },
    preferenceResultsByUserId: {},
    ...overrides,
  };
}

function snapshotFor(source: DuriInputSource) {
  const input = buildDuriAnalysisInputFromState(source, "trip");
  assert(input, "trip input");
  return createDuriAnalysisSnapshot(input);
}

const apiScheduleData = {
  room: {
    id: "trip",
    title: "API 부산 여행",
    startDate: "2026-07-18",
    endDate: "2026-07-19",
    status: "planning" as const,
    members: [{ userId: "owner", role: "owner" as const }, { userId: "friend", role: "member" as const }],
    factsVersion: 5,
  },
  region: { id: "busan", name: "부산", shortName: "부산", description: "바다", spots: 2, weather: "맑음", imageUrl: "busan" },
  usersById: users,
  candidates: [candidate("a")],
  placesById: places,
  scheduleSnapshot: {
    scope: { roomId: "trip", tripId: "trip", startDate: "2026-07-18", endDate: "2026-07-19" },
    itinerary: [item("api-item", "a", "2026-07-18", "10:00")],
    metadataByItemId: {
      "api-item": {
        itemId: "api-item",
        placeName: "a",
        tags: ["명소"],
        reason: "",
        priority: "optional" as const,
        locked: false,
        tickets: [{
          id: "ticket-1",
          imageUrl: "/ticket.png",
          uploadedBy: "owner",
          createdAt: "2026-07-10T00:00:00.000Z",
        }],
      },
    },
    priorityProtectionsByItemId: {},
    scheduleVersion: 7,
  },
  localFacts: null,
  localFactsStatus: "missing" as const,
  workspaceOverlayStatus: "missing" as const,
  sharedPreferenceEvidenceStatus: "loaded" as const,
  sharedPreferenceEvidence: {
    roomId: "trip",
    factsVersion: 5,
    scheduleVersion: 7,
    members: ["owner", "friend"].map((userId, index) => ({
      userId,
      nickname: users[userId].name,
      travelType: null,
      personalityAxes: {
        scheduleDensity: { value: index ? 80 : 20, unit: "score" as const, range: [0, 100] as const, resolution: 1, source: "quiz" as const, method: "rule-based-4axis" as const },
        landmarkNecessity: { value: index ? 70 : 30, unit: "score" as const, range: [0, 100] as const, resolution: 1, source: "quiz" as const, method: "rule-based-4axis" as const },
        localInterest: { value: index ? 30 : 70, unit: "score" as const, range: [0, 100] as const, resolution: 1, source: "quiz" as const, method: "rule-based-4axis" as const },
        challenging: { value: index ? 60 : 40, unit: "score" as const, range: [0, 100] as const, resolution: 1, source: "quiz" as const, method: "rule-based-4axis" as const },
      },
      mobilityConstraints: { values: [], status: "missing" as const, source: "user", version: 1, updatedAt: null },
      preferenceUpdatedAt: "2026-07-01T00:00:00.000Z",
      interestTags: [],
    })),
    candidateSignals: [{
      placeId: "a",
      signals: [
        { userId: "owner", mustVisit: true, avoid: null, preferenceStrength: 5 as const, version: 1, updatedAt: null },
        { userId: "friend", mustVisit: null, avoid: true, preferenceStrength: null, version: 1, updatedAt: null },
      ],
    }],
  },
};
const apiAnalysisInput = buildApiDuriAnalysisInput(apiScheduleData, "owner");
assert(apiAnalysisInput, "API schedule snapshot should build a Duri input");
const proposedApiItinerary = apiScheduleData.scheduleSnapshot.itinerary.map((entry) => ({
  ...entry,
  placeId: "507f1f77bcf86cd799439011",
  startTime: "11:00",
  note: "동행자 의견 반영",
  preferredByUserIds: ["friend"],
  lockedForDuri: true,
}));
const proposedApiMetadata = {
  "api-item": {
    ...apiScheduleData.scheduleSnapshot.metadataByItemId["api-item"],
    reason: "동행자 의견 반영",
  },
};
const appliedApiSnapshot = {
  ...apiScheduleData.scheduleSnapshot,
  itinerary: proposedApiItinerary,
  metadataByItemId: {
    "api-item": { ...proposedApiMetadata["api-item"], locked: true },
  },
  scheduleVersion: 8,
};
assert(apiScheduleMatchesProposal(appliedApiSnapshot, {
  itinerary: proposedApiItinerary,
  metadataByItemId: proposedApiMetadata,
}), "응답이 끊겨도 서버의 저장 필드가 제안 post-state와 같으면 적용 성공으로 복구한다");
assert(!apiScheduleMatchesProposal({
  ...appliedApiSnapshot,
  itinerary: appliedApiSnapshot.itinerary.map((entry) => ({ ...entry, startTime: "11:15" })),
}, {
  itinerary: proposedApiItinerary,
  metadataByItemId: proposedApiMetadata,
}), "서버 일정 시각이 제안과 다르면 적용 성공으로 오판하지 않는다");
const restoredApiSnapshot = restoreProposalLocalOverlays(appliedApiSnapshot, proposedApiItinerary);
assert(restoredApiSnapshot.itinerary[0]?.preferredByUserIds[0] === "friend"
  && restoredApiSnapshot.itinerary[0]?.itemType === "place"
  && restoredApiSnapshot.itinerary[0]?.lockedForDuri === true,
"응답 유실 복구 시 서버 사실은 유지하고 기기 전용 제안 overlay를 복원한다");
assert(Object.keys(apiAnalysisInput.preferenceResults).length === 0, "API 분석은 서버에 없는 상세 성향을 중립값이나 mock으로 채우지 않는다");
assert(apiAnalysisInput.documentReferences?.[0]?.kind === "other"
  && apiAnalysisInput.documentReferences[0].extractionStatus === "not-requested"
  && apiAnalysisInput.documentReferences[0].orderProtected === true,
"서버 티켓 존재를 예약 종류·확정 사실로 추정하지 않되 연결 일정의 자동 재배치는 보호한다");
assert(apiAnalysisInput.localPlanningFactsStatus === "missing"
  && apiAnalysisInput.scheduleOverlayStatus === "missing",
"API 로컬 계획 사실과 잠금 overlay의 미설정 상태를 분석 입력에 보존한다");
assert(apiAnalysisInput.sourceFactsVersion === 5
  && apiAnalysisInput.sharedPreferenceEvidenceStatus === "loaded"
  && apiAnalysisInput.sharedPreferenceEvidence?.members[0].personalityAxes?.scheduleDensity.value === 20,
"API factsVersion과 별도 공유 파생 성향을 UserPreferenceResult로 변환하지 않고 보존한다");
const sharedPreferenceIssues = analyzePreferenceConstraints(createDuriAnalysisSnapshot(apiAnalysisInput), "2026-07-01T00:00:00.000Z");
assert(sharedPreferenceIssues.some((issue) => issue.id.startsWith("shared-candidate-signal-conflict-")
  && issue.constraintType === "hard"
  && issue.confidence === "high"),
"공유 mustVisit/avoid 충돌을 고신뢰 문제로 노출한다");
assert(sharedPreferenceIssues.some((issue) => issue.id.startsWith("shared-derived-axis-")
  && issue.evidence.some((entry) => entry.value.includes("여행 성향 응답을 바탕으로 계산"))
  && !issue.evidence.some((entry) => entry.value.includes("rule-based-4axis"))),
"공유 성향 차이는 측정 범위를 보존하되 내부 산출 방식 이름을 사용자 근거에 노출하지 않는다");
assert(createDuriAnalysisSession(apiAnalysisInput, "2026-07-01T00:00:00.000Z").groupInsights
  .some((insight) => insight.id === "group-coverage-shared-derived" && insight.description.includes("원본 상세 설문")),
"원본 설문 미응답을 완료로 꾸미지 않으면서 공유 파생 근거 사용 범위를 설명한다");
const sharedFingerprint = createDuriInputFingerprint(apiAnalysisInput);
assert(sharedFingerprint !== createDuriInputFingerprint({
  ...apiAnalysisInput,
  sharedPreferenceEvidence: {
    ...apiAnalysisInput.sharedPreferenceEvidence!,
    factsVersion: 6,
  },
}), "공유 facts revision 변경은 분석 fingerprint를 stale로 만든다");
const unavailableApiAuxiliaryInput = buildApiDuriAnalysisInput({
  ...apiScheduleData,
  localFacts: {
    transport: "car",
    accommodationLocation: null,
    endCondition: {
      type: "train",
      location: { name: "부산역" },
      deadline: "18:00",
      travelMinutes: 30,
      serviceBufferMinutes: 20,
    },
    companionType: null,
    expectedMemberCount: null,
    savedAt: "2026-07-10T00:00:00.000Z",
  },
  localFactsStatus: "unavailable",
  workspaceOverlayStatus: "unavailable",
}, "owner");
assert(unavailableApiAuxiliaryInput
  && unavailableApiAuxiliaryInput.trip.endCondition === null
  && unavailableApiAuxiliaryInput.localPlanningFactsStatus === "missing"
  && analyzeEndCondition(createDuriAnalysisSnapshot(unavailableApiAuxiliaryInput)).length === 0
  && createDuriInputFingerprint(apiAnalysisInput) !== createDuriInputFingerprint(unavailableApiAuxiliaryInput),
"로컬 계획 사실이나 잠금 overlay를 읽지 못하면 이전 분석을 stale로 만든다");
const unavailableFactsCoverage = calculateAnalysisCoverage(createDuriAnalysisSnapshot({
  ...unavailableApiAuxiliaryInput!,
  evidenceCollection: {
    route: { requiredLegCount: 1, analyzedLegCount: 1, mode: "car", provider: "kakao-mobility" },
    placeDetails: { scheduledPlaceCount: 1, requestedPlaceCount: 0, fetchedPlaceCount: 0, usablePlaceCount: 0, operatingFactPlaceCount: 0, durationFactPlaceCount: 0 },
  },
}));
assert(unavailableFactsCoverage.routeData === "unavailable"
  && unavailableFactsCoverage.routeMessage.includes("설정되지 않아"),
"공유 planning에 이동수단이 없으면 기기 값으로 보완하지 않고 주입된 이전 경로 근거도 available로 표시하지 않는다");
const inconsistentLoadedFactsInput = buildApiDuriAnalysisInput({
  ...apiScheduleData,
  localFacts: null,
  localFactsStatus: "loaded",
}, "owner");
assert(inconsistentLoadedFactsInput?.localPlanningFactsStatus === "missing"
  && inconsistentLoadedFactsInput.trip.transport === "public",
"기기 localFacts loaded 표시는 API 공유 planning의 이동수단 근거로 승격하지 않는다");
const versionedPlanningValue = <T,>(value: T) => ({
  value,
  updatedBy: "owner",
  updatedAt: "2026-07-01T00:00:00.000Z",
  confirmedAt: "2026-07-01T00:00:00.000Z",
  version: 1,
});
const serverPlanningInput = buildApiDuriAnalysisInput({
  ...apiScheduleData,
  scheduleSnapshot: {
    ...apiScheduleData.scheduleSnapshot,
    planning: {
      timezone: "Asia/Seoul",
      transportMode: versionedPlanningValue("car" as const),
      lodging: { name: "해운대 숙소", source: "manual" as const },
      returnPoint: { name: "부산역", source: "manual" as const },
      returnDeadline: versionedPlanningValue("18:00"),
      travelBufferMinutes: versionedPlanningValue(35),
      prepBufferMinutes: versionedPlanningValue(20),
    },
    metadataByItemId: {
      ...apiScheduleData.scheduleSnapshot.metadataByItemId,
      "api-item": {
        ...apiScheduleData.scheduleSnapshot.metadataByItemId["api-item"],
        reservation: {
          id: "reservation-1",
          status: "confirmed" as const,
          date: "2026-07-18",
          startTime: "10:00",
          endTime: "11:00",
          placeId: "a",
          documentTicketIds: ["ticket-1"],
          confirmedBy: "owner",
          confirmedAt: "2026-07-01T00:00:00.000Z",
          revision: 2,
        },
      },
    },
  },
}, "owner");
assert(serverPlanningInput?.localPlanningFactsStatus === "loaded"
  && serverPlanningInput.trip.transport === "car"
  && serverPlanningInput.trip.accommodationLocation?.name === "해운대 숙소"
  && serverPlanningInput.trip.endCondition?.location.name === "부산역",
"공유 Backend planning transport가 있으면 loaded로 판정하고 숙소·복귀 조건을 분석 입력에 연결한다");
assert(serverPlanningInput.confirmedScheduleConstraints?.some((constraint) => (
  constraint.id === "server-reservation:reservation-1"
  && constraint.itineraryItemId === "api-item"
  && constraint.startTime === "10:00"
  && constraint.endTime === "11:00"
  && constraint.source === "user-confirmed"
)), "Backend confirmed reservation을 임의 추정 없이 확정 일정 제약으로 변환한다");
const changedApiVersionInput = buildApiDuriAnalysisInput({
  ...apiScheduleData,
  scheduleSnapshot: { ...apiScheduleData.scheduleSnapshot, scheduleVersion: 8 },
}, "owner");
assert(changedApiVersionInput
  && changedApiVersionInput.sharedPreferenceEvidenceStatus === "stale"
  && changedApiVersionInput.sharedPreferenceEvidence === undefined
  && calculateAnalysisCoverage(createDuriAnalysisSnapshot(changedApiVersionInput)).limitations.some((message) => message.includes("오래된 내용은 이번 분석에 사용하지 않았어요"))
  && createDuriInputFingerprint(apiAnalysisInput) !== createDuriInputFingerprint(changedApiVersionInput),
"API 일정 내용이 같아도 scheduleVersion 변경은 이전 분석을 stale로 만든다");
assert(!buildApiDuriAnalysisInput({
  ...apiScheduleData,
  scheduleSnapshot: { ...apiScheduleData.scheduleSnapshot, scope: { ...apiScheduleData.scheduleSnapshot.scope, roomId: "other" } },
}, "owner"), "다른 room scope의 서버 일정을 분석 입력에 섞지 않는다");

function inputFor(source: DuriInputSource) {
  const input = buildDuriAnalysisInputFromState(source, "trip");
  assert(input, "trip input");
  return input;
}

// Analysis: 25 required scenarios.
const empty = state();
const emptyAvailability = getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(empty, "trip"), engineAvailable: true });
assert(emptyAvailability.status === "no-itinerary" && emptyAvailability.canAnalyze, "analysis 1: empty itinerary can enter analysis and auto-fill mode");
assert(!isDuriAnalysisEntryBlocked({ loading: false, engineAvailable: true, hasExistingSession: false }), "analysis 1b: workspace entry must not block an empty itinerary");
const one = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00")], other: [] } });
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(one, "trip"), engineAvailable: true }).status === "limited", "analysis 2: one item limited");
const conflict = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00", 90), item("i2", "b", "2026-07-18", "11:00")], other: [] } });
assert(analyzeTimeConflicts(snapshotFor(conflict)).length === 1, "analysis 3: overlapping items");
const touching = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00"), item("i2", "b", "2026-07-18", "11:00")], other: [] } });
assert(analyzeTimeConflicts(snapshotFor(touching)).length === 0, "analysis 4: touching ranges");
const denseItems = ["a", "b", "c", "d", "e"].map((placeId, index) => item(`dense-${index}`, placeId, "2026-07-18", `${String(8 + index).padStart(2, "0")}:00`));
const densityPreference = (userId: string): UserPreferenceResult => ({
  ...preference(userId),
  detailedSignals: {
    surveyVersion: 9,
    algorithmVersion: 9,
    staminaScore: 40,
    densityScore: 30,
    scheduleStyle: "relaxed",
    preferredDailyScheduledMinutes: 180,
    preferredDailyScheduledResolutionMinutes: 30,
    preferredAverageActivityBlockMinutes: 60,
    preferredAverageActivityBlockResolutionMinutes: 30,
    mobilityModes: ["walk"],
    categoryScores: {},
    budgetRanking: [],
    landmarkImportance: 0,
    localInterest: 0,
  },
});
const denseSnapshot = snapshotFor(state({
  itineraryByTripId: { trip: denseItems, other: [] },
  preferenceResultsByUserId: { owner: densityPreference("owner"), friend: densityPreference("friend"), third: densityPreference("third") },
}));
const robustDensityIssue = analyzeDensity(denseSnapshot).issues[0];
assert(robustDensityIssue?.severity === "medium"
  && robustDensityIssue.affectedMemberIds.length === 3
  && robustDensityIssue.technicalDetails?.formulaLatex.includes("R_{u,d}"),
"analysis 5: direct preference intervals, not place-count magic, detect excessive load for all observed members");
assert(analyzeDayBalance(denseSnapshot).issues.length === 0 && analyzeDayBalance(denseSnapshot).metrics.length === 2, "analysis 6: day balance is descriptive and does not invent a fixed count threshold");
assert(isMealPlace(places.meal), "analysis 7: meal category");
assert(!isMealPlace(places.a), "analysis 8: non-meal category");
assert(calculateAnalysisCoverage(snapshotFor(touching)).routeData === "unavailable", "analysis 9: no coordinates");
const partialPlaces = { ...places, a: { ...places.a, latitude: 35.1, longitude: 129.1 } as Place };
const partialCoverageInput = inputFor(state({ placesById: partialPlaces, itineraryByTripId: touching.itineraryByTripId }));
assert(calculateAnalysisCoverage(createDuriAnalysisSnapshot({ ...partialCoverageInput, evidenceCollection: { route: { requiredLegCount: 1, analyzedLegCount: 0, mode: "public", unavailableReason: "test" }, placeDetails: { scheduledPlaceCount: 2, requestedPlaceCount: 0, fetchedPlaceCount: 0, usablePlaceCount: 0, operatingFactPlaceCount: 0, durationFactPlaceCount: 0 } } })).routeData === "unavailable", "analysis 10: coordinates are not actual route evidence");
assert(snapshotFor(touching).groupPreferenceDiagnosis.coverage === "insufficient", "analysis 11: zero preference responses");
assert(snapshotFor(state({ itineraryByTripId: touching.itineraryByTripId, preferenceResultsByUserId: { owner: preference("owner") } })).groupPreferenceDiagnosis.coverage === "insufficient", "analysis 12: one response");
assert(snapshotFor(state({ itineraryByTripId: touching.itineraryByTripId, preferenceResultsByUserId: { owner: preference("owner"), friend: preference("friend") } })).groupPreferenceDiagnosis.coverage === "partial", "analysis 13: partial responses");
assert(snapshotFor(state({ itineraryByTripId: touching.itineraryByTripId, preferenceResultsByUserId: { owner: preference("owner"), friend: preference("friend"), third: preference("third") } })).groupPreferenceDiagnosis.coverage === "complete", "analysis 14: complete responses");
assert(analyzeCandidateUsage(snapshotFor(state({ candidatesByTripId: { trip: [candidate("a")], other: [] }, itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00")], other: [] } }))).usage.unscheduledCandidateCount === 0, "analysis 15: no unscheduled candidates");
assert(analyzeCandidateUsage(snapshotFor(state({ candidatesByTripId: { trip: [candidate("shared", ["owner", "friend"])], other: [] } }))).usage.unscheduledSharedCandidateIds[0] === "shared", "analysis 16: shared unscheduled candidate");
const damagedPlace = state({ itineraryByTripId: { trip: [item("broken-place", "missing", "2026-07-18", "10:00")], other: [] } });
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(damagedPlace, "trip"), engineAvailable: true }).status === "invalid-itinerary", "analysis 17: missing place");
const damagedItem = state({ itineraryByTripId: { trip: [item("broken-time", "a", "2026-07-18", "25:00")], other: [] } });
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(damagedItem, "trip"), engineAvailable: true }).status === "invalid-itinerary", "analysis 18: damaged item");
const backendMinuteItems = state({ itineraryByTripId: { trip: [item("minute-a", "a", "2026-07-18", "09:10", 55), item("minute-b", "b", "2026-07-18", "10:20", 35)], other: [] } });
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(backendMinuteItems, "trip"), engineAvailable: true }).status !== "invalid-itinerary", "analysis 18b: Backend HH:mm arbitrary-minute schedule remains analyzable without rounding");
const heuristicDenseSource = state({ itineraryByTripId: { trip: ["a", "b", "c", "d", "e", "f", "g"].map((placeId, index) => item(`heuristic-${index}`, placeId, "2026-07-18", `${String(8 + index).padStart(2, "0")}:00`)), other: [] } });
assert(sessionFor(heuristicDenseSource).overallStatus !== "warning", "analysis 19: low-confidence density heuristic cannot create the hard-warning headline");
const overlayUnavailableInput = inputFor(state({
  itineraryByTripId: {
    trip: [item("overlay-a", "a", "2026-07-18", "10:00", 90), item("overlay-b", "b", "2026-07-18", "11:00", 60)],
    other: [],
  },
}));
const overlayUnavailableSession = createDuriAnalysisSession({
  ...overlayUnavailableInput,
  scheduleOverlayStatus: "unavailable",
}, "2026-07-14T00:00:00.000Z");
assert(overlayUnavailableSession.result.density.status === "insufficient-data"
  && overlayUnavailableSession.result.meal.status === "insufficient-data"
  && overlayUnavailableSession.result.preference.status === "insufficient-data"
  && overlayUnavailableSession.result.route.status !== "insufficient-data"
  && overlayUnavailableSession.issues.some((issue) => issue.id.startsWith("time-conflict-")),
"analysis 19a: unreadable overlay suppresses type/preference-dependent claims while preserving server-time conflicts and route flow");

const detailedPreference = (userId: string, mobilityScore: 0 | 1 | 2, mobilityModes: string[]) => ({
  ...preference(userId),
  answers: { ...preference(userId).answers, mobility: mobilityScore },
  detailedSignals: {
    surveyVersion: 9,
    algorithmVersion: 8,
    staminaScore: 0,
    densityScore: mobilityScore * 50,
    scheduleStyle: "relaxed" as const,
    preferredDailyScheduledMinutes: mobilityScore === 0 ? 30 : 180,
    preferredDailyScheduledResolutionMinutes: 30,
    preferredAverageActivityBlockMinutes: 60,
    preferredAverageActivityBlockResolutionMinutes: 60,
    mobilityModes,
    categoryScores: { cafe: 100 },
    budgetRanking: ["food"],
    landmarkImportance: 0,
    localInterest: 0,
  },
});
const preferenceConstraintSnapshot = snapshotFor(state({
  tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
  itineraryByTripId: { trip: [item("preference-place", "a", "2026-07-18", "10:00", 60)], other: [] },
  preferenceResultsByUserId: {
    owner: detailedPreference("owner", 0, ["subway", "walk"]),
    friend: detailedPreference("friend", 2, ["ownCar"]),
  },
}));
const preferenceIssues = analyzePreferenceConstraints(preferenceConstraintSnapshot, "2026-07-14T00:00:00.000Z");
assert(!preferenceIssues.some((issue) => issue.id === "preference-coordination-mobility")
  && !preferenceIssues.some((issue) => issue.id === "preference-coordination-pace")
  && preferenceIssues.some((issue) => issue.id.startsWith("preference-continuous-daily-load-") && issue.constraintType === "soft"),
"analysis 20: rich 설문은 legacy 축으로 투영하지 않고 원 단위·해상도 구간으로 조율한다");
const legacyPreferenceSnapshot = snapshotFor(state({
  itineraryByTripId: { trip: [item("legacy-preference", "a", "2026-07-18", "10:00")], other: [] },
  preferenceResultsByUserId: {
    owner: preference("owner"),
    friend: { ...preference("friend"), answers: { ...preference("friend").answers, pace: 2 } },
  },
}));
const legacyPreferenceIssues = analyzePreferenceConstraints(legacyPreferenceSnapshot, "2026-07-14T00:00:00.000Z");
assert(legacyPreferenceIssues.some((issue) => issue.id === "preference-coordination-pace"
  && issue.summary.includes("가장 아쉬운 사람을 먼저 배려")
  && !/Pareto|Nash|leximin/i.test(issue.summary)
  && issue.evidence.some((entry) => entry.label === "비교 기준" && entry.value.includes("같은 비중"))),
"analysis 20a: legacy 직접 3단계 응답의 공정 조율 근거를 내부 알고리즘명 없이 설명한다");
const unavailableOverlayPreferenceIssues = analyzePreferenceConstraints({
  ...legacyPreferenceSnapshot,
  scheduleOverlayStatus: "unavailable",
}, "2026-07-14T00:00:00.000Z");
assert(unavailableOverlayPreferenceIssues.some((issue) => issue.id === "preference-coordination-pace")
  && !unavailableOverlayPreferenceIssues.some((issue) => issue.id.startsWith("preference-representation-")),
"analysis 20aa: unreadable schedule overlay preserves direct survey conflicts but suppresses preferredBy-based representation claims");
const unavailableOverlayDetailedIssues = analyzePreferenceConstraints({
  ...preferenceConstraintSnapshot,
  scheduleOverlayStatus: "unavailable",
  itinerary: preferenceConstraintSnapshot.itinerary.map((entry) => ({ ...entry, durationMinutes: 180 })),
}, "2026-07-14T00:00:00.000Z");
assert(!unavailableOverlayDetailedIssues.some((issue) => issue.id.startsWith("preference-average-stay-"))
  && unavailableOverlayDetailedIssues.some((issue) => issue.id.startsWith("preference-continuous-daily-load-")),
"analysis 20ab: unreadable item types suppress average-stay classification while retaining overlay-independent detailed survey consensus");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-mobility-no-common-")), "analysis 20b: 직접 고른 이동수단은 별도 집합 합의로 조율한다");
const partialContinuousIssue = preferenceIssues.find((issue) => issue.id.startsWith("preference-continuous-daily-load-"));
assert(partialContinuousIssue?.confidence === "low" && partialContinuousIssue.summary.includes("2/3명"),
"analysis 20c: 축별 부분 관측을 전체 설문 완료율로 high 처리하거나 모든 참여자의 합의로 표현하지 않는다");
assert(preferenceIssues.find((issue) => issue.id.startsWith("preference-mobility-no-common-"))?.confidence === "low",
"analysis 20d: 이동수단 합의 신뢰도도 해당 신호 응답률로 계산한다");

const budgetPreference = (userId: string, ranking: string[]) => {
  const base = detailedPreference(userId, 1, ["walk"]);
  return { ...base, detailedSignals: { ...base.detailedSignals, budgetRanking: ranking } };
};
const sameTopBudgetSnapshot = snapshotFor(state({
  itineraryByTripId: { trip: [item("budget-place", "a", "2026-07-18", "10:00")], other: [] },
  preferenceResultsByUserId: {
    owner: budgetPreference("owner", ["food", "stay", "activity"]),
    friend: budgetPreference("friend", ["food", "activity", "stay"]),
  },
}));
const sameTopBudgetIssue = analyzePreferenceConstraints(sameTopBudgetSnapshot, "2026-07-14T00:00:00.000Z")
  .find((issue) => issue.id.startsWith("preference-budget-priority-"));
assert(sameTopBudgetIssue?.summary.includes("우선순위 차이를 가장 적게")
  && !sameTopBudgetIssue.summary.includes("Kemeny")
  && sameTopBudgetIssue.confidence === "low",
"analysis 20e: 1순위가 같아도 하위 순위 역전을 분석하고 부분 응답을 낮은 신뢰도로 공개한다");

const unsupportedDetailed = detailedPreference("owner", 0, ["walk"]);
unsupportedDetailed.detailedSignals.algorithmVersion = 99;
const unsupportedDetailedIssues = analyzePreferenceConstraints(snapshotFor(state({
  itineraryByTripId: { trip: [item("unsupported-place", "a", "2026-07-18", "10:00")], other: [] },
  preferenceResultsByUserId: { owner: unsupportedDetailed },
})), "2026-07-14T00:00:00.000Z");
assert(!unsupportedDetailedIssues.some((issue) => issue.id.startsWith("preference-daily-load-")
  || issue.id.startsWith("preference-mobility-mode-")
  || issue.id.startsWith("preference-category-coverage-")),
"analysis 20f: 미지원 detailed algorithmVersion을 정밀 성향 근거로 소비하지 않는다");

const overlapPreference = detailedPreference("owner", 1, ["walk"]);
overlapPreference.detailedSignals.preferredDailyScheduledMinutes = 100;
overlapPreference.detailedSignals.preferredDailyScheduledResolutionMinutes = 10;
const overlapLoadSnapshot = snapshotFor(state({
  itineraryByTripId: {
    trip: [item("overlap-a", "a", "2026-07-18", "10:00", 60), item("overlap-b", "b", "2026-07-18", "10:30", 60)],
    other: [],
  },
  preferenceResultsByUserId: { owner: overlapPreference },
}));
const overlapLoadIssues = analyzePreferenceConstraints(overlapLoadSnapshot, "2026-07-14T00:00:00.000Z");
const overlapDensityIssue = analyzeDensity(overlapLoadSnapshot).issues[0];
assert(!overlapLoadIssues.some((issue) => issue.id.startsWith("preference-daily-load-owner-"))
  && overlapDensityIssue?.evidence.some((entry) => entry.label === "일정 점유 하한" && entry.value.startsWith("90분")),
"analysis 20g: 겹친 일정은 duration 단순합이 아니라 시간 구간 합집합으로 하루 점유량을 계산한다");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-mobility-mode-owner-car") && issue.confidence === "high"), "analysis 21: explicit selected transport modes are compared with the room fact");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-mobility-mode-owner-car")
  && issue.evidence.some((entry) => entry.value.includes("지하철") && !entry.value.includes("subway"))),
"analysis 21a: internal mobility IDs are translated in user-facing evidence");
const directLoadDensity = robustDensityIssue;
assert(directLoadDensity?.evidence.some((entry) => entry.label === "일정 점유 하한" && entry.value.includes("300분"))
  && directLoadDensity.technicalDetails?.caveats.some((entry) => entry.includes("하한")),
"analysis 22: direct preferred daily load uses only scheduled and known route minutes and exposes the lower-bound caveat");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-category-coverage-owner-") && issue.confidence === "low"), "analysis 23: missing liked category remains low-confidence because place taxonomy can be incomplete");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-category-coverage-owner-")
  && issue.evidence.some((entry) => entry.label === "미반영 선호 유형" && entry.value.includes("카페") && !entry.value.includes("cafe"))),
"analysis 23a: internal category IDs are translated in user-facing evidence");

const routeAdjustedIdleInput = inputFor(state({
  tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
  itineraryByTripId: {
    trip: [item("travel-gap-a", "a", "2026-07-18", "10:00", 60), item("travel-gap-b", "b", "2026-07-18", "13:00", 60)],
    other: [],
  },
}));
const routeAdjustedEstimateBase: RouteLegEstimate = {
  fromItemId: "travel-gap-a",
  toItemId: "travel-gap-b",
  date: "2026-07-18",
  departureTime: "11:00",
  mode: "car",
  durationSeconds: 120 * 60,
  distanceMeters: 50_000,
  provider: "kakao-mobility",
  timingBasis: "current-traffic",
  fetchedAt: "2026-07-14T00:00:00.000Z",
};
const fullyExplainedGap = analyzeDayBalance(createDuriAnalysisSnapshot({
  ...routeAdjustedIdleInput,
  routeLegEstimates: [routeAdjustedEstimateBase],
}), "2026-07-14T00:00:00.000Z").metrics[0];
assert(fullyExplainedGap.analyzedRouteLegCount === 1 && fullyExplainedGap.routeAdjustedIdleMinutes === 0, "analysis 24: actual travel time fully explains a long schedule gap");
const partiallyExplainedGap = analyzeDayBalance(createDuriAnalysisSnapshot({
  ...routeAdjustedIdleInput,
  routeLegEstimates: [{ ...routeAdjustedEstimateBase, durationSeconds: 60 * 60 }],
}), "2026-07-14T00:00:00.000Z").metrics[0];
assert(partiallyExplainedGap.routeAdjustedIdleMinutes === 60, "analysis 25: only the idle time left after known travel is reported");
const rawGapDensity = analyzeDensity(routeAdjustedIdleInput);
const routeAdjustedDensity = analyzeDensity({ ...routeAdjustedIdleInput, routeLegEstimates: [routeAdjustedEstimateBase] });
assert(rawGapDensity.issues[0]?.summary.includes("임의 기준으로 판정하지 않았어요")
  && rawGapDensity.issues[0]?.evidence.some((entry) => entry.label === "실제 경로 반영"
    && entry.value.includes("경로 미확인 공백 1회는 휴식 판정 보류")),
"analysis 26: an unmeasured long gap is neither claimed as rest nor treated as uninterrupted activity");
assert(routeAdjustedDensity.issues[0]?.evidence.some((entry) => entry.label === "실제 경로 반영" && entry.value.includes("1/1구간") && entry.value.includes("빈 시간 0분")), "analysis 27: a gap fully consumed by measured travel is not counted as rest");
const duplicateVisitIssues = analyzeDuplicateVisits(snapshotFor(state({
  itineraryByTripId: {
    trip: [item("duplicate-a", "a", "2026-07-18", "09:00"), item("duplicate-b", "a", "2026-07-18", "18:00")],
    other: [],
  },
})));
assert(duplicateVisitIssues.length === 1 && duplicateVisitIssues[0].constraintType === "soft" && duplicateVisitIssues[0].confidence === "high", "analysis 28: same-day exact place duplicates are review-only soft constraints");
const overnightIssues = analyzeOvernightRecovery(snapshotFor(state({
  itineraryByTripId: {
    trip: [item("late-night", "a", "2026-07-18", "22:00", 60), item("early-next", "b", "2026-07-19", "04:00", 60)],
    other: [],
  },
})));
assert(overnightIssues.length === 1 && overnightIssues[0].constraintType === "soft" && overnightIssues[0].confidence === "low" && !overnightIssues[0].suggestionSupported, "analysis 29: short overnight recovery is low-confidence soft guidance and never auto-changed");

const immutableSource = state({ itineraryByTripId: touching.itineraryByTripId });
const immutableBefore = JSON.stringify(immutableSource);
const immutableSnapshot = snapshotFor(immutableSource);
assert(JSON.stringify(immutableSource) === immutableBefore && createDuriInputFingerprint(immutableSnapshot) === createDuriInputFingerprint(immutableSnapshot), "snapshot/fingerprint deterministic and immutable");

function sessionFor(source: DuriInputSource) {
  const input = buildDuriAnalysisInputFromState(source, "trip");
  assert(input, "session input");
  return createDuriAnalysisSession(input, "2026-07-14T00:00:00.000Z");
}

// Suggestions: 20 required scenarios.
const conflictSession = sessionFor(conflict);
const conflictSourceBeforeSuggestions = JSON.stringify(conflict);
const conflictSuggestions = generateDuriSuggestions(conflictSession, "2026-07-14T00:00:00.000Z");
assert(conflictSuggestions.some((entry) => entry.suggestion.sourceIssueIds.some((id) => id.startsWith("time-conflict"))), "suggestion 1: conflict time move");
assert(JSON.stringify(conflict) === conflictSourceBeforeSuggestions, "suggestion generation must not mutate source state");
const balanceSource = state({ itineraryByTripId: { trip: [item("b1", "a", "2026-07-18", "08:00"), item("b2", "b", "2026-07-18", "10:00"), item("b3", "c", "2026-07-18", "12:00"), item("b4", "d", "2026-07-18", "14:00")], other: [] } });
assert(!generateDuriSuggestions(sessionFor(balanceSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.before?.date !== change.after?.date)), "suggestion 2: descriptive day/density evidence never moves an item to another day without route and operating facts");
const routeSource = state({ itineraryByTripId: { trip: [item("r1", "a", "2026-07-18", "09:00"), item("r2", "b", "2026-07-18", "11:00"), item("r3", "c", "2026-07-18", "13:00")], other: [] } });
assert(!generateDuriSuggestions(sessionFor(routeSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.type === "reorder-route"), "suggestion 3: address-area heuristic never creates an applicable route reorder");
const mealSource = state({ itineraryByTripId: { trip: [item("m1", "a", "2026-07-18", "10:00", 60), item("m2", "b", "2026-07-18", "14:00", 60)], other: [] } });
assert(!generateDuriSuggestions(sessionFor(mealSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.action === "add")), "suggestion 4: low-confidence common meal window never inserts a fixed-duration block");
const lockedConflictSource = state({ itineraryByTripId: { trip: [item("lock-open", "a", "2026-07-18", "10:00", 90), { ...item("lock-fixed", "b", "2026-07-18", "11:00"), lockedForDuri: true }], other: [] } });
const lockedConflictSuggestions = generateDuriSuggestions(sessionFor(lockedConflictSource), "2026-07-14T00:00:00.000Z");
assert(lockedConflictSuggestions.some((entry) => entry.suggestion.sourceIssueIds.some((id) => id.startsWith("time-conflict"))), "suggestion 4a: conflict can still suggest moving an unlocked peer");
assert(!lockedConflictSuggestions.some((entry) => entry.suggestion.changes.some((change) => change.action !== "add" && change.itemId === "lock-fixed")), "suggestion 4b: generated suggestions never target a user-locked schedule");
const documentConflictInput = buildDuriAnalysisInputWithDocuments(conflict, "trip", [{ id: "conflict-ticket", kind: "admission", itineraryItemIds: ["i2"] }]);
assert(documentConflictInput, "document-protected conflict input");
const documentConflictSuggestions = generateDuriSuggestions(createDuriAnalysisSession(documentConflictInput, "2026-07-14T00:00:00.000Z"), "2026-07-14T00:00:00.000Z");
assert(documentConflictSuggestions.some((entry) => entry.suggestion.changes.some((change) => change.itemId === "i1")), "suggestion 4c: a protected conflict item does not hide the movable peer");
assert(!documentConflictSuggestions.some((entry) => entry.suggestion.changes.some((change) => change.itemId === "i2")), "suggestion 4d: ticket-linked conflict item is never targeted");

function envelopeFor(source: DuriInputSource, changes: ScheduleChangePreview[], type: DuriSuggestion["type"] = "move-item"): DuriSuggestionEnvelope {
  const snapshot = snapshotFor(source);
  const itineraryFingerprint = buildItineraryFingerprint(snapshot.itinerary);
  const base = {
    tripId: "trip",
    sourceIssueIds: ["test"],
    type,
    priority: "medium" as const,
    title: "테스트 제안",
    summary: "테스트",
    reason: "검증",
    affectedItemIds: changes.flatMap((change) => change.itemId ? [change.itemId] : []),
    affectedPlaceIds: changes.flatMap((change) => change.placeId ? [change.placeId] : []),
    changes,
    canApply: true,
    itineraryFingerprint,
  };
  return { suggestion: { ...base, id: generateSuggestionId(base) }, baseFingerprint: createDuriInputFingerprint(snapshot), algorithmVersion: DURI_SUGGESTION_VERSION, createdAt: "2026-07-14T00:00:00.000Z", beforeItinerary: snapshot.itinerary };
}

const atomicBase = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00"), item("i2", "b", "2026-07-18", "14:00")], other: [{ ...item("other-i", "h", "2026-07-18", "10:00"), tripId: "other" }] } });
const validMove = [{ itemId: "i1", placeId: "a", action: "move" as const, before: { date: "2026-07-18", startTime: "10:00" }, after: { date: "2026-07-18", startTime: "12:00" } }];
const validEnvelope = envelopeFor(atomicBase, validMove);
const atomicDocumentReferences = [{ id: "atomic-ticket", kind: "admission" as const, itineraryItemIds: ["i2"] }];
const atomicDocumentInput = buildDuriAnalysisInputWithDocuments(atomicBase, "trip", atomicDocumentReferences);
assert(atomicDocumentInput, "document-aware atomic input");
const atomicDocumentFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(atomicDocumentInput));
const atomicDocumentEnvelope = { ...validEnvelope, baseFingerprint: atomicDocumentFingerprint };
assert(prepareDuriSuggestionAtomicApply(atomicBase, {
  tripId: "trip",
  envelope: atomicDocumentEnvelope,
  expectedFingerprint: atomicDocumentFingerprint,
  appliedByUserId: "owner",
  documentReferences: atomicDocumentReferences,
}, "2026-07-14").ok, "suggestion 14: unchanged linked document is included in atomic apply fingerprint");
assert(!prepareDuriSuggestionAtomicApply(atomicBase, {
  tripId: "trip",
  envelope: atomicDocumentEnvelope,
  expectedFingerprint: atomicDocumentFingerprint,
  appliedByUserId: "owner",
}, "2026-07-14").ok, "suggestion 15: omitting a linked document makes a document-aware suggestion stale");
const linkedItemMove = [{ itemId: "i2", placeId: "b", action: "move" as const, before: { date: "2026-07-18", startTime: "14:00" }, after: { date: "2026-07-18", startTime: "16:00" } }];
const linkedItemEnvelopeBase = envelopeFor(atomicBase, linkedItemMove);
const linkedItemEnvelope = { ...linkedItemEnvelopeBase, baseFingerprint: atomicDocumentFingerprint };
assert(!prepareDuriSuggestionAtomicApply(atomicBase, {
  tripId: "trip",
  envelope: linkedItemEnvelope,
  expectedFingerprint: atomicDocumentFingerprint,
  appliedByUserId: "owner",
  documentReferences: atomicDocumentReferences,
}, "2026-07-14").ok, "suggestion 15a: atomic apply cannot move a time-sensitive ticket-linked item");
const noteChangedSource = {
  ...atomicBase,
  itineraryByTripId: {
    ...atomicBase.itineraryByTripId,
    trip: atomicBase.itineraryByTripId.trip.map((entry) => entry.id === "i1" ? { ...entry, note: "사용자가 새로 작성한 메모" } : entry),
  },
};
assert(!prepareDuriSuggestionAtomicApply(noteChangedSource, {
  tripId: "trip",
  envelope: validEnvelope,
  expectedFingerprint: validEnvelope.baseFingerprint,
  appliedByUserId: "owner",
}, "2026-07-14").ok, "suggestion 16: editing a note makes a destructive or moving suggestion stale");
const lockedAtomicSource = {
  ...atomicBase,
  itineraryByTripId: {
    ...atomicBase.itineraryByTripId,
    trip: atomicBase.itineraryByTripId.trip.map((entry) => entry.id === "i1" ? { ...entry, lockedForDuri: true } : entry),
  },
};
const lockedAtomicEnvelope = envelopeFor(lockedAtomicSource, validMove);
assert(!validateDuriSuggestion(lockedAtomicSource, { tripId: "trip", envelope: lockedAtomicEnvelope, expectedFingerprint: lockedAtomicEnvelope.baseFingerprint, appliedByUserId: "owner" }).valid, "suggestion 17: validation independently rejects a change to a user-locked schedule");
assert(!prepareDuriSuggestionAtomicApply(lockedAtomicSource, { tripId: "trip", envelope: lockedAtomicEnvelope, expectedFingerprint: lockedAtomicEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "suggestion 18: atomic apply cannot bypass a user lock");
const missingCandidateEnvelope = envelopeFor(atomicBase, [{ itemId: "new", placeId: "h", action: "add", after: { date: "2026-07-18", startTime: "12:00", durationMinutes: 60, placeId: "h", itemType: "place" } }], "add-preference-place");
assert(!validateDuriSuggestion(atomicBase, { tripId: "trip", envelope: missingCandidateEnvelope, expectedFingerprint: missingCandidateEnvelope.baseFingerprint, appliedByUserId: "owner" }).valid, "suggestion 5: nonexistent candidate/place");
const outsideEnvelope = envelopeFor(atomicBase, [{ ...validMove[0], after: { date: "2026-07-20", startTime: "12:00" } }]);
assert(!prepareDuriSuggestionAtomicApply(atomicBase, { tripId: "trip", envelope: outsideEnvelope, expectedFingerprint: outsideEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "suggestion 6: outside trip date");
const invalidTimeEnvelope = envelopeFor(atomicBase, [{ ...validMove[0], after: { date: "2026-07-18", startTime: "24:00" } }]);
assert(!prepareDuriSuggestionAtomicApply(atomicBase, { tripId: "trip", envelope: invalidTimeEnvelope, expectedFingerprint: invalidTimeEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "suggestion 7: invalid end time");
const duplicateChangeEnvelope = envelopeFor(atomicBase, [validMove[0], { ...validMove[0], after: { date: "2026-07-18", startTime: "13:00" } }]);
assert(!validateDuriSuggestion(atomicBase, { tripId: "trip", envelope: duplicateChangeEnvelope, expectedFingerprint: duplicateChangeEnvelope.baseFingerprint, appliedByUserId: "owner" }).valid, "suggestion 8: duplicate item change");
const removeUpdateEnvelope = envelopeFor(atomicBase, [{ itemId: "i1", action: "remove", before: { date: "2026-07-18", startTime: "10:00" } }, validMove[0]]);
assert(!validateDuriSuggestion(atomicBase, { tripId: "trip", envelope: removeUpdateEnvelope, expectedFingerprint: removeUpdateEnvelope.baseFingerprint, appliedByUserId: "owner" }).valid, "suggestion 9: remove and update same item");
const validPreview = createDuriSuggestionPreview({ envelope: validEnvelope, tripDates: ["2026-07-18", "2026-07-19"], placesById: places, candidates: atomicBase.candidatesByTripId.trip, trip: atomicBase.tripsById.trip });
assert(validPreview.validation.valid && validPreview.diff.some((entry) => entry.kind === "time-changed"), "suggestion 10: preview before/after diff");
assert(atomicBase.itineraryByTripId.trip[0].startTime === "10:00", "preview must not mutate Store itinerary source");
const changedSource = { ...atomicBase, itineraryByTripId: { ...atomicBase.itineraryByTripId, trip: atomicBase.itineraryByTripId.trip.map((entry) => entry.id === "i1" ? { ...entry, startTime: "11:00" } : entry) } };
const changedFingerprint = createDuriInputFingerprint(snapshotFor(changedSource));
assert(isSuggestionStale(validEnvelope.baseFingerprint, changedFingerprint), "suggestion 11: fingerprint changed");
assert(!prepareDuriSuggestionAtomicApply(changedSource, { tripId: "trip", envelope: validEnvelope, expectedFingerprint: validEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "suggestion 12: stale apply blocked");
const firstApply = prepareDuriSuggestionAtomicApply(atomicBase, { tripId: "trip", envelope: validEnvelope, expectedFingerprint: validEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14");
assert(firstApply.ok, "suggestion 13a: apply success");
const afterApply = { ...atomicBase, itineraryByTripId: { ...atomicBase.itineraryByTripId, trip: firstApply.nextItinerary } };
assert(!prepareDuriSuggestionAtomicApply(afterApply, { tripId: "trip", envelope: validEnvelope, expectedFingerprint: validEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "suggestion 13: reapply blocked");
assert(diffItinerarySnapshots(validPreview.before, validPreview.after, places).some((entry) => entry.kind === "time-changed"), "diff helper stable");

// Atomic Store preparation: 10 required scenarios, every failure preserves all source relations.
function atomicFailure(source: DuriInputSource, envelope: DuriSuggestionEnvelope, expectedFingerprint = envelope.baseFingerprint, appliedByUserId = source.currentUserId) {
  const before = JSON.stringify(source);
  const result = prepareDuriSuggestionAtomicApply(source, { tripId: "trip", envelope, expectedFingerprint, appliedByUserId }, "2026-07-14T00:00:00.000Z");
  assert(!result.ok, "atomic failure expected");
  assert(JSON.stringify(source) === before, "atomic failure must preserve itinerary, candidates, and other trip");
  return result;
}

assert(firstApply.ok && firstApply.receipt.changedItemIds[0] === "i1", "atomic 1: normal suggestion");
atomicFailure(atomicBase, validEnvelope, "stale"); // atomic 2
const missingItemEnvelope = envelopeFor(atomicBase, [{ itemId: "missing", action: "move", before: { date: "2026-07-18", startTime: "10:00" }, after: { date: "2026-07-18", startTime: "12:00" } }]);
atomicFailure(atomicBase, missingItemEnvelope); // atomic 3
atomicFailure(atomicBase, outsideEnvelope); // atomic 4
atomicFailure(atomicBase, invalidTimeEnvelope); // atomic 5
const duplicateIdEnvelope = envelopeFor(atomicBase, [{ itemId: "i1", action: "add", after: { date: "2026-07-18", startTime: "12:00", durationMinutes: 60, itemType: "rest" } }], "insert-rest");
atomicFailure(atomicBase, duplicateIdEnvelope); // atomic 6
const partialFailureEnvelope = envelopeFor(atomicBase, [validMove[0], { itemId: "missing", action: "remove", before: { date: "2026-07-18" } }]);
atomicFailure(atomicBase, partialFailureEnvelope); // atomic 7
const noPermission = { ...atomicBase, currentUserId: "outsider" };
atomicFailure(noPermission, validEnvelope, validEnvelope.baseFingerprint, "outsider"); // atomic 8
const completedState = { ...atomicBase, tripsById: { ...atomicBase.tripsById, trip: trip("completed") } };
atomicFailure(completedState, validEnvelope); // atomic 9
atomicFailure(afterApply, validEnvelope); // atomic 10

// Trip end condition: 19 regression scenarios.
const endCondition = {
  type: "train" as const,
  location: { name: "부산역" },
  deadline: "18:00",
  travelMinutes: 60,
  serviceBufferMinutes: 30,
};
const endTrip: TripRoom = { ...trip(), endCondition };
assert(analyzeTripEndCondition(trip(), []).status === "not-configured", "end 1: condition not configured");
assert(analyzeTripEndCondition(endTrip, []).status === "insufficient-data", "end 2: final day empty is unknown");
const feasibleFinal = [item("end-feasible", "a", "2026-07-19", "15:30", 60)];
assert(analyzeTripEndCondition(endTrip, feasibleFinal).status === "feasible", "end 3: exact cutoff is feasible");
const infeasibleFinal = [
  item("end-early", "a", "2026-07-19", "12:00", 60),
  item("end-late", "b", "2026-07-19", "15:00", 120),
];
assert(analyzeTripEndCondition(endTrip, infeasibleFinal).status === "infeasible", "end 4: travel and service buffer overflow");
const adjustedFinal = buildTripEndConditionAdjustment(endTrip, infeasibleFinal);
assert(adjustedFinal.status === "adjusted", "end 5a: infeasible schedule can move earlier");
assert(adjustedFinal.status === "adjusted" && adjustedFinal.itinerary.find((entry) => entry.id === "end-early")?.startTime === "11:30" && adjustedFinal.itinerary.find((entry) => entry.id === "end-late")?.startTime === "14:30", "end 5b: all final-day items shift equally");
assert(adjustedFinal.status === "adjusted" && adjustedFinal.itinerary.find((entry) => entry.id === "end-late")?.durationMinutes === 120, "end 6: duration is preserved");
const originalGap = 15 * 60 - (12 * 60 + 60);
const adjustedGap = 14 * 60 + 30 - (11 * 60 + 30 + 60);
assert(originalGap === adjustedGap, "end 7: travel and waiting gap is preserved");
const cannotFitFinal = [item("end-first", "a", "2026-07-19", "00:00", 60), item("end-overflow", "b", "2026-07-19", "16:00", 60)];
assert(buildTripEndConditionAdjustment(endTrip, cannotFitFinal).status === "cannot-fit", "end 8: full-day schedule never moves before 00:00");
const crossMidnightTrip: TripRoom = { ...endTrip, endCondition: { ...endCondition, deadline: "00:30" } };
assert(analyzeTripEndCondition(crossMidnightTrip, feasibleFinal).status === "cross-midnight", "end 8b: a return cutoff on the previous calendar day is soft cross-midnight evidence, not an invalid time");
const minuteDeadlineTrip: TripRoom = { ...endTrip, endCondition: { ...endCondition, deadline: "18:07" } };
assert(analyzeTripEndCondition(minuteDeadlineTrip, [item("minute-deadline", "a", "2026-07-19", "15:37", 60)]).status === "feasible", "end 8c: return deadline and cutoff preserve exact one-minute precision");
assert(resolveTripEndConditionMutation(endTrip, infeasibleFinal).status === "adjusted" && resolveTripEndConditionMutation(endTrip, cannotFitFinal).status === "rejected", "end 9: mutation preflight adjusts or rejects atomically");
assert(analyzeTripEndCondition({ ...endTrip, endCondition: { ...endCondition, travelMinutes: Number.NaN } }, feasibleFinal).status === "invalid", "end 10a: NaN travel rejected");
assert(analyzeTripEndCondition({ ...endTrip, endCondition: { ...endCondition, travelMinutes: -1 } }, feasibleFinal).status === "invalid", "end 10b: negative travel rejected");
assert(analyzeTripEndCondition({ ...endTrip, endCondition: { ...endCondition, serviceBufferMinutes: Number.POSITIVE_INFINITY } }, feasibleFinal).status === "invalid", "end 10c: infinite buffer rejected");

const endSource = state({
  tripsById: { trip: endTrip, other: { ...trip(), id: "other", title: "다른 여행" } },
  itineraryByTripId: { trip: feasibleFinal, other: [] },
});
const changedEndSource = {
  ...endSource,
  tripsById: { ...endSource.tripsById, trip: { ...endTrip, endCondition: { ...endCondition, travelMinutes: 75 } } },
};
assert(createDuriInputFingerprint(snapshotFor(endSource)) !== createDuriInputFingerprint(snapshotFor(changedEndSource)), "end 11: condition changes fingerprint");
const infeasibleEndSource = { ...endSource, itineraryByTripId: { ...endSource.itineraryByTripId, trip: infeasibleFinal } };
const endSession = sessionFor(infeasibleEndSource);
const endIssue = endSession.issues.find((issue) => issue.category === "end-condition" && issue.severity === "high");
assert(endIssue, "end 12: analyzer reports high end-condition issue");
assert(generateDuriSuggestions(endSession, "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.sourceIssueIds.includes(endIssue.id)), "end 13: feasible adjustment suggestion generated");

const invalidEndMove = [{ itemId: "end-feasible", placeId: "a", action: "move" as const, before: { date: "2026-07-19", startTime: "15:30" }, after: { date: "2026-07-19", startTime: "16:00" } }];
const invalidEndEnvelope = envelopeFor(endSource, invalidEndMove);
const invalidEndPreview = createDuriSuggestionPreview({ envelope: invalidEndEnvelope, tripDates: ["2026-07-18", "2026-07-19"], placesById: places, candidates: endSource.candidatesByTripId.trip, trip: endTrip });
assert(!invalidEndPreview.validation.valid, "end 14a: preview rejects infeasible final state");
assert(!prepareDuriSuggestionAtomicApply(endSource, { tripId: "trip", envelope: invalidEndEnvelope, expectedFingerprint: invalidEndEnvelope.baseFingerprint, appliedByUserId: "owner" }, "2026-07-14").ok, "end 14b: atomic apply matches preview");

const allRemovalSource = {
  ...endSource,
  itineraryByTripId: { ...endSource.itineraryByTripId, trip: [item("only-final", "a", "2026-07-19", "00:00", 17 * 60)] },
};
const allRemovalSession = sessionFor(allRemovalSource);
const allRemovalIssue = allRemovalSession.issues.find((issue) => issue.category === "end-condition" && issue.severity === "high");
assert(allRemovalIssue, "end 15a: cannot-fit issue exists");
assert(!generateDuriSuggestions(allRemovalSession, "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.sourceIssueIds.includes(allRemovalIssue.id)), "end 15b: do not solve by deleting entire final day");
const transportOnlySource = {
  ...allRemovalSource,
  itineraryByTripId: { ...allRemovalSource.itineraryByTripId, trip: [{ ...allRemovalSource.itineraryByTripId.trip[0], itemType: "transport" as const }] },
};
const transportSession = sessionFor(transportOnlySource);
const transportIssue = transportSession.issues.find((issue) => issue.category === "end-condition" && issue.severity === "high");
assert(transportIssue && !generateDuriSuggestions(transportSession, "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.sourceIssueIds.includes(transportIssue.id)), "end 16: transport block is never removal fallback");
const lockedFinal = infeasibleFinal.map((entry) => entry.id === "end-early" ? { ...entry, lockedForDuri: true } : entry);
const lockedEndAdjustment = buildTripEndConditionAdjustment(endTrip, lockedFinal);
assert(lockedEndAdjustment.status === "cannot-fit" && resolveTripEndConditionMutation(endTrip, lockedFinal).status === "rejected", "end 17: automatic end-condition shift never moves a user-locked schedule");
assert(
  buildTripEndConditionAdjustment(endTrip, infeasibleFinal, ["end-late"]).status === "cannot-fit"
    && resolveTripEndConditionMutation(endTrip, infeasibleFinal, ["end-late"]).status === "rejected",
  "end 18: automatic end-condition shift never moves a confirmed reservation or linked ticket schedule",
);

// Evidence-driven Hard/Soft constraints.
const routeConstraintInput: DuriAnalysisInput = {
  ...inputFor(state({
    tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
    itineraryByTripId: { trip: [item("route-from", "a", "2026-07-18", "10:00"), item("route-to", "b", "2026-07-18", "11:30")], other: [] },
  })),
  routeLegEstimates: [{
    fromItemId: "route-from",
    toItemId: "route-to",
    date: "2026-07-18",
    departureTime: "11:00",
    mode: "car",
    durationSeconds: 3_001,
    distanceMeters: 12_345,
    provider: "kakao-mobility",
    timingBasis: "current-traffic",
    fetchedAt: "2026-07-14T00:00:00.000Z",
  }],
};
const routeConstraintSnapshot = createDuriAnalysisSnapshot(routeConstraintInput);
const routeConstraintIssue = analyzeRouteTimeConstraints(routeConstraintSnapshot, "2026-07-14T00:00:01.000Z")[0];
assert(routeConstraintIssue?.constraintType === "soft" && routeConstraintIssue.confidence === "medium" && routeConstraintIssue.severity === "medium", "evidence 1: current-traffic shortage is a medium-confidence soft warning for a future itinerary");
const futureRouteIssue = analyzeRouteTimeConstraints(createDuriAnalysisSnapshot({
  ...routeConstraintInput,
  routeLegEstimates: [{ ...routeConstraintInput.routeLegEstimates![0], timingBasis: "future-departure" }],
}), "2026-07-14T00:00:01.000Z")[0];
assert(futureRouteIssue?.constraintType === "hard" && futureRouteIssue.confidence === "high" && futureRouteIssue.severity === "high", "evidence 1a: departure-specific shortage remains a high-confidence hard constraint");
const transitRouteIssue = analyzeRouteTimeConstraints(createDuriAnalysisSnapshot({
  ...routeConstraintInput,
  trip: { ...routeConstraintInput.trip, transport: "public" },
  routeLegEstimates: [{
    ...routeConstraintInput.routeLegEstimates![0],
    mode: "public",
    provider: "kakao-public-transit",
    timingBasis: "time-independent-transit",
  }],
}), "2026-07-14T00:00:01.000Z")[0];
assert(transitRouteIssue?.constraintType === "soft" && transitRouteIssue.confidence === "medium" && transitRouteIssue.severity === "medium", "evidence 1b: departure-independent transit shortage stays soft");
const exactlyEnoughEstimate: RouteLegEstimate = { ...routeConstraintInput.routeLegEstimates![0], durationSeconds: 1_800 };
assert(analyzeRouteTimeConstraints(createDuriAnalysisSnapshot({ ...routeConstraintInput, routeLegEstimates: [exactlyEnoughEstimate] }), "2026-07-14T00:00:01.000Z").length === 0, "evidence 2: exact route gap is sufficient");
assert(analyzeRouteTimeConstraints(routeConstraintSnapshot, "2026-07-13T23:59:59.000Z").length === 0, "evidence 3: evidence from the future is ignored");

const restBlock: ItineraryItem = { id: "rest", tripId: "trip", date: "2026-07-18", startTime: "11:15", durationMinutes: 30, itemType: "rest", preferredByUserIds: [] };
const blockedLegs = buildScheduledRouteLegs({
  trip: trip(),
  itinerary: [item("block-from", "a", "2026-07-18", "10:00"), restBlock, item("block-to", "b", "2026-07-18", "12:00")],
});
assert(blockedLegs[0]?.availableSeconds === 15 * 60 && blockedLegs[0]?.departureTime === "11:00", "evidence 4: longest continuous free route window excludes rest block");
assert(buildScheduledRouteLegs({ trip: trip(), itinerary: [item("day-one", "a", "2026-07-18", "20:00"), item("day-two", "b", "2026-07-19", "09:00")] }).length === 0, "evidence 5: never connect different days");

const confirmedConstraint: ConfirmedScheduleConstraint = {
  id: "confirmed-a",
  kind: "reservation",
  label: "전시 예약",
  source: "user-confirmed",
  date: "2026-07-18",
  startTime: "10:00",
  itineraryItemId: "confirmed-item",
  placeId: "a",
  confirmedAt: "2026-07-10T00:00:00.000Z",
};
const confirmedInput = inputFor(state({ itineraryByTripId: { trip: [item("confirmed-item", "a", "2026-07-18", "10:15")], other: [] } }));
const confirmedIssue = analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({ ...confirmedInput, confirmedScheduleConstraints: [confirmedConstraint] }))[0];
assert(confirmedIssue?.constraintType === "hard" && confirmedIssue.confidence === "high", "evidence 6: changed confirmed reservation is high-confidence hard issue");
assert(analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({ ...confirmedInput, itinerary: [], confirmedScheduleConstraints: [confirmedConstraint] }))[0]?.title.includes("누락"), "evidence 7: missing confirmed reservation");
const repeatedPlaceInput = inputFor(state({ itineraryByTripId: { trip: [
  item("first-visit", "a", "2026-07-18", "09:00"),
  item("confirmed-item", "a", "2026-07-18", "10:00"),
], other: [] } }));
assert(analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({ ...repeatedPlaceInput, confirmedScheduleConstraints: [{ ...confirmedConstraint, itineraryItemId: undefined }] })).length === 0, "evidence 7a: place-only constraint selects exact date and time among repeated visits");
const arbitraryMinuteConstraint = { ...confirmedConstraint, startTime: "10:20", endTime: "10:40" };
assert(analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({ ...confirmedInput, itinerary: [item("confirmed-item", "a", "2026-07-18", "10:15", 30)], confirmedScheduleConstraints: [arbitraryMinuteConstraint] })).length === 0, "evidence 7aa: 15-minute schedule block can cover a user-confirmed arbitrary-minute reservation range");
assert(analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({ ...confirmedInput, itinerary: [item("confirmed-item", "a", "2026-07-18", "10:15", 30)], confirmedScheduleConstraints: [{ ...arbitraryMinuteConstraint, endTime: "10:50" }] })).some((issue) => issue.constraintType === "hard"), "evidence 7ab: confirmed reservation end outside the schedule block remains a hard mismatch");
const invalidConfirmedIssue = analyzeConfirmedScheduleConstraints(createDuriAnalysisSnapshot({
  ...confirmedInput,
  confirmedScheduleConstraints: [{ ...confirmedConstraint, id: "outside-trip-confirmed", date: "2027-01-01" }],
}))[0];
assert(invalidConfirmedIssue?.constraintType === "informational" && invalidConfirmedIssue.severity === "low" && !invalidConfirmedIssue.suggestionSupported, "evidence 7b: unusable confirmed input requests review without becoming a hard violation");
const wrongDateMandatoryItem = item("wrong-date-mandatory", "a", "2026-07-19", "10:00");
const placeOnlyMandatoryConstraint: ConfirmedScheduleConstraint = {
  ...confirmedConstraint,
  id: "place-only-mandatory",
  kind: "mandatory-place",
  itineraryItemId: undefined,
  startTime: undefined,
  date: "2026-07-18",
};
const wrongDateProtectionInput = {
  trip: trip(),
  confirmedScheduleConstraints: [placeOnlyMandatoryConstraint],
  documentReferences: [],
};
assert(
  getDuriItemProtection(wrongDateProtectionInput, wrongDateMandatoryItem, { action: "remove" }).blocked,
  "evidence 7c: a place-only mandatory occurrence remains protected even when its current date is already wrong",
);
assert(
  getDuriItemProtection(wrongDateProtectionInput, wrongDateMandatoryItem, { action: "replace", after: { placeId: "b" } }).blocked,
  "evidence 7d: a wrong-date place-only mandatory occurrence cannot be replaced and lose the confirmed place",
);
assert(
  !getDuriItemProtection(wrongDateProtectionInput, wrongDateMandatoryItem, {
    action: "move",
    after: { date: placeOnlyMandatoryConstraint.date, startTime: wrongDateMandatoryItem.startTime },
  }).blocked,
  "evidence 7e: moving a date-only mandatory occurrence onto its confirmed date is not blocked as if it worsened the violation",
);
assert(
  isRouteOptimizationFixedItem(wrongDateProtectionInput, wrongDateMandatoryItem),
  "evidence 7f: route optimization also keeps an ambiguous wrong-date mandatory-place occurrence fixed",
);
const semanticReservationItem: ItineraryItem = { ...wrongDateMandatoryItem, id: "semantic-reservation", itemType: "reservation" };
assert(
  getDuriItemProtection({ trip: trip(), confirmedScheduleConstraints: [], documentReferences: [] }, semanticReservationItem, { action: "move", after: { startTime: "11:00" } }).reason === "semantic-reservation"
    && isRouteOptimizationFixedItem({ trip: trip(), confirmedScheduleConstraints: [], documentReferences: [], placeConstraintEvidence: [] }, semanticReservationItem),
  "evidence 7g: semantic reservation items remain protected even without a linked document or explicit lock",
);

const saturdayWindows = parseOperatingWindows("평일 09:00~18:00\n토요일 10:00~16:00", "2026-07-18");
assert(saturdayWindows.status === "parsed" && saturdayWindows.windows[0]?.startMinutes === 600 && saturdayWindows.windows[0]?.endMinutes === 960, "evidence 8: weekday-specific operating window");
assert(parseOperatingWindows("계절 및 현지 사정에 따라 변동", "2026-07-18").status === "unknown", "evidence 9: ambiguous operating text is never guessed");
assert(parseOperatingWindows("입장료 1000~2000원", "2026-07-18").status === "unknown"
  && parseOperatingWindows("행사기간 2026.07.18~20", "2026-07-18").status === "unknown"
  && parseOperatingWindows("매일 9~18", "2026-07-18").status === "unknown",
"evidence 9b: bare prices, dates, and numeric ranges never become operating-hour facts");
assert(parseOperatingWindows("점심시간 12:00~13:00", "2026-07-18").status === "unknown"
  && parseOperatingWindows("09:00~18:00, 브레이크 타임 12:00~13:00", "2026-07-18").status === "unknown",
"evidence 9c: break windows are not promoted to hard opening windows");
const markerWindows = parseOperatingWindows("오전 9~오후 6", "2026-07-18");
assert(markerWindows.status === "parsed" && markerWindows.windows[0]?.startMinutes === 540 && markerWindows.windows[0]?.endMinutes === 1080
  && parseOperatingWindows("공원 이용시간 09:00~18:00", "2026-07-18").status === "parsed",
"evidence 9d: explicit clock evidence remains valid without treating the word park as a currency marker");
assert(!hasEvaluableOperatingFactForDate({ restDateText: "연중무휴(설날·추석 당일 휴무)" }, "2026-07-18"), "evidence 9e: no-closure text with holiday exceptions remains unknown");
const operatingPlace: Place = {
  ...places.a,
  infoItems: [{ label: "이용시간", value: "토요일 10:00~16:00" }, { label: "휴무일", value: "매주 토요일" }, { label: "소요시간", value: "1시간 30분~2시간" }],
};
const operatingInput = inputFor(state({ placesById: { ...places, a: operatingPlace }, itineraryByTripId: { trip: [item("operating-item", "a", "2026-07-18", "09:00", 60)], other: [] } }));
assert(analyzePlaceOperatingConstraints(createDuriAnalysisSnapshot(operatingInput), "2026-07-14T00:00:01.000Z").length === 0, "evidence 9a: local display text without provider provenance never becomes a hard fact");
const operatingSnapshot = createDuriAnalysisSnapshot({
  ...operatingInput,
  placeConstraintEvidence: [{
    placeId: "a",
    provider: "tour-api",
    fetchedAt: "2026-07-14T00:00:00.000Z",
    operatingHoursText: "토요일 10:00~16:00",
    restDateText: "매주 토요일",
    recommendedDurationText: "1시간 30분~2시간",
  }],
});
assert(analyzePlaceOperatingConstraints(operatingSnapshot, "2026-07-14T00:00:01.000Z").some((issue) => issue.id.startsWith("opening-hours-")), "evidence 10: visit outside parsed operating hours");
assert(analyzePlaceOperatingConstraints(operatingSnapshot, "2026-07-14T00:00:01.000Z").some((issue) => issue.id.startsWith("closed-day-")), "evidence 11: explicit weekly closure");
assert(analyzePlaceOperatingConstraints(operatingSnapshot, "2026-07-13T23:59:59.000Z").length === 0, "evidence 11a: Tour facts fetched after analysis time are ignored");
assert(parseRecommendedDurationMinutes("약 1시간 30분~2시간") === 90 && parseRecommendedDurationMinutes("60~90분") === 60, "evidence 12: official duration parser uses lower bound");
assert(analyzeRecommendedDurations(operatingSnapshot, "2026-07-14T00:00:01.000Z")[0]?.constraintType === "soft", "evidence 13: shorter stay is soft constraint");
const commaSeparatedWindows = parseOperatingWindows("월~금 09:00~18:00, 토요일 10:00~16:00", "2026-07-18");
assert(commaSeparatedWindows.status === "parsed" && commaSeparatedWindows.windows[0]?.startMinutes === 600, "evidence 13a: comma-separated weekday windows select the requested day");
assert(parseRecommendedDurationMinutes("최대 30분") === undefined, "evidence 13b: maximum duration is never treated as a recommended minimum");
assert(hasEvaluableOperatingFactForDate({ restDateText: "매주 월요일" }, "2026-07-14")
  && !hasEvaluableOperatingFactForDate({ restDateText: "현지 사정에 따라 문의" }, "2026-07-14")
  && !hasEvaluableOperatingFactForDate({ restDateText: "매주 월요일 화요일" }, "2026-07-14"),
"evidence 13c: explicit non-closure weekdays are evaluable while ambiguous rest text is not");
assert(analyzePlaceOperatingConstraints(createDuriAnalysisSnapshot({
  ...operatingInput,
  placeConstraintEvidence: [{ placeId: "a", provider: "tour-api", fetchedAt: "2026-07-14T00:00:00.000Z", restDateText: "매주 월요일 및 토요일" }],
}), "2026-07-14T00:00:01.000Z").some((issue) => issue.id.startsWith("closed-day-")), "evidence 13d: multi-weekday closure lists evaluate every listed day");

const eventPlace: Place = { ...places.a, eventStartDate: "2026-07-19", eventEndDate: "2026-07-20" };
const eventInput = inputFor(state({ placesById: { ...places, a: eventPlace }, itineraryByTripId: { trip: [item("event-item", "a", "2026-07-18", "10:00")], other: [] } }));
assert(analyzePlaceOperatingConstraints(createDuriAnalysisSnapshot({
  ...eventInput,
  placeConstraintEvidence: [{ placeId: "a", provider: "tour-api", fetchedAt: "2026-07-14T00:00:00.000Z", eventStartDate: "2026-07-19", eventEndDate: "2026-07-20" }],
}), "2026-07-14T00:00:01.000Z")[0]?.id === "event-period-event-item", "evidence 14: structured event period mismatch");

assert(parseExplicitParkingAvailability("주차시설 없음") === "unavailable"
  && parseExplicitParkingAvailability("유료 주차 가능") === "available"
  && parseExplicitParkingAvailability("현지 사정에 따라 문의") === "unknown",
"evidence 14a: parking parser only classifies explicit Tour facts");
const practicalInput = inputFor(state({
  tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
  itineraryByTripId: { trip: [item("practical-item", "a", "2026-07-18", "13:00")], other: [] },
  preferenceResultsByUserId: { owner: { ...preference("owner"), answers: { ...preference("owner").answers, budget: 0 } } },
}));
const practicalIssues = analyzePlacePracticalConstraints(createDuriAnalysisSnapshot({
  ...practicalInput,
  placeConstraintEvidence: [{
    placeId: "a",
    provider: "tour-api",
    fetchedAt: "2026-07-14T00:00:00.000Z",
    parkingText: "주차시설 없음",
    parkingFeeText: "1시간 3,000원",
    usageFeeText: "성인 10,000원",
    checkInTimeText: "15:00 이후",
  }],
}), "2026-07-14T00:00:01.000Z");
assert(practicalIssues.some((issue) => issue.id === "parking-unavailable-practical-item" && issue.constraintType === "soft")
  && practicalIssues.some((issue) => issue.id === "accommodation-check-in-practical-item" && issue.constraintType === "soft")
  && practicalIssues.some((issue) => issue.id === "place-fee-budget-practical-item" && issue.affectedMemberIds.includes("owner")),
"evidence 14b: explicit parking, check-in, and fee facts become conservative soft guidance");
const parkingFeeOnlyIssue = analyzePlacePracticalConstraints(createDuriAnalysisSnapshot({
  ...practicalInput,
  placeConstraintEvidence: [{
    placeId: "a",
    provider: "tour-api",
    fetchedAt: "2026-07-14T00:00:00.000Z",
    usageFeeText: "무료",
    parkingFeeText: "1시간 3,000원",
  }],
}), "2026-07-14T00:00:01.000Z").find((issue) => issue.id === "place-fee-budget-practical-item");
assert(parkingFeeOnlyIssue?.evidence.length === 1
  && parkingFeeOnlyIssue.evidence[0]?.label === "TourAPI 주차요금 원문",
"evidence 14ba: filtering a free usage fee cannot relabel the remaining parking fee as an admission fee");
assert(!analyzePlacePracticalConstraints(createDuriAnalysisSnapshot({
  ...practicalInput,
  placeConstraintEvidence: [{
    placeId: "a",
    provider: "tour-api",
    fetchedAt: "2026-07-14T00:00:00.000Z",
    checkInTimeText: "객실 202호 배정",
  }],
}), "2026-07-14T00:00:01.000Z").some((issue) => issue.id.startsWith("accommodation-check-in-")), "evidence 14c: unrelated bare numbers are not parsed as check-in times");

const normalizedCongestion = normalizeTourCongestionDays({
  contentId: "126508",
  days: [
    { date: "20260718", rate: 87, busy: false },
    { date: "20260719", rate: 42, busy: true },
    { date: "20260230", rate: 90 },
    { date: "20260720", rate: 101 },
    { date: "20260721", rate: "55" },
  ],
}, "126508");
assert(normalizedCongestion.length === 2
  && normalizedCongestion[0]?.date === "2026-07-18"
  && normalizedCongestion[0]?.rate === 87
  && normalizedCongestion[1]?.rate === 42,
"evidence 14d: only exact valid date and numeric 0..100 congestion rows survive; Backend busy flags are ignored");
assert(normalizeTourCongestionDays({ contentId: "other", days: [{ date: "20260718", rate: 80 }] }, "126508").length === 0
  && normalizeTourCongestionDays({ contentId: "126508", days: [{ date: "20260718", rate: 80 }, { date: "20260718", rate: 70 }] }, "126508").length === 0,
"evidence 14e: mismatched content IDs and conflicting duplicate dates never become evidence");
const congestionInput = inputFor(state({
  placesById: { ...places, a: { ...places.a, id: "a", contentTypeId: 12 } },
  itineraryByTripId: { trip: [
    item("congestion-a", "a", "2026-07-18", "10:00"),
    item("congestion-b", "a", "2026-07-18", "13:00"),
  ], other: [] },
}));
const peakCongestionEvidence = {
  placeId: "a",
  tourContentId: "126508",
  date: "2026-07-18",
  rate: 87,
  forecastRank: 1,
  comparedDayCount: 30,
  isForecastPeak: true,
  provider: "tourism-data-lab",
  fetchedAt: "2026-07-14T00:00:00.000Z",
} satisfies PlaceCongestionEvidence;
const peakCongestionSnapshot = createDuriAnalysisSnapshot({
  ...congestionInput,
  placeCongestionEvidence: [peakCongestionEvidence],
});
const peakCongestionIssues = analyzePlaceCongestionConstraints(peakCongestionSnapshot, "2026-07-14T00:00:01.000Z");
assert(peakCongestionIssues.length === 1
  && peakCongestionIssues[0]?.constraintType === "soft"
  && peakCongestionIssues[0]?.severity === "low"
  && peakCongestionIssues[0]?.affectedItemIds.join(",") === "congestion-a,congestion-b"
  && !peakCongestionIssues[0]?.suggestionSupported
  && peakCongestionIssues[0]?.summary.includes("절대 방문자 수·대기시간"),
"evidence 14f: an exact shared forecast peak becomes one grouped low-severity Soft review, never an automatic change");
const ordinaryCongestionIssues = analyzePlaceCongestionConstraints(createDuriAnalysisSnapshot({
  ...congestionInput,
  placeCongestionEvidence: [{
    ...peakCongestionEvidence,
    rate: 42,
    forecastRank: 18,
    isForecastPeak: false,
  }],
}), "2026-07-14T00:00:01.000Z");
assert(ordinaryCongestionIssues[0]?.constraintType === "informational"
  && ordinaryCongestionIssues[0]?.severity === "info"
  && ordinaryCongestionIssues[0]?.confidence === "medium",
"evidence 14g: a non-peak relative forecast stays informational with forecast uncertainty");
assert(analyzePlaceCongestionConstraints(peakCongestionSnapshot, "2026-07-13T23:59:59.000Z").length === 0,
  "evidence 14h: congestion evidence fetched after the analysis time is ignored");
assert(createDuriInputFingerprint(congestionInput) === createDuriInputFingerprint({ ...congestionInput, placeCongestionEvidence: [peakCongestionEvidence] }),
  "evidence 14i: ephemeral congestion evidence does not make unchanged user input stale");

const documentSnapshot = createDuriAnalysisSnapshot({ ...confirmedInput, documentReferences: [{ id: "ticket", kind: "admission", itineraryItemIds: ["confirmed-item"] }] });
assert(analyzeDocumentReferences(documentSnapshot)[0]?.constraintType === "informational", "evidence 15: unstructured file is not promoted to a hard constraint");
assert(calculateAnalysisCoverage(createDuriAnalysisSnapshot({
  ...confirmedInput,
  confirmedScheduleConstraints: [confirmedConstraint],
  documentReferences: [{ id: "confirmed-ticket", kind: "admission", itineraryItemIds: ["confirmed-item"], extractionStatus: "confirmed", confirmedFactIds: ["fact-1"] }],
})).documentData === "available"
  && calculateAnalysisCoverage(createDuriAnalysisSnapshot({
    ...confirmedInput,
    confirmedScheduleConstraints: [confirmedConstraint],
    documentReferences: [
      { id: "confirmed-ticket", kind: "admission", itineraryItemIds: ["confirmed-item"], extractionStatus: "confirmed", confirmedFactIds: ["fact-1"] },
      { id: "pending-ticket", kind: "train", itineraryItemIds: [], extractionStatus: "needs-review", pendingReviewFactIds: ["fact-2"] },
    ],
  })).documentData === "partial",
"evidence 15a: one confirmed fact cannot overstate document coverage while another document remains unresolved");
assert(createDuriInputFingerprint(routeConstraintInput) === createDuriInputFingerprint({ ...routeConstraintInput, routeLegEstimates: [{ ...routeConstraintInput.routeLegEstimates![0], durationSeconds: 9_999 }] }), "evidence 16: ephemeral route evidence does not invalidate user-input fingerprint");
assert(createDuriInputFingerprint({ ...routeConstraintInput, placesById: { ...routeConstraintInput.placesById, a: { ...routeConstraintInput.placesById.a, contentTypeId: 12 } } })
  !== createDuriInputFingerprint({ ...routeConstraintInput, placesById: { ...routeConstraintInput.placesById, a: { ...routeConstraintInput.placesById.a, contentTypeId: 14 } } }), "evidence 16a: Tour content type changes invalidate the analysis fingerprint");
assert(createDuriInputFingerprint(confirmedInput) !== createDuriInputFingerprint({ ...confirmedInput, documentReferences: [{ id: "ticket", kind: "admission", itineraryItemIds: ["confirmed-item"] }] }), "evidence 17: document linkage changes input fingerprint");
assert(createDuriInputFingerprint(confirmedInput) !== createDuriInputFingerprint({ ...confirmedInput, itinerary: confirmedInput.itinerary.map((entry) => ({ ...entry, lockedForDuri: true })) }), "evidence 17d: changing a user lock invalidates the analysis and suggestion fingerprint");
const documentSource = state({ itineraryByTripId: { trip: [item("document-item", "a", "2026-07-18", "10:00")], other: [] } });
const helperInput = buildDuriAnalysisInputWithDocuments(documentSource, "trip", [{ id: "ticket", kind: "admission", itineraryItemIds: ["document-item"] }]);
assert(helperInput?.documentReferences?.[0]?.itineraryItemIds[0] === "document-item", "evidence 17a: shared input builder includes document links");
const loadedEmptyDocumentInput = buildDuriAnalysisInputWithDocuments(documentSource, "trip", [], undefined, "loaded");
const unavailableDocumentInput = buildDuriAnalysisInputWithDocuments(documentSource, "trip", [], undefined, "unavailable");
const unavailableDocumentCoverage = unavailableDocumentInput
  ? calculateAnalysisCoverage(createDuriAnalysisSnapshot(unavailableDocumentInput))
  : undefined;
assert(unavailableDocumentCoverage?.documentData === "unavailable"
  && unavailableDocumentCoverage.documentMessage.includes("불러오지 못해")
  && unavailableDocumentCoverage.limitations.some((message) => message.includes("문서 없음과 확인 불가")),
"evidence 17aa: failed document hydration is explicit and never treated as an empty document collection");
assert(Boolean(loadedEmptyDocumentInput && unavailableDocumentInput)
  && createDuriInputFingerprint(createDuriAnalysisSnapshot(loadedEmptyDocumentInput!))
    !== createDuriInputFingerprint(createDuriAnalysisSnapshot(unavailableDocumentInput!)),
"evidence 17ab: document collection availability invalidates the analysis fingerprint");
const helperFingerprint = helperInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(helperInput)) : "";
assert(isDuriAnalysisCompletionCurrent({ requestedFingerprint: helperFingerprint, sessionFingerprint: helperFingerprint, latestInput: helperInput }), "evidence 17b: unchanged async analysis completion is accepted");
const changedDocumentInput = buildDuriAnalysisInputWithDocuments(documentSource, "trip", [{ id: "ticket", kind: "admission", itineraryItemIds: [] }]);
assert(!isDuriAnalysisCompletionCurrent({ requestedFingerprint: helperFingerprint, sessionFingerprint: helperFingerprint, latestInput: changedDocumentInput }), "evidence 17c: document change during async analysis rejects stale completion");

// Production document path: persisted TravelDocument -> input builder -> snapshot -> actual local analysis.
const ocrDocument = travelDocument("ocr-reservation");
const ocrFacts = extractTravelDocumentFactsFromText({
  document: ocrDocument,
  text: "예약일 2026년 7월 18일\n입장 15:00\nshared",
  providerId: "test-on-device-ocr",
  providerConfidence: 0.98,
  extractedAt: "2026-07-14T00:00:00.000Z",
  tripStartDate: "2026-07-18",
  tripEndDate: "2026-07-19",
});
const suggestedOcrDocument: TravelDocument = {
  ...ocrDocument,
  extraction: {
    status: "needs-review",
    providerId: "test-on-device-ocr",
    mode: "on-device",
    attemptedAt: "2026-07-14T00:00:00.000Z",
    completedAt: "2026-07-14T00:00:01.000Z",
    facts: ocrFacts,
  },
};
const productionDocumentSource = state({
  itineraryByTripId: { trip: [item("existing-item", "a", "2026-07-18", "10:00")], other: [] },
});
const suggestedOcrInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [suggestedOcrDocument]);
assert(suggestedOcrInput, "evidence 17e: suggested OCR production input exists");
assert(suggestedOcrInput.confirmedScheduleConstraints?.length === 0, "evidence 17f: OCR suggested fact never enters confirmedScheduleConstraints");
assert(suggestedOcrInput.documentReferences?.[0]?.extractionStatus === "needs-review"
  && suggestedOcrInput.documentReferences[0].pendingReviewFactIds?.[0] === ocrFacts[0]?.id,
"evidence 17g: pending OCR provenance reaches the production snapshot as review-only metadata");
const suggestedOcrSession = createDuriAnalysisSession(suggestedOcrInput, "2026-07-14T00:00:02.000Z");
assert(!suggestedOcrSession.issues.some((issue) => issue.category === "confirmed-schedule" && issue.constraintType === "hard"), "evidence 17h: actual analysis never promotes OCR suggested facts to a hard issue");
assert(suggestedOcrSession.issues.some((issue) => issue.category === "document-check" && issue.constraintType === "informational"), "evidence 17i: actual analysis asks for review instead of claiming a reservation fact");

const forgedConfirmedStatusDocument: TravelDocument = {
  ...suggestedOcrDocument,
  extraction: { ...suggestedOcrDocument.extraction!, status: "confirmed" },
};
const forgedStatusInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [forgedConfirmedStatusDocument]);
assert(forgedStatusInput?.confirmedScheduleConstraints?.length === 0, "evidence 17j: extraction status alone cannot promote an unreviewed fact");

const confirmedOcr = confirmTravelDocumentFact(suggestedOcrDocument.extraction, {
  factId: ocrFacts[0].id,
  kind: "reservation",
  label: "예약한 shared 장소",
  date: "2026-07-18",
  startTime: "15:00",
  placeId: "shared",
  confirmedByUserId: "owner",
  confirmedAt: "2026-07-14T00:00:03.000Z",
  tripStartDate: "2026-07-18",
  tripEndDate: "2026-07-19",
});
assert(confirmedOcr.ok, "evidence 17k: explicit user review confirms the OCR candidate");
if (!confirmedOcr.ok) throw new Error("confirmed OCR production fixture failed");
const confirmedOcrDocument: TravelDocument = { ...suggestedOcrDocument, extraction: confirmedOcr.extraction };
const confirmedOcrInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [confirmedOcrDocument]);
assert(confirmedOcrInput?.confirmedScheduleConstraints?.[0]?.sourceDocumentId === confirmedOcrDocument.id
  && confirmedOcrInput.confirmedScheduleConstraints[0].placeId === "shared",
"evidence 17l: only the user-confirmed document fact enters confirmedScheduleConstraints with provenance");
const confirmedOcrSession = createDuriAnalysisSession(confirmedOcrInput!, "2026-07-14T00:00:04.000Z");
assert(confirmedOcrSession.issues.some((issue) => issue.category === "confirmed-schedule"
  && issue.constraintType === "hard"
  && issue.title === "확정한 일정이 일정표에서 누락됐어요"),
"evidence 17m: actual analysis detects a missing reservation only after explicit confirmation");
assert(!confirmedOcrSession.issues.some((issue) => issue.category === "document-check"), "evidence 17n: a usable confirmed document is no longer reported as unstructured");
assert(createDuriInputFingerprint(suggestedOcrInput) !== createDuriInputFingerprint(confirmedOcrInput!), "evidence 17o: confirmation invalidates stale analysis results");
const externalUrlDocument: TravelDocument = {
  ...confirmedOcrDocument,
  id: "confirmed-external-url",
  displayName: "예약 확인 링크",
  fileName: "reservation-link.url",
  mimeType: "text/uri-list",
  localUri: "https://example.com/reservation",
  storage: "external-url",
  extraction: {
    ...confirmedOcr.extraction,
    facts: confirmedOcr.extraction.facts.map((fact) => ({
      ...fact,
      id: `external-${fact.id}`,
      sourceDocumentId: "confirmed-external-url",
    })),
  },
};
const externalUrlInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [externalUrlDocument]);
assert(externalUrlInput?.confirmedScheduleConstraints?.[0]?.sourceDocumentId === externalUrlDocument.id
  && externalUrlInput.documentReferences?.[0]?.extractionStatus === "confirmed",
"evidence 17oa: a reviewed external URL document keeps confirmed reservation provenance in production analysis");
const partiallyReviewedDocument: TravelDocument = {
  ...confirmedOcrDocument,
  extraction: {
    ...confirmedOcr.extraction,
    status: "needs-review",
    facts: [
      ...confirmedOcr.extraction.facts,
      { ...ocrFacts[0], id: `${ocrDocument.id}-fact-2`, label: "두 번째 미확정 예약" },
    ],
  },
};
const partiallyReviewedInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [partiallyReviewedDocument]);
assert(partiallyReviewedInput?.confirmedScheduleConstraints?.length === 1
  && createDuriAnalysisSession(partiallyReviewedInput, "2026-07-14T00:00:05.000Z").issues.some((issue) => issue.category === "document-check"),
"evidence 17oa: a confirmed fact does not hide another pending fact from the same document");

const unavailableStaleDocumentInput = buildDuriAnalysisInputWithDocuments(
  productionDocumentSource,
  "trip",
  [confirmedOcrDocument, partiallyReviewedDocument],
  undefined,
  "unavailable",
);
assert(unavailableStaleDocumentInput
  && unavailableStaleDocumentInput.documentReferences?.length === 0
  && unavailableStaleDocumentInput.confirmedScheduleConstraints?.filter((constraint) => constraint.source === "document-confirmed").length === 0
  && !createDuriAnalysisSession(unavailableStaleDocumentInput, "2026-07-14T00:00:05.500Z").issues.some((issue) => issue.category === "confirmed-schedule" || issue.category === "document-check"),
"evidence 17ob: a failed local document read never reuses stale TravelDocuments as confirmed or pending facts");
const unavailableWithServerReference = buildDuriAnalysisInputWithDocuments(
  productionDocumentSource,
  "trip",
  [confirmedOcrDocument, { id: "fresh-server-ticket", kind: "other", itineraryItemIds: ["ocr-item"], orderProtected: true }],
  undefined,
  "unavailable",
);
assert(unavailableWithServerReference?.documentReferences?.length === 1
  && unavailableWithServerReference.documentReferences[0].id === "fresh-server-ticket"
  && unavailableWithServerReference.documentReferences[0].orderProtected === true,
"evidence 17oc: a current server ticket reference remains available while stale local TravelDocuments are isolated");

const mixedDocumentInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [
  confirmedOcrDocument,
  { id: "legacy-reference", kind: "other", itineraryItemIds: [] },
]);
assert(mixedDocumentInput?.confirmedScheduleConstraints?.length === 1 && mixedDocumentInput.documentReferences?.length === 2,
"evidence 17p: a generic reference no longer suppresses confirmed facts from full TravelDocuments");
const foreignDocumentInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [{ ...confirmedOcrDocument, tripId: "other" }]);
assert(foreignDocumentInput?.confirmedScheduleConstraints?.length === 0 && foreignDocumentInput.documentReferences?.length === 0,
"evidence 17q: full documents from another trip are isolated from production analysis");
const duplicateReferenceInput = buildDuriAnalysisInputWithDocuments(productionDocumentSource, "trip", [
  suggestedOcrDocument,
  { id: suggestedOcrDocument.id, kind: suggestedOcrDocument.kind, itineraryItemIds: [] },
]);
assert(duplicateReferenceInput?.documentReferences?.length === 1
  && duplicateReferenceInput.documentReferences[0].pendingReviewFactIds?.[0] === ocrFacts[0].id,
"evidence 17qa: a duplicate legacy reference cannot erase full-document review provenance");

async function verifyRouteCollection() {
  const inertEvidenceDependencies = {
    requestDirections: async () => { throw new Error("public document fixture must not request car directions"); },
    requestPlaceReference: async () => { throw new Error("plain fixture IDs must not request Tour references"); },
    requestTourDetail: async () => { throw new Error("plain fixture IDs must not request Tour details"); },
  };
  const enrichedSuggestedOcr = await enrichDuriAnalysisInput(suggestedOcrInput!, "2026-07-14T00:00:06.000Z", inertEvidenceDependencies);
  assert(!createDuriAnalysisSession(enrichedSuggestedOcr, "2026-07-14T00:00:07.000Z").issues.some((issue) => issue.category === "confirmed-schedule" && issue.constraintType === "hard"),
  "evidence 17r: production evidence enrichment still cannot promote suggested OCR to hard");
  const enrichedConfirmedOcr = await enrichDuriAnalysisInput(confirmedOcrInput!, "2026-07-14T00:00:08.000Z", inertEvidenceDependencies);
  assert(enrichedConfirmedOcr.confirmedScheduleConstraints?.length === 1
    && createDuriAnalysisSession(enrichedConfirmedOcr, "2026-07-14T00:00:09.000Z").issues.some((issue) => issue.category === "confirmed-schedule" && issue.constraintType === "hard"),
  "evidence 17s: production enrichment preserves a confirmed document constraint through actual analysis");

  const locatedPlaces = {
    ...places,
    a: { ...places.a, latitude: 1, longitude: 1 },
    b: { ...places.b, latitude: 2, longitude: 2 },
    c: { ...places.c, latitude: 3, longitude: 3 },
  } satisfies Record<string, Place>;
  const carInput: DuriAnalysisInput = {
    ...inputFor(state({
      placesById: locatedPlaces,
      tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
      itineraryByTripId: { trip: [item("opt-a", "a", "2026-07-18", "09:00"), item("opt-b", "b", "2026-07-18", "11:00"), item("opt-c", "c", "2026-07-18", "13:00")], other: [] },
    })),
  };
  // Keep the directed costs explicit so a reversed edge is never assumed symmetric.
  const directedCosts: Record<string, number> = { "1>2": 2_000, "2>3": 2_000, "2>1": 200, "1>3": 300, "3>2": 400 };
  let callCount = 0;
  const collected = await collectCarRouteEvidence(carInput, async ({ origin, destination }) => {
    callCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(callCount === 5, "evidence 18: three-place adjacent optimization uses O(n) directed edges, not permutations");
  assert(collected.routeLegEstimates.length === 2 && collected.routeCollection.analyzedLegCount === 2, "evidence 19: all same-day scheduled legs receive estimates");
  assert(collected.routeOrderEvaluations[0]?.currentDurationSeconds === 4_000 && collected.routeOrderEvaluations[0]?.alternativeDurationSeconds === 500, "evidence 20: exact directed edge delta selects best adjacent swap");
  let ticketProtectedCalls = 0;
  const ticketProtectedCollection = await collectCarRouteEvidence({
    ...carInput,
    documentReferences: [{
      id: "server-ticket:opt-b:ticket-1",
      kind: "other",
      itineraryItemIds: ["opt-b"],
      orderProtected: true,
    }],
  }, async ({ origin, destination }) => {
    ticketProtectedCalls += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected ticket-protected pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(ticketProtectedCalls === 2 && ticketProtectedCollection.routeOrderEvaluations.length === 0,
    "evidence 20-server-ticket: an attached server ticket conservatively protects its schedule from route reordering");
  let unavailableOverlayCalls = 0;
  const unavailableOverlayCollection = await collectCarRouteEvidence({
    ...carInput,
    scheduleOverlayStatus: "unavailable",
  }, async ({ origin, destination }) => {
    unavailableOverlayCalls += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected overlay-unavailable pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(unavailableOverlayCalls === 2
    && unavailableOverlayCollection.routeLegEstimates.length === 2
    && unavailableOverlayCollection.routeOrderEvaluations.length === 0,
  "evidence 20-local-lock: unreadable locks retain required route checks but skip resultless optimization-only requests");
  let unavailableDocumentsCalls = 0;
  const unavailableDocumentsCollection = await collectCarRouteEvidence({
    ...carInput,
    documentCollectionStatus: "unavailable",
  }, async ({ origin, destination }) => {
    unavailableDocumentsCalls += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected document-unavailable pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(unavailableDocumentsCalls === 2
    && unavailableDocumentsCollection.routeLegEstimates.length === 2
    && unavailableDocumentsCollection.routeOrderEvaluations.length === 0,
  "evidence 20-document-status: unreadable document links retain required route checks but skip unsafe reorder requests");

  const fareCollection = await collectCarRouteEvidence(carInput, async () => ({
    distanceMeters: 1_000,
    durationSeconds: 600,
    tollFareWon: 2_000,
    taxiFareWon: 8_000,
    source: "kakao-mobility",
  }), "2026-07-14T00:00:00.000Z");
  const fareSnapshot = createDuriAnalysisSnapshot({
    ...carInput,
    preferenceResults: { owner: { ...preference("owner"), answers: { ...preference("owner").answers, budget: 0 } } },
    routeLegEstimates: fareCollection.routeLegEstimates,
  });
  const fareIssue = analyzeRouteCostEvidence(fareSnapshot, "2026-07-14T00:00:01.000Z")[0];
  assert(fareCollection.routeLegEstimates.every((estimate) => estimate.tollFareWon === 2_000 && estimate.taxiFareWon === 8_000)
    && fareIssue?.constraintType === "soft"
    && fareIssue.affectedMemberIds.includes("owner"),
  "evidence 20aa: Backend fare provenance survives collection and only informs a budget-sensitive soft issue");
  const incompleteTaxiIssue = analyzeRouteCostEvidence(createDuriAnalysisSnapshot({
    ...fareSnapshot,
    routeLegEstimates: fareCollection.routeLegEstimates.map((estimate, index) => index === 1
      ? { ...estimate, taxiFareWon: undefined }
      : estimate),
  }), "2026-07-14T00:00:01.000Z")[0];
  assert(incompleteTaxiIssue?.summary.includes("택시 합계를 만들지 않았어요")
    && !incompleteTaxiIssue.evidence.some((entry) => entry.label.includes("택시")),
  "evidence 20ab: a missing fare on one required leg never becomes a misleading all-route taxi total");
  let twoItemCallCount = 0;
  const twoItemCollection = await collectCarRouteEvidence({ ...carInput, itinerary: carInput.itinerary.slice(0, 2) }, async ({ origin, destination }) => {
    twoItemCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected two-item pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(twoItemCallCount === 2 && twoItemCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-a,opt-b", "evidence 20a: a two-place day compares both directed orders with two edges");
  const optimizationIssue = analyzeRouteOptimization(createDuriAnalysisSnapshot({ ...carInput, routeOrderEvaluations: collected.routeOrderEvaluations }))[0];
  assert(optimizationIssue?.constraintType === "soft"
    && optimizationIssue.suggestionSupported === false
    && optimizationIssue.confidence === "low"
    && optimizationIssue.summary.includes("운영시간 충족은 확인하지 못했으므로")
    && optimizationIssue.evidence.some((entry) => entry.label === "운영시간 검증"),
  "evidence 21: route optimization remains a read-only low-confidence route-only suggestion when operating facts are unknown");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...carInput,
    scheduleOverlayStatus: "unavailable",
    routeOrderEvaluations: collected.routeOrderEvaluations,
  })).length === 0, "evidence 21-local-lock: unreadable local locks suppress route reorder advice instead of assuming no locks");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...carInput,
    documentCollectionStatus: "unavailable",
    routeOrderEvaluations: collected.routeOrderEvaluations,
  })).length === 0, "evidence 21-document-status: unreadable document links suppress route reorder advice");
  const endDayInput: DuriAnalysisInput = {
    ...carInput,
    trip: { ...carInput.trip, endCondition },
    itinerary: carInput.itinerary.map((entry) => ({ ...entry, date: "2026-07-19" })),
  };
  let endDayCallCount = 0;
  const endDayCollection = await collectCarRouteEvidence(endDayInput, async ({ origin, destination }) => {
    endDayCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected end-condition pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(endDayCallCount === 4
    && endDayCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-a,opt-b"
    && analyzeRouteOptimization(createDuriAnalysisSnapshot({ ...endDayInput, routeOrderEvaluations: endDayCollection.routeOrderEvaluations })).length === 1,
  "evidence 21end-a: a last-day end condition still allows an earlier adjacent swap that preserves the terminal place");
  const terminalSwapEvaluation = {
    date: "2026-07-19",
    itemIds: ["opt-a", "opt-b", "opt-c"],
    swappedItemIds: ["opt-b", "opt-c"] as [string, string],
    currentDurationSeconds: 4_000,
    alternativeDurationSeconds: 500,
    alternativeLegs: [
      { fromItemId: "opt-a", toItemId: "opt-c", durationSeconds: 300, availableSeconds: 3_600 },
      { fromItemId: "opt-c", toItemId: "opt-b", durationSeconds: 200, availableSeconds: 3_600 },
    ],
    provider: "kakao-mobility" as const,
    timingBasis: "current-traffic" as const,
    fetchedAt: "2026-07-14T00:00:00.000Z",
  };
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({ ...endDayInput, routeOrderEvaluations: [terminalSwapEvaluation] })).length === 0,
    "evidence 21end-b: report defense rejects a last-day swap that would change the terminal route dependency");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...carInput,
    routeOrderEvaluations: [{
      ...collected.routeOrderEvaluations[0],
      alternativeLegs: collected.routeOrderEvaluations[0].alternativeLegs.map((leg, index) => index
        ? leg
        : { ...leg, durationSeconds: leg.availableSeconds + 1 }),
    }],
  })).length === 0, "evidence 21a0: report defense rejects a swap whose changed edge cannot fit its slot");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...carInput,
    routeOrderEvaluations: [{ ...collected.routeOrderEvaluations[0], itemIds: ["opt-a", "opt-b"] }],
  })).length === 0, "evidence 21aa: an evaluation whose captured day order differs from the current itinerary is rejected");
  const fixedOptimizationSnapshot = createDuriAnalysisSnapshot({
    ...carInput,
    routeOrderEvaluations: collected.routeOrderEvaluations,
    confirmedScheduleConstraints: [{
      id: "fixed-opt-b",
      kind: "reservation",
      label: "예약",
      source: "user-confirmed",
      date: "2026-07-18",
      startTime: "11:00",
      itineraryItemId: "opt-b",
      placeId: "b",
      confirmedAt: "2026-07-10T00:00:00.000Z",
    }],
  });
  assert(analyzeRouteOptimization(fixedOptimizationSnapshot).length === 0, "evidence 21a: confirmed schedule is excluded from swap review");
  const ticketLockedInput: DuriAnalysisInput = {
    ...carInput,
    documentReferences: [{ id: "ticket-opt-b", kind: "admission", itineraryItemIds: ["opt-b"] }],
  };
  let ticketLockedCallCount = 0;
  const ticketLockedCollection = await collectCarRouteEvidence(ticketLockedInput, async ({ origin, destination }) => {
    ticketLockedCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected ticket-locked pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(ticketLockedCallCount === 2 && ticketLockedCollection.routeOrderEvaluations.length === 0, "evidence 21b: linked ticket keeps its item fixed and does not request swap-only edges");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...ticketLockedInput,
    routeOrderEvaluations: collected.routeOrderEvaluations,
  })).length === 0, "evidence 21c: report layer independently rejects a ticket-linked swap");
  const userLockedInput: DuriAnalysisInput = {
    ...carInput,
    itinerary: carInput.itinerary.map((entry) => entry.id === "opt-b" ? { ...entry, lockedForDuri: true } : entry),
  };
  let userLockedCallCount = 0;
  const userLockedCollection = await collectCarRouteEvidence(userLockedInput, async ({ origin, destination }) => {
    userLockedCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected user-locked pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(userLockedCallCount === 2 && userLockedCollection.routeOrderEvaluations.length === 0
    && analyzeRouteOptimization(createDuriAnalysisSnapshot({ ...userLockedInput, routeOrderEvaluations: collected.routeOrderEvaluations })).length === 0,
  "evidence 21ca: user lock excludes swap-only requests and is rechecked by the report layer");
  assert(analyzeRouteOptimization(createDuriAnalysisSnapshot({
    ...carInput,
    routeOrderEvaluations: [{ ...collected.routeOrderEvaluations[0], currentDurationSeconds: 2_000, alternativeDurationSeconds: 1_101 }],
  })).length === 0, "evidence 21d: improvement smaller than one 15-minute scheduling slot is not surfaced");

  const restBlock: ItineraryItem = {
    id: "opt-rest",
    tripId: "trip",
    date: "2026-07-18",
    startTime: "10:15",
    durationMinutes: 15,
    itemType: "rest",
    preferredByUserIds: [],
  };
  let blockedSwapCallCount = 0;
  const blockedSwapCollection = await collectCarRouteEvidence({ ...carInput, itinerary: [...carInput.itinerary, restBlock] }, async ({ origin, destination }) => {
    blockedSwapCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected blocked-swap pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(blockedSwapCallCount === 4 && blockedSwapCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-b,opt-c", "evidence 21e: an intervening rest blocks only that boundary and preserves the best valid fallback swap");

  let overlapCallCount = 0;
  const overlapCollection = await collectCarRouteEvidence({
    ...carInput,
    itinerary: carInput.itinerary.map((entry) => entry.id === "opt-a" ? { ...entry, durationMinutes: 180 } : entry),
  }, async ({ origin, destination }) => {
    overlapCallCount += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected overlap pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(overlapCallCount === 1 && overlapCollection.routeOrderEvaluations.length === 0, "evidence 21f: an overlapping day never requests swap-only edges or reports an optimization");

  const individuallyImpossibleInput: DuriAnalysisInput = {
    ...carInput,
    itinerary: [
      item("tight-a", "a", "2026-07-18", "09:00", 45),
      item("tight-b", "b", "2026-07-18", "10:00", 45),
      item("tight-c", "c", "2026-07-18", "18:00", 60),
    ],
  };
  const individuallyImpossibleCosts: Record<string, number> = {
    "1>2": 600,
    "2>3": 6_000,
    "2>1": 1_800,
    "1>3": 600,
    "3>2": 7_000,
  };
  const individuallyImpossibleCollection = await collectCarRouteEvidence(individuallyImpossibleInput, async ({ origin, destination }) => {
    const durationSeconds = individuallyImpossibleCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected per-edge feasibility pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(individuallyImpossibleCollection.routeOrderEvaluations.length === 0, "evidence 21fb: a lower-total-time swap is rejected when one changed edge exceeds its slot");

  const durationCollisionInput: DuriAnalysisInput = {
    ...carInput,
    itinerary: carInput.itinerary.map((entry) => entry.id === "opt-b"
      ? { ...entry, durationMinutes: 180 }
      : entry.id === "opt-c"
        ? { ...entry, startTime: "15:00" }
        : entry),
  };
  const durationCollisionCollection = await collectCarRouteEvidence(durationCollisionInput, async ({ origin, destination }) => {
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected duration-collision pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(durationCollisionCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-b,opt-c"
    && analyzeRouteOptimization(createDuriAnalysisSnapshot({ ...durationCollisionInput, routeOrderEvaluations: collected.routeOrderEvaluations })).length === 0,
  "evidence 21fa: post-swap duration collision rejects an impossible best pair in collection and report layers");

  const fourPlaceInput: DuriAnalysisInput = {
    ...carInput,
    placesById: { ...locatedPlaces, d: { ...places.d, latitude: 4, longitude: 4 } },
    itinerary: [
      item("fixed-a", "a", "2026-07-18", "09:00"),
      item("fixed-b", "b", "2026-07-18", "11:00"),
      item("fixed-c", "c", "2026-07-18", "13:00"),
      item("fixed-d", "d", "2026-07-18", "15:00"),
    ],
    placeConstraintEvidence: [{ placeId: "b", provider: "tour-api", fetchedAt: "2026-07-14T00:00:00.000Z", operatingHoursText: "09:00~18:00" }],
  };
  const fixedFactCosts: Record<string, number> = { "1>2": 1_000, "2>3": 1_000, "3>4": 1_000, "4>3": 100, "2>4": 100 };
  let fixedFactCallCount = 0;
  const fixedFactCollection = await collectCarRouteEvidence(fourPlaceInput, async ({ origin, destination }) => {
    fixedFactCallCount += 1;
    const durationSeconds = fixedFactCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected fixed-fact pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(fixedFactCallCount === 5 && fixedFactCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "fixed-c,fixed-d", "evidence 21g: Tour time facts keep their item fixed while a valid later swap remains available");

  let ambiguousFactCalls = 0;
  const ambiguousFactCollection = await collectCarRouteEvidence({
    ...carInput,
    placeConstraintEvidence: [{ placeId: "b", provider: "tour-api", fetchedAt: "2026-07-14T00:00:00.000Z", operatingHoursText: "계절에 따라 변동되므로 문의" }],
  }, async ({ origin, destination }) => {
    ambiguousFactCalls += 1;
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected ambiguous-fact pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(ambiguousFactCalls === 5 && ambiguousFactCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-a,opt-b", "evidence 21ga: ambiguous operating text does not falsely lock a schedule item");

  const invalidConstraintInput: DuriAnalysisInput = {
    ...carInput,
    confirmedScheduleConstraints: [{
      id: "outside-trip",
      kind: "reservation",
      label: "범위 밖 예약",
      source: "user-confirmed",
      date: "2027-01-01",
      itineraryItemId: "opt-b",
      confirmedAt: "2026-07-10T00:00:00.000Z",
    }],
  };
  const invalidConstraintCollection = await collectCarRouteEvidence(invalidConstraintInput, async ({ origin, destination }) => {
    const durationSeconds = directedCosts[`${origin.lat}>${destination.lat}`];
    if (durationSeconds === undefined) throw new Error("unexpected invalid-constraint pair");
    return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(invalidConstraintCollection.routeOrderEvaluations[0]?.swappedItemIds.join(",") === "opt-a,opt-b"
    && calculateAnalysisCoverage(createDuriAnalysisSnapshot(invalidConstraintInput)).documentData === "unavailable",
  "evidence 21gb: malformed or out-of-trip confirmed facts neither lock optimization nor overstate document coverage");

  let missingCoordinateCalls = 0;
  const missingCoordinateCollection = await collectCarRouteEvidence({
    ...carInput,
    placesById: { ...locatedPlaces, b: { ...locatedPlaces.b, latitude: undefined, longitude: undefined } },
  }, async () => {
    missingCoordinateCalls += 1;
    return { distanceMeters: 100, durationSeconds: 60, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(missingCoordinateCalls === 0 && missingCoordinateCollection.routeOrderEvaluations.length === 0, "evidence 21h: a coordinate-less middle place never creates a fake adjacent route");

  let publicCalls = 0;
  const publicResult = await collectCarRouteEvidence({ ...carInput, trip: { ...carInput.trip, transport: "public" } }, async () => {
    publicCalls += 1;
    return { distanceMeters: 0, durationSeconds: 0, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(publicCalls === 0 && publicResult.routeCollection.analyzedLegCount === 0 && Boolean(publicResult.routeCollection.unavailableReason), "evidence 22: public mode never substitutes car estimates");

  let unavailableFactsCalls = 0;
  const unavailableFactsResult = await collectCarRouteEvidence({
    ...carInput,
    localPlanningFactsStatus: "unavailable",
  }, async () => {
    unavailableFactsCalls += 1;
    return { distanceMeters: 0, durationSeconds: 0, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(unavailableFactsCalls === 0
    && unavailableFactsResult.routeLegEstimates.length === 0
    && Boolean(unavailableFactsResult.routeCollection.unavailableReason)
    && analyzeRouteTimeConstraints(createDuriAnalysisSnapshot({
      ...routeConstraintInput,
      localPlanningFactsStatus: "unavailable",
    }), "2026-07-14T00:00:01.000Z").length === 0,
  "evidence 22-local-facts: unreadable local transport facts never fall back to the public or car default");

  const fiveLocatedPlaces = Object.fromEntries(["a", "b", "c", "d", "e"].map((id, index) => [
    id,
    { ...places[id], latitude: index + 1, longitude: index + 1 } as Place,
  ]));
  const fivePlaceInput: DuriAnalysisInput = {
    ...inputFor(state({
      placesById: { ...places, ...fiveLocatedPlaces },
      tripsById: { trip: { ...trip(), transport: "car" }, other: { ...trip(), id: "other" } },
      itineraryByTripId: {
        trip: ["a", "b", "c", "d", "e"].map((placeId, index) => item(`linear-${placeId}`, placeId, "2026-07-18", `${String(8 + index * 2).padStart(2, "0")}:00`)),
        other: [],
      },
    })),
  };
  let linearCallCount = 0;
  let activeRouteCalls = 0;
  let maxActiveRouteCalls = 0;
  await collectCarRouteEvidence(fivePlaceInput, async () => {
    linearCallCount += 1;
    activeRouteCalls += 1;
    maxActiveRouteCalls = Math.max(maxActiveRouteCalls, activeRouteCalls);
    await Promise.resolve();
    activeRouteCalls -= 1;
    return { distanceMeters: 100, durationSeconds: 60, source: "kakao-mobility" };
  }, "2026-07-14T00:00:00.000Z");
  assert(linearCallCount === 11, "evidence 23: five-place adjacent optimization needs 3n-4 directed edges");
  assert(maxActiveRouteCalls <= 4, "evidence 23a: route requests use bounded concurrency");

  const noUsableFactsCoverage = calculateAnalysisCoverage(createDuriAnalysisSnapshot({
    ...carInput,
    evidenceCollection: {
      route: { requiredLegCount: 2, analyzedLegCount: 2, mode: "car", provider: "kakao-mobility", timingBasis: "current-traffic" },
      placeDetails: { scheduledPlaceCount: 2, requestedPlaceCount: 2, fetchedPlaceCount: 2, usablePlaceCount: 0, operatingFactPlaceCount: 0, durationFactPlaceCount: 0, provider: "tour-api" },
    },
  }));
  assert(noUsableFactsCoverage.operatingData === "unavailable", "evidence 24: fetched detail without usable facts is not reported as operating coverage");
  const durationOnlyCoverage = calculateAnalysisCoverage(createDuriAnalysisSnapshot({
    ...carInput,
    evidenceCollection: {
      route: { requiredLegCount: 2, analyzedLegCount: 2, mode: "car", provider: "kakao-mobility", timingBasis: "current-traffic" },
      placeDetails: { scheduledPlaceCount: 2, requestedPlaceCount: 2, fetchedPlaceCount: 2, usablePlaceCount: 2, operatingFactPlaceCount: 0, durationFactPlaceCount: 2, provider: "tour-api" },
    },
  }));
  assert(durationOnlyCoverage.operatingData === "unavailable" && durationOnlyCoverage.operatingMessage.includes("권장 소요시간 근거는 2개"), "evidence 24a: duration facts are reported separately and never overstate operating-hours coverage");

  const servicePlaces = Object.fromEntries([1, 2, 3, 4].map((coordinate) => {
    const id = `tour:${coordinate}`;
    return [id, { ...place(id), latitude: coordinate, longitude: coordinate } as Place];
  }));
  const serviceInput: DuriAnalysisInput = {
    ...carInput,
    placesById: servicePlaces,
    itinerary: [1, 2, 3, 4].map((coordinate, index) => item(`service-${coordinate}`, `tour:${coordinate}`, "2026-07-18", `${String(9 + index * 2).padStart(2, "0")}:00`)),
  };
  const serviceEvents: string[] = [];
  const serviceCosts: Record<string, number> = { "1>2": 1_000, "2>3": 1_000, "3>4": 1_000, "4>3": 100, "2>4": 100 };
  const serviceEnriched = await enrichDuriAnalysisInput(serviceInput, "2026-07-14T00:00:00.000Z", {
    requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
    requestTourDetail: async (contentId) => {
      serviceEvents.push(`tour-${contentId}`);
      return { intro: contentId === "2" ? { usetime: "09:00~18:00" } : {} };
    },
    requestDirections: async ({ origin, destination }) => {
      serviceEvents.push(`route-${origin.lat}>${destination.lat}`);
      const durationSeconds = serviceCosts[`${origin.lat}>${destination.lat}`];
      if (durationSeconds === undefined) throw new Error("unexpected service route pair");
      return { distanceMeters: durationSeconds * 10, durationSeconds, source: "kakao-mobility" };
    },
  });
  const firstRouteEvent = serviceEvents.findIndex((event) => event.startsWith("route-"));
  const lastTourEvent = serviceEvents.map((event, index) => ({ event, index })).filter(({ event }) => event.startsWith("tour-")).at(-1)?.index ?? -1;
  assert(firstRouteEvent > lastTourEvent && serviceEnriched.routeOrderEvaluations?.[0]?.swappedItemIds.join(",") === "service-3,service-4", "evidence 24b: Tour fixed facts are collected before route optimization and preserve the best valid fallback");

  const burstPlaces = Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const id = `tour:${20_000 + index}`;
    return [id, place(id)];
  }));
  let activeTourCalls = 0;
  let maxActiveTourCalls = 0;
  await enrichDuriAnalysisInput({
    ...carInput,
    trip: { ...carInput.trip, transport: "public" },
    placesById: burstPlaces,
    itinerary: Object.keys(burstPlaces).map((placeId, index) => item(`burst-${index}`, placeId, "2026-07-18", `${String(8 + index).padStart(2, "0")}:00`)),
  }, "2026-07-14T00:00:00.000Z", {
    requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
    requestTourDetail: async () => {
      activeTourCalls += 1;
      maxActiveTourCalls = Math.max(maxActiveTourCalls, activeTourCalls);
      await Promise.resolve();
      activeTourCalls -= 1;
      return { intro: {} };
    },
    requestTourCongestion: async (contentId) => {
      activeTourCalls += 1;
      maxActiveTourCalls = Math.max(maxActiveTourCalls, activeTourCalls);
      await Promise.resolve();
      activeTourCalls -= 1;
      return { contentId, days: [{ date: "20260718", rate: 50 }] };
    },
    requestDirections: async () => { throw new Error("public mode must not request car directions"); },
  });
  assert(maxActiveTourCalls <= 4, "evidence 24c: Tour detail and congestion requests keep bounded burst concurrency");

  const autoFillCandidateIds = Array.from({ length: 9 }, (_, index) => `tour:${30_000 + index}`);
  const autoFillCandidateInput: DuriAnalysisInput = {
    ...serviceInput,
    candidates: [candidate("tour:1"), ...autoFillCandidateIds.map((placeId) => candidate(placeId))],
    placesById: {
      ...serviceInput.placesById,
      ...Object.fromEntries(autoFillCandidateIds.map((placeId) => [placeId, place(placeId)])),
    },
    placeConstraintEvidence: [{
      placeId: "tour:1",
      provider: "tour-api",
      fetchedAt: "2026-07-01T00:00:00.000Z",
      recommendedDurationText: "45분",
    }],
    evidenceCollection: {
      route: { requiredLegCount: 3, analyzedLegCount: 0, mode: "car", unavailableReason: "검증용" },
      placeDetails: { scheduledPlaceCount: 4, requestedPlaceCount: 0, fetchedPlaceCount: 0, usablePlaceCount: 0, operatingFactPlaceCount: 0, durationFactPlaceCount: 0 },
    },
  };
  let activeCandidateTourCalls = 0;
  let maxActiveCandidateTourCalls = 0;
  const requestedCandidateTourIds: string[] = [];
  const candidateEvidence = await enrichPreferenceAutoFillCandidateEvidence(autoFillCandidateInput, "2026-08-26T00:00:00.000Z", {
    requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
    requestTourDetail: async (contentId) => {
      requestedCandidateTourIds.push(contentId);
      activeCandidateTourCalls += 1;
      maxActiveCandidateTourCalls = Math.max(maxActiveCandidateTourCalls, activeCandidateTourCalls);
      await Promise.resolve();
      activeCandidateTourCalls -= 1;
      if (contentId === "30004") throw new Error("one candidate detail failed");
      return { intro: { spendtime: `${Number(contentId) % 60 + 30}분` } };
    },
    requestDirections: async () => { throw new Error("candidate duration enrichment must not request routes"); },
  });
  assert(!requestedCandidateTourIds.includes("1")
    && requestedCandidateTourIds.length === autoFillCandidateIds.length
    && maxActiveCandidateTourCalls <= 4,
  "evidence 24d: auto-fill evidence requests only unscheduled candidates with bounded concurrency");
  assert(candidateEvidence.placeConstraintEvidence?.length === autoFillCandidateIds.length
    && candidateEvidence.placeConstraintEvidence.some((entry) => entry.placeId === "tour:1" && entry.fetchedAt === "2026-07-01T00:00:00.000Z")
    && !candidateEvidence.placeConstraintEvidence.some((entry) => entry.placeId === "tour:30004")
    && candidateEvidence.evidenceCollection === autoFillCandidateInput.evidenceCollection,
  "evidence 24e: candidate facts merge fail-soft without changing scheduled analysis coverage");

  const tourPlaces = {
    "tour:126508": { ...place("tour:126508"), contentTypeId: 12 },
    "665abc123def456789012345": place("665abc123def456789012345"),
    "126510": { ...place("126510"), contentTypeId: 15 },
    "987654321": place("987654321", "카페"),
  } satisfies Record<string, Place>;
  const evidenceInput = inputFor(state({
    placesById: { ...places, ...tourPlaces },
    itineraryByTripId: { trip: Object.keys(tourPlaces).map((placeId, index) => item(`external-${index}`, placeId, "2026-07-18", `${String(9 + index * 2).padStart(2, "0")}:00`)), other: [] },
  }));
  const requestedTourIds: string[] = [];
  const requestedCongestionIds: string[] = [];
  const requestedMongoIds: string[] = [];
  const enriched = await enrichDuriAnalysisInput(evidenceInput, "2026-07-14T00:00:00.000Z", {
    requestDirections: async () => { throw new Error("public mode must not request car directions"); },
    requestPlaceReference: async (placeId) => {
      requestedMongoIds.push(placeId);
      return { source: "tour", externalId: "126509" };
    },
    requestTourDetail: async (contentId) => {
      requestedTourIds.push(contentId);
      return { intro: { usetime: "09:00~18:00", restdate: "매주 월요일", spendtime: "90분" } };
    },
    requestTourCongestion: async (contentId) => {
      requestedCongestionIds.push(contentId);
      return {
        contentId,
        days: [{ date: "20260718", rate: 75, busy: false }, { date: "20260719", rate: 91, busy: true }],
      };
    },
  });
  assert(requestedTourIds.sort().join(",") === "126508,126509,126510" && requestedMongoIds[0] === "665abc123def456789012345", "evidence 25: Tour prefixed, Mongo, and legacy IDs resolve without treating numeric Kakao IDs as Tour");
  assert(enriched.placeConstraintEvidence?.length === 3 && enriched.placeConstraintEvidence.every((entry) => entry.fetchedAt === "2026-07-14T00:00:00.000Z"), "evidence 26: fetched Tour facts carry per-place provenance and timestamp");
  assert(requestedCongestionIds.sort().join(",") === "126508,126509,126510"
    && enriched.placeCongestionEvidence?.length === 3
    && enriched.placeCongestionEvidence.every((entry) => entry.date === "2026-07-18" && entry.rate === 75 && entry.forecastRank === 2 && !entry.isForecastPeak),
  "evidence 26a: every resolved Tour place receives exact-date congestion provenance without trusting Backend busy flags");
  assert(JSON.stringify(evidenceInput.placesById) === JSON.stringify({ ...places, ...tourPlaces }), "evidence 27: enrichment never mutates or overwrites local place display facts");
  assert(createDuriInputFingerprint(enriched) === createDuriInputFingerprint(evidenceInput), "evidence 28: ephemeral Tour evidence does not make a fresh analysis look stale");
  const enrichedCoverage = calculateAnalysisCoverage(createDuriAnalysisSnapshot(enriched));
  assert(enriched.evidenceCollection?.placeDetails.requestedPlaceCount === 3
    && enrichedCoverage.operatingData === "partial"
    && enrichedCoverage.congestionData === "partial"
    && enriched.evidenceCollection.congestion?.scheduledPlaceDateCount === 4
    && enriched.evidenceCollection.congestion.matchedPlaceDateCount === 3,
  "evidence 29: mixed Tour and Kakao schedules use all scheduled places and exact place-date pairs as coverage denominators");

  const partiallyFailedCongestion = await enrichDuriAnalysisInput(evidenceInput, "2026-07-14T00:00:00.000Z", {
    requestDirections: async () => { throw new Error("public mode must not request car directions"); },
    requestPlaceReference: async () => ({ source: "tour", externalId: "126509" }),
    requestTourDetail: async () => ({ intro: {} }),
    requestTourCongestion: async (contentId) => {
      if (contentId === "126509") throw new Error("single provider failure");
      return { contentId, days: [{ date: "20260718", rate: 64 }] };
    },
  });
  assert(partiallyFailedCongestion.placeCongestionEvidence?.length === 2
    && partiallyFailedCongestion.evidenceCollection?.congestion?.fetchedPlaceCount === 2
    && partiallyFailedCongestion.evidenceCollection.congestion.unavailableReason?.includes("1개 장소는 혼잡 예측 조회에 실패"),
  "evidence 29a: one congestion failure does not discard other exact-date evidence or stop analysis");

  const stalledSignals: AbortSignal[] = [];
  const neverSettles = (signal?: AbortSignal) => {
    if (signal) stalledSignals.push(signal);
    return new Promise<never>(() => undefined);
  };
  const stalledAutoFillInput: DuriAnalysisInput = {
    ...serviceInput,
    candidates: [candidate("tour:99999")],
    placesById: { ...serviceInput.placesById, "tour:99999": place("tour:99999") },
  };
  const stalledAutoFillEvidence = await Promise.race([
    enrichPreferenceAutoFillCandidateEvidence(stalledAutoFillInput, "2026-08-26T00:00:00.000Z", {
      requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
      requestTourDetail: async (_contentId, signal) => neverSettles(signal),
      requestDirections: async () => { throw new Error("candidate duration enrichment must not request routes"); },
    }, { requestTimeoutMs: 5 }),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("bounded auto-fill evidence collection did not finish")), 1_000)),
  ]);
  assert(stalledAutoFillEvidence === stalledAutoFillInput,
    "evidence 29b: stalled auto-fill evidence returns the original input without blocking generation");
  const partialDeadlineInput: DuriAnalysisInput = {
    ...serviceInput,
    candidates: [candidate("tour:99998"), candidate("tour:99999")],
    placesById: {
      ...serviceInput.placesById,
      "tour:99998": place("tour:99998"),
      "tour:99999": place("tour:99999"),
    },
  };
  const partialDeadlineEvidence = await enrichPreferenceAutoFillCandidateEvidence(partialDeadlineInput, "2026-08-26T00:00:00.000Z", {
    requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
    requestTourDetail: async (contentId, signal) => contentId === "99998"
      ? { intro: { spendtime: "80분" } }
      : neverSettles(signal),
    requestDirections: async () => { throw new Error("candidate duration enrichment must not request routes"); },
  }, { requestTimeoutMs: 5 });
  assert(partialDeadlineEvidence.placeConstraintEvidence?.length === 1
    && partialDeadlineEvidence.placeConstraintEvidence[0].placeId === "tour:99998",
  "evidence 29c: total deadline preserves candidate facts that completed before another provider stalled");
  const stalledEvidence = await Promise.race([
    enrichDuriAnalysisInput(serviceInput, "2026-07-14T00:00:00.000Z", {
      requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
      requestTourDetail: async (_contentId, signal) => neverSettles(signal),
      requestTourCongestion: async (_contentId, signal) => neverSettles(signal),
      requestDirections: async ({ signal }) => neverSettles(signal),
    }, { requestTimeoutMs: 5 }),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("bounded evidence collection did not finish")), 1_000)),
  ]);
  assert(stalledEvidence.routeLegEstimates?.length === 0
    && stalledEvidence.evidenceCollection?.route.analyzedLegCount === 0
    && Boolean(stalledEvidence.evidenceCollection?.route.unavailableReason),
  "evidence 30: never-settling route provider finishes as unavailable instead of hanging analysis");
  assert(stalledEvidence.placeConstraintEvidence?.length === 0
    && stalledEvidence.evidenceCollection?.placeDetails.fetchedPlaceCount === 0
    && Boolean(stalledEvidence.evidenceCollection?.placeDetails.unavailableReason),
  "evidence 31: never-settling Tour provider is isolated and reported unavailable");
  assert(stalledEvidence.placeCongestionEvidence?.length === 0
    && stalledEvidence.evidenceCollection?.congestion?.fetchedPlaceCount === 0
    && Boolean(stalledEvidence.evidenceCollection?.congestion?.unavailableReason),
  "evidence 31a: never-settling congestion provider is isolated and reported unavailable");
  assert(stalledSignals.length > 0 && stalledSignals.every((signal) => signal.aborted),
  "evidence 32: timed-out provider requests receive an aborted signal");

  const externalAbort = new AbortController();
  const externallyAborted = enrichDuriAnalysisInput(serviceInput, "2026-07-14T00:00:00.000Z", {
    requestPlaceReference: async () => { throw new Error("prefixed Tour IDs do not need a CommonPlace lookup"); },
    requestTourDetail: async (_contentId, signal) => neverSettles(signal),
    requestTourCongestion: async (_contentId, signal) => neverSettles(signal),
    requestDirections: async ({ signal }) => neverSettles(signal),
  }, { signal: externalAbort.signal, requestTimeoutMs: 60_000 });
  externalAbort.abort();
  const abortedEvidence = await Promise.race([
    externallyAborted,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("aborted evidence collection did not finish")), 1_000)),
  ]);
  assert(abortedEvidence.routeLegEstimates?.length === 0
    && abortedEvidence.placeConstraintEvidence?.length === 0
    && abortedEvidence.placeCongestionEvidence?.length === 0,
  "evidence 33: caller abort also resolves to a partial/unavailable analysis result");
}

void verifyRouteCollection().then(() => {
console.log("Duri verification passed: 36 analysis + 20 suggestion + 10 atomic + 19 end-condition + evidence/OCR/congestion scenarios");
}).catch((error) => {
  console.error(error);
  throw error;
});
