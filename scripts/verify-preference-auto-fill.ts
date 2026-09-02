import type { ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../src/domain";
import type { ConfirmedScheduleConstraint, DuriAnalysisInput, SharedDuriPreferenceEvidence } from "../src/duri/duri-analysis";
import { applySuggestionChanges, previewSuggestion } from "../src/duri/duri-suggestions";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import {
  buildPreferenceAutoFillSuggestionEnvelope,
  derivePreferenceAutoFillDefaults,
  planPreferenceAutoFill,
  shouldAugmentPreferenceAutoFillWithDiscovery,
} from "../src/features/duri/logic/preferenceAutoFill";
import {
  PreferenceAutoFillRequestAbortedError,
  PreferenceAutoFillRequestTimeoutError,
  requestPreferenceAutoFillWithDeadline,
} from "../src/features/duri/logic/preferenceAutoFillAsync";
import { getTripDates } from "../src/utils/schedule";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let scenarioCount = 0;
function scenario(name: string, run: () => void) {
  run();
  scenarioCount += 1;
  console.log(`PASS ${name}`);
}

async function asyncScenario(name: string, run: () => Promise<void>) {
  await run();
  scenarioCount += 1;
  console.log(`PASS ${name}`);
}

const answers = { pace: 1, budget: 1, mobility: 1, activity: 1, mealStyle: 1, planningStyle: 1 } as const;
const activityIds = ["restaurant", "cafe", "shopping", "attraction", "local", "experience", "nature", "rest"] as const;

function user(id: string): User {
  return { id, name: id, initial: id.slice(0, 1).toUpperCase() };
}

function room(memberIds = ["u1"], overrides: Partial<TripRoom> = {}): TripRoom {
  return {
    id: "trip",
    title: "자동 채우기 검증",
    regionId: "region",
    startDate: "2026-09-01",
    endDate: "2026-09-01",
    status: "planning",
    transport: "public",
    members: memberIds.map((userId, index) => ({ userId, role: index === 0 ? "owner" : "member" })),
    ...overrides,
  };
}

function place(id: string, category = "명소", tags: string[] = [], contentTypeId?: number): Place {
  return {
    id,
    regionId: "region",
    name: id,
    category,
    tags,
    ...(contentTypeId === undefined ? {} : { contentTypeId }),
    distanceLabel: "",
    imageUrl: "",
    address: "부산",
    summary: id,
  };
}

function candidate(placeId: string, addedByUserIds: string[] = []): TripCandidate {
  return { tripId: "trip", placeId, addedByUserIds, recommendedByDuri: false };
}

function item(id: string, placeId: string | undefined, date = "2026-09-01", startTime = "10:00", durationMinutes = 60): ItineraryItem {
  return {
    id,
    tripId: "trip",
    ...(placeId ? { placeId } : {}),
    date,
    startTime,
    durationMinutes,
    itemType: placeId ? "place" : "reservation",
    preferredByUserIds: ["u1"],
  };
}

function preference(
  userId: string,
  options: {
    tags?: string[];
    algorithmVersion?: number;
    levels?: Record<string, "like" | "neutral" | "dislike">;
    scores?: Record<string, number>;
    landmarkImportance?: number;
    localInterest?: number;
    detailed?: boolean;
    window?: { start: number; end: number; duration: number; daily: number };
  } = {},
): UserPreferenceResult {
  const categoryScores = Object.fromEntries(activityIds.map((id) => [id, options.scores?.[id] ?? 0]));
  return {
    userId,
    answers: { ...answers },
    profileType: "검증형",
    traits: [],
    preferredTags: [...(options.tags ?? [])],
    completedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...(options.detailed === false ? {} : {
      detailedSignals: {
        surveyVersion: 9,
        algorithmVersion: options.algorithmVersion ?? 9,
        staminaScore: 50,
        densityScore: 50,
        scheduleStyle: "relaxed",
        mobilityModes: ["walk"],
        categoryScores,
        ...(options.levels ? { categoryPreferenceLevels: { ...options.levels } } : {}),
        budgetRanking: [],
        landmarkImportance: options.landmarkImportance ?? 0,
        localInterest: options.localInterest ?? 0,
        ...(options.window ? {
          preferredDayStartMinutes: options.window.start,
          preferredDayStartResolutionMinutes: 30,
          preferredDayEndMinutes: options.window.end,
          preferredDayEndResolutionMinutes: 30,
          preferredAverageActivityBlockMinutes: options.window.duration,
          preferredAverageActivityBlockResolutionMinutes: 30,
          preferredDailyScheduledMinutes: options.window.daily,
          preferredDailyScheduledResolutionMinutes: 30,
        } : {}),
      },
    }),
  };
}

function input(overrides: Partial<DuriAnalysisInput> = {}): DuriAnalysisInput {
  const trip = overrides.trip ?? room();
  const members = overrides.members ?? trip.members.map((member) => user(member.userId));
  const defaultPlaces = { a: place("a", "카페", ["카페"], 39) };
  return {
    trip,
    members,
    placesById: defaultPlaces,
    candidates: [candidate("a", ["u1"])],
    itinerary: [],
    preferenceResults: {},
    confirmedScheduleConstraints: [],
    documentReferences: [],
    documentCollectionStatus: "loaded",
    localPlanningFactsStatus: "loaded",
    scheduleOverlayStatus: "loaded",
    ...overrides,
  };
}

function sharedPreferences(
  memberIds: string[],
  signals: SharedDuriPreferenceEvidence["candidateSignals"],
  axesByMemberId: Record<string, { landmarkNecessity: number; localInterest: number } | undefined> = {},
): SharedDuriPreferenceEvidence {
  const sharedAxis = (value: number) => ({
    value,
    unit: "score" as const,
    range: [0, 100] as const,
    resolution: 1,
    source: "quiz" as const,
    method: "rule-based-4axis" as const,
  });
  return {
    roomId: "trip",
    factsVersion: 4,
    scheduleVersion: 0,
    members: memberIds.map((userId) => {
      const axes = axesByMemberId[userId];
      return {
        userId,
        nickname: userId,
        travelType: null,
        personalityAxes: axes ? {
          scheduleDensity: sharedAxis(50),
          landmarkNecessity: sharedAxis(axes.landmarkNecessity),
          localInterest: sharedAxis(axes.localInterest),
          challenging: sharedAxis(50),
        } : null,
        mobilityConstraints: { values: [], status: "missing" as const, source: "user", version: 1, updatedAt: null },
        preferenceUpdatedAt: axes ? "2026-08-26T00:00:00.000Z" : null,
        interestTags: [],
      };
    }),
    candidateSignals: signals,
  };
}

const request = {
  dailyStartTime: "09:00",
  dailyEndTime: "18:00",
  proposedVisitDurationMinutes: 60,
  maxNewItems: 1,
};

function confirmed(overrides: Partial<ConfirmedScheduleConstraint> = {}): ConfirmedScheduleConstraint {
  return {
    id: "constraint",
    kind: "reservation",
    label: "확정 예약",
    source: "user-confirmed",
    date: "2026-09-01",
    placeId: "fixed",
    confirmedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

scenario("관측값이 없어도 편집 가능한 낮은 신뢰도 초안 기본값을 제공한다", () => {
  const defaults = derivePreferenceAutoFillDefaults(input({ preferenceResults: { u1: preference("u1", { detailed: false }) } }));
  assert(defaults.dailyStartTime === "10:00" && defaults.dailyEndTime === "20:00", "cold-start 편집 시간창이 필요하다");
  assert(defaults.proposedVisitDurationMinutes === 90 && defaults.maxNewItems === undefined, "편집용 체류 블록과 장소 수 미확정을 구분해야 한다");
  assert(defaults.provisionalTemplateUsed === true && defaults.provisionalDurationUsed === true, "낮은 신뢰도 출처를 숨기면 안 된다");
});

scenario("정보가 없는 기본 초안은 하루 시작에 몰지 않고 남는 시간을 고르게 나눈다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { a: place("a"), b: place("b"), c: place("c") },
    candidates: [candidate("a"), candidate("b"), candidate("c")],
  }));
  assert(result.status === "preview-only" && result.assignments.length === 3, "cold-start에서도 여러 장소로 일정표를 만들어야 한다");
  const starts = result.assignments.map((assignment) => Number(assignment.startTime.slice(0, 2)) * 60 + Number(assignment.startTime.slice(3)));
  assert(starts[0] > 10 * 60 && starts[2] + result.assignments[2].durationMinutes < 20 * 60, "남는 시간을 일정 앞뒤와 장소 사이에 분산해야 한다");
  assert(result.certificate.provisionalRhythm?.adjustedGapCount === 1, "기본 시간창의 여백 분산 provenance가 필요하다");
});

scenario("자동 모드의 후보 공급이 빈 시간보다 적으면 지역 후보 보충을 요청한다", () => {
  const sparse = planPreferenceAutoFill(input());
  assert(sparse.status === "preview-only" && sparse.assignments.length === 1, "한 후보 자체는 안전한 초안이어야 한다");
  assert(shouldAugmentPreferenceAutoFillWithDiscovery(sparse, {}), "자동 장소 수가 후보 공급에 막히면 지역 발견을 한 번 시도해야 한다");
  const explicit = planPreferenceAutoFill(input(), { ...request, maxNewItems: 1 });
  assert(!shouldAugmentPreferenceAutoFillWithDiscovery(explicit, { ...request, maxNewItems: 1 }), "사용자가 한 곳을 명시했으면 임의로 지역 후보를 보태면 안 된다");
});

scenario("부분 일정은 편집 템플릿을 실제 배치 범위까지 확장한다", () => {
  const defaults = derivePreferenceAutoFillDefaults(input({
    placesById: { existing: place("existing"), a: place("a") },
    itinerary: [
      item("day-1", "existing", "2026-09-01", "09:07", 68),
    ],
  }));
  assert(defaults.dailyStartTime === "09:00" && defaults.dailyEndTime === "20:00", "작은 기존 일정 범위로 하루 전체를 좁히지 말고 바깥쪽 시각만 보존해야 한다");
  assert(defaults.proposedVisitDurationMinutes === 90 && defaults.maxNewItems === undefined, "체류시간 자료가 없으면 편집용 블록만 제공해야 한다");
  assert(defaults.sources.some((source) => source.includes("현재 일정 1일")), "기존 일정 fallback 출처를 남겨야 한다");
});

scenario("v9 실제 시간표 관측값만 기본값으로 합의한다", () => {
  const defaults = derivePreferenceAutoFillDefaults(input({
    trip: room(["u1", "u1", "u2"]),
    members: [user("u1"), user("u2")],
    preferenceResults: {
      u1: preference("u1", { window: { start: 600, end: 1080, duration: 60, daily: 180 } }),
      u2: preference("u2", { window: { start: 660, end: 1140, duration: 90, daily: 240 } }),
    },
  }));
  assert(defaults.dailyStartTime && defaults.dailyEndTime && defaults.proposedVisitDurationMinutes, "유효한 관측값은 기본값을 만들어야 한다");
  assert(defaults.sources.every((source) => source.includes("2명")), "중복 멤버 ID를 두 번 관측하면 안 된다");
});

scenario("손상·미래 schema 시간 신호는 render 기본값으로 사용하지 않는다", () => {
  const corrupt = preference("u1", { window: { start: 9999, end: 10_000, duration: 9999, daily: 9999 } });
  const future = preference("u2", { algorithmVersion: 99, window: { start: 600, end: 1080, duration: 60, daily: 180 } });
  const defaults = derivePreferenceAutoFillDefaults(input({ trip: room(["u1", "u2"]), members: [user("u1"), user("u2")], preferenceResults: { u1: corrupt, u2: future } }));
  assert(defaults.dailyStartTime === "10:00" && defaults.proposedVisitDurationMinutes === 90, "손상/미래 관측값 대신 명시된 편집 템플릿을 써야 한다");
  assert(defaults.provisionalTemplateUsed === true, "손상된 관측을 실제 근거로 가장하면 안 된다");
});

scenario("문서 또는 계획 사실을 읽지 못해도 저장 불가 preview를 계속 만든다", () => {
  const documents = planPreferenceAutoFill(input({ documentCollectionStatus: "unavailable" }), request);
  const planning = planPreferenceAutoFill(input({ localPlanningFactsStatus: "unavailable" }), request);
  assert(documents.status === "preview-only" && documents.certificate.degradedEvidence.includes("documents"), "문서 unavailable은 preview 한계로 내려야 한다");
  assert(planning.status === "preview-only" && planning.certificate.degradedEvidence.includes("planning"), "planning unavailable은 preview 한계로 내려야 한다");
  assert(!documents.certificate.localApplyEligible && !planning.certificate.localApplyEligible, "불완전 facts 초안을 적용 가능으로 만들면 안 된다");
});

scenario("API 공유 성향이 stale/unavailable이면 해당 신호를 빼고 preview를 계속 만든다", () => {
  const unavailable = planPreferenceAutoFill(input({ sharedPreferenceEvidenceStatus: "unavailable" }), request);
  const stale = planPreferenceAutoFill(input({ sharedPreferenceEvidenceStatus: "stale" }), request);
  assert(unavailable.status === "preview-only" && unavailable.certificate.degradedEvidence.includes("shared-preferences"), "공유 성향 unavailable preview");
  assert(stale.status === "preview-only" && stale.certificate.degradedEvidence.includes("shared-preferences"), "공유 성향 stale preview");
  assert(unavailable.certificate.sharedEvidenceMemberIds.length === 0, "오래된 공유 성향을 효용에 넣으면 안 된다");
});

scenario("mustVisit/avoid 충돌 후보만 격리하고 안전한 나머지 초안을 계속 만든다", () => {
  const sharedPreferenceEvidence = sharedPreferences(["u1", "u2"], [{
    placeId: "a",
    signals: [
      { userId: "u1", mustVisit: true, avoid: null, preferenceStrength: 5, version: 1, updatedAt: null },
      { userId: "u2", mustVisit: null, avoid: true, preferenceStrength: 1, version: 1, updatedAt: null },
    ],
  }]);
  const result = planPreferenceAutoFill(input({
    trip: room(["u1", "u2"]),
    members: [user("u1"), user("u2")],
    placesById: { a: place("a"), b: place("b", "공원", ["자연"]) },
    candidates: [candidate("a", ["u1"]), candidate("b", ["u2"])],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "preview-only" && result.assignments.length === 1 && result.assignments[0].placeId === "b", "충돌 없는 후보 일정은 보존해야 한다");
  assert(result.limitations.some((limitation) => limitation.includes("충돌한 후보 1곳")), "보류한 충돌 후보를 알려야 한다");
});

scenario("API stress 데모방은 5개 부분 일정에서 입력 없이 성향 후보 preview를 만든다", () => {
  const memberIds = ["owner", "local", "active", "comfort", "budget"];
  const placesById = {
    gamcheon: { ...place("gamcheon", "명소", ["문화", "사진"], 12), latitude: 35.097, longitude: 128.956 },
    jagalchi: { ...place("jagalchi", "시장", ["시장", "식사"], 38), latitude: 35.097, longitude: 129.03 },
    gukje: { ...place("gukje", "시장", ["시장", "쇼핑"], 38), latitude: 35.102, longitude: 129.028 },
    haedong: { ...place("haedong", "명소", ["문화", "바다"], 12), latitude: 35.188, longitude: 129.223 },
    xsky: { ...place("xsky", "명소", ["전망대", "입장권"], 12), latitude: 35.159, longitude: 129.169 },
    haeundae: { ...place("haeundae", "명소", ["바다", "휴식"], 12), latitude: 35.158, longitude: 129.16 },
    gwangalli: { ...place("gwangalli", "명소", ["바다", "야경"], 12), latitude: 35.153, longitude: 129.118 },
    taejongdae: { ...place("taejongdae", "명소", ["자연", "산책"], 12), latitude: 35.051, longitude: 129.087 },
    huinnyeoul: { ...place("huinnyeoul", "명소", ["문화", "카페"], 12), latitude: 35.078, longitude: 129.044 },
  };
  const sharedPreferenceEvidence = sharedPreferences(memberIds, [
    {
      placeId: "haedong",
      signals: [
        { userId: "owner", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
        { userId: "local", mustVisit: false, avoid: false, preferenceStrength: 1, version: 1, updatedAt: null },
        { userId: "active", mustVisit: false, avoid: false, preferenceStrength: 5, version: 1, updatedAt: null },
        { userId: "comfort", mustVisit: false, avoid: false, preferenceStrength: 2, version: 1, updatedAt: null },
        { userId: "budget", mustVisit: false, avoid: false, preferenceStrength: 3, version: 1, updatedAt: null },
      ],
    },
    {
      placeId: "haeundae",
      signals: [
        { userId: "owner", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
        { userId: "local", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
        { userId: "active", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
        { userId: "comfort", mustVisit: true, avoid: false, preferenceStrength: 5, version: 1, updatedAt: null },
        { userId: "budget", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
      ],
    },
    {
      placeId: "gukje",
      signals: [
        { userId: "owner", mustVisit: false, avoid: false, preferenceStrength: 3, version: 1, updatedAt: null },
        { userId: "local", mustVisit: false, avoid: false, preferenceStrength: 5, version: 1, updatedAt: null },
        { userId: "active", mustVisit: false, avoid: false, preferenceStrength: 1, version: 1, updatedAt: null },
        { userId: "comfort", mustVisit: false, avoid: false, preferenceStrength: 2, version: 1, updatedAt: null },
        { userId: "budget", mustVisit: true, avoid: false, preferenceStrength: 5, version: 1, updatedAt: null },
      ],
    },
    {
      placeId: "huinnyeoul",
      signals: [
        { userId: "owner", mustVisit: false, avoid: false, preferenceStrength: 1, version: 1, updatedAt: null },
        { userId: "local", mustVisit: false, avoid: false, preferenceStrength: 5, version: 1, updatedAt: null },
        { userId: "active", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
        { userId: "comfort", mustVisit: false, avoid: true, preferenceStrength: 1, version: 1, updatedAt: null },
        { userId: "budget", mustVisit: false, avoid: false, preferenceStrength: 4, version: 1, updatedAt: null },
      ],
    },
  ]);
  const result = planPreferenceAutoFill(input({
    trip: room(memberIds, { startDate: "2026-09-25", endDate: "2026-09-27" }),
    members: memberIds.map(user),
    placesById,
    candidates: Object.keys(placesById).map((placeId) => candidate(placeId, [memberIds[0]])),
    itinerary: [
      item("fixture-gamcheon", "gamcheon", "2026-09-25", "09:30", 135),
      item("fixture-jagalchi", "jagalchi", "2026-09-25", "12:30", 105),
      item("fixture-xsky", "xsky", "2026-09-26", "12:15", 120),
      item("fixture-gwangalli", "gwangalli", "2026-09-26", "17:00", 135),
      item("fixture-taejongdae", "taejongdae", "2026-09-27", "09:30", 135),
    ],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), {});
  assert(result.status === "preview-only" && result.assignments.length > 0, "부분 일정에서 실제 preview가 생성되어야 한다");
  assert(result.assignments.some((assignment) => assignment.placeId === "gukje"), "미배치 must 후보 국제시장을 포함해야 한다");
  assert(result.assignments.some((assignment) => assignment.placeId === "haeundae"), "미배치 must 후보 해운대해수욕장을 포함해야 한다");
  assert(result.assignments.every((assignment) => assignment.placeId !== "huinnyeoul"), "avoid가 있는 흰여울 후보는 제외해야 한다");
  const addedPerDay = result.certificate.dayAllocations.map((day) => day.addedCount);
  assert(Math.max(...addedPerDay) - Math.min(...addedPerDay) <= 1, "지리적 근접성보다 DAY별 일정 부하 균형을 먼저 지켜야 한다");
  assert((result.certificate.geographicPlacement?.comparableAssignmentCount ?? 0) > 0, "좌표와 앞뒤 경계가 있는 배치는 지리적 순서를 비교해야 한다");
  assert(result.certificate.countBasis === "maximal-feasible-schedule", "장소 수 입력 없이 실제 빈 구간의 최대 배치 가능 묶음을 사용해야 한다");
});

scenario("mustVisit은 효용 점수와 무관하게 포함하고 avoid 후보는 제외한다", () => {
  const placesById = { a: place("a"), b: place("b") };
  const sharedPreferenceEvidence = sharedPreferences(["u1"], [
    { placeId: "a", signals: [{ userId: "u1", mustVisit: true, avoid: null, preferenceStrength: 1, version: 1, updatedAt: null }] },
    { placeId: "b", signals: [{ userId: "u1", mustVisit: null, avoid: null, preferenceStrength: 5, version: 1, updatedAt: null }] },
  ]);
  const mandatory = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("a"), candidate("b")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(mandatory.status === "preview-only" && mandatory.assignments[0].placeId === "a", "mustVisit hard inclusion");

  const avoidEvidence = sharedPreferences(["u1"], [
    { placeId: "a", signals: [{ userId: "u1", mustVisit: null, avoid: true, preferenceStrength: 5, version: 1, updatedAt: null }] },
    { placeId: "b", signals: [{ userId: "u1", mustVisit: null, avoid: null, preferenceStrength: 1, version: 1, updatedAt: null }] },
  ]);
  const avoided = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("a"), candidate("b")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence: avoidEvidence,
  }), request);
  assert(avoided.status === "preview-only" && avoided.assignments[0].placeId === "b", "avoid candidate exclusion");
  assert(avoided.certificate.excludedAvoidPlaceIds.includes("a"), "제외 근거 certificate");
});

scenario("초안을 만들 수 없을 때 실제 후보 차단 원인을 구분해 안내한다", () => {
  const alreadyScheduled = planPreferenceAutoFill(input({
    placesById: { a: place("a") },
    candidates: [candidate("a")],
    itinerary: [item("scheduled-a", "a")],
  }), request);
  assert(alreadyScheduled.status === "no-candidates" && alreadyScheduled.message.includes("모두 이미 일정"), "모든 후보가 배치된 상태를 제외 의견 문제로 오인하면 안 된다");

  const avoidEvidence = sharedPreferences(["u1"], [{
    placeId: "a",
    signals: [{ userId: "u1", mustVisit: false, avoid: true, preferenceStrength: 1, version: 1, updatedAt: null }],
  }]);
  const allAvoided = planPreferenceAutoFill(input({
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence: avoidEvidence,
  }), request);
  assert(allAvoided.status === "no-candidates"
    && allAvoided.message.includes("제외·불호")
    && allAvoided.limitations.some((limitation) => limitation.includes("명시적 제외")),
  "제외 후보 수와 장소를 확인 가능한 안내로 남겨야 한다");
});

scenario("후보 preferenceStrength 1~5는 결측과 분리된 명시적 ordinal 근거다", () => {
  const placesById = { a: place("a"), b: place("b") };
  const sharedPreferenceEvidence = sharedPreferences(["u1"], [
    { placeId: "a", signals: [{ userId: "u1", mustVisit: null, avoid: null, preferenceStrength: 1, version: 1, updatedAt: null }] },
    { placeId: "b", signals: [{ userId: "u1", mustVisit: null, avoid: null, preferenceStrength: 5, version: 1, updatedAt: null }] },
  ]);
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("a"), candidate("b")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "preview-only" && result.assignments[0].placeId === "b", "높은 명시적 ordinal 강도를 우선해야 한다");
  assert(result.assignments[0].preferenceEvidence[0].sharedCandidateSignal?.preferenceStrength === 5, "신호 값과 provenance 보존");
  assert(result.certificate.fairness?.utilityModel === "ordinal-candidate-rank"
    && result.certificate.fairness.maximumRegret >= 0
    && result.certificate.fairness.maximumRegret <= 1,
  "공정 선택의 순위효용 모델과 regret 진단을 남겨야 한다");
});

scenario("서버 파생 축은 의미가 직접 연결되는 장소 taxonomy에만 사용한다", () => {
  const placesById = {
    attraction: place("attraction", "명소", [], 12),
    local: place("local", "로컬", ["로컬"]),
  };
  const sharedPreferenceEvidence = sharedPreferences(["u1"], [
    { placeId: "attraction", signals: [] },
    { placeId: "local", signals: [] },
  ], { u1: { landmarkNecessity: 25, localInterest: 75 } });
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("attraction"), candidate("local")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "preview-only" && result.assignments[0].placeId === "local", "localInterest exact axis mapping");
  assert(result.certificate.sharedEvidenceMemberIds.includes("u1"), "shared evidence provenance");
});

scenario("기존 일정 불변식 위반을 모두 차단한다", () => {
  const p = { existing: place("existing"), a: place("a") };
  const invalidItineraries: ItineraryItem[][] = [
    [{ ...item("x", "existing"), tripId: "other" }],
    [item("x", "existing", "2026-09-02")],
    [item("x", "existing"), item("x", "existing", "2026-09-01", "12:00")],
    [item("x", "missing")],
    [item("x", "existing", "2026-09-01", "10:00", 120), item("y", "existing", "2026-09-01", "11:00", 60)],
  ];
  invalidItineraries.forEach((itinerary, index) => {
    const result = planPreferenceAutoFill(input({ placesById: p, itinerary }), request);
    assert(result.status === "insufficient-data", `기존 일정 불변식 ${index + 1}을 차단해야 한다`);
  });
});

scenario("연결된 확정 사실과 일정 시간이 다르면 생성 자체를 차단한다", () => {
  const existing = item("existing-item", "existing", "2026-09-01", "10:00", 60);
  const result = planPreferenceAutoFill(input({
    placesById: { existing: place("existing"), a: place("a") },
    itinerary: [existing],
    confirmedScheduleConstraints: [confirmed({ itineraryItemId: existing.id, placeId: "existing", startTime: "14:00", endTime: "15:00" })],
  }), request);
  assert(result.status === "insufficient-data", "14시 확정 사실을 10시 일정으로 대체하면 안 된다");
});

scenario("종료 시각을 모르는 예약 이후는 안전하다고 추정하지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    confirmedScheduleConstraints: [confirmed({ startTime: "14:00" })],
  }), { ...request, maxNewItems: 8 });
  assert(result.status === "preview-only", "예약 전에는 초안을 만들 수 있어야 한다");
  assert(result.assignments.every((assignment) => Number(assignment.startTime.slice(0, 2)) * 60 + Number(assignment.startTime.slice(3)) + assignment.durationMinutes <= 14 * 60), "14시 이후를 배치하면 안 된다");
});

scenario("일정에 연결되지 않은 확정 장소 후보는 임의 슬롯에 배치하지 않는다", () => {
  const placesById = { fixed: place("fixed"), safe: place("safe") };
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("fixed", ["u1"]), candidate("safe", ["u1"])],
    confirmedScheduleConstraints: [confirmed({ placeId: "fixed", startTime: "12:00", endTime: "13:00" })],
  }), request);
  assert(result.status === "preview-only" && result.assignments[0].placeId === "safe", "확정 장소를 generic auto-fill에서 제외해야 한다");
});

scenario("모두 명시적 중립인 후보를 선호 근거로 꾸미지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { neutral: place("neutral", "카페", [], undefined) },
    candidates: [candidate("neutral")],
    preferenceResults: { u1: preference("u1", { levels: { cafe: "neutral" }, scores: { cafe: 50 } }) },
  }), request);
  assert(result.status === "preview-only"
    && result.certificate.selectionBasis === "neutral-structural"
    && result.certificate.modeledMemberIds.length === 0
    && result.certificate.fairness === undefined
    && result.assignments[0].preferenceEvidence.length === 0,
  "neutral 50은 positive evidence가 아니지만 중립 구조 초안은 만들 수 있어야 한다");
});

scenario("한 참여자의 명시적 불호를 비용 없이 무시하지 않는다", () => {
  const trip = room(["u1", "u2"]);
  const result = planPreferenceAutoFill(input({
    trip,
    members: [user("u1"), user("u2")],
    placesById: {
      restaurant: place("restaurant", "식당", [], 39),
      cafe: place("cafe", "카페", ["카페"]),
    },
    candidates: [candidate("restaurant"), candidate("cafe")],
    preferenceResults: {
      u1: preference("u1", { levels: { restaurant: "like", cafe: "like" } }),
      u2: preference("u2", { levels: { restaurant: "dislike", cafe: "neutral" } }),
    },
  }), request);
  assert(result.status === "preview-only" && result.assignments[0].placeId === "cafe", "불호가 없는 공정 대안을 선택해야 한다");
});

scenario("직접 담기와 exact tag가 하위 ordinal/numeric 근거를 엄밀히 지배한다", () => {
  const tags = Array.from({ length: 64 }, (_, index) => `tag-${index}`);
  const directPlan = planPreferenceAutoFill(input({
    placesById: {
      direct: place("direct", "식당", []),
      lower: place("lower", "카페", tags),
    },
    candidates: [candidate("direct", ["u1"]), candidate("lower")],
    preferenceResults: { u1: preference("u1", { tags, levels: { restaurant: "dislike", cafe: "like" }, scores: { cafe: 100 }, localInterest: 100 }) },
  }), request);
  assert(directPlan.status === "preview-only" && directPlan.assignments[0].placeId === "direct", "직접 담기 1건이 모든 하위 근거보다 우선해야 한다");

  const tagPlan = planPreferenceAutoFill(input({
    placesById: { tagged: place("tagged", "식당", ["exact"]), ordinal: place("ordinal", "카페") },
    candidates: [candidate("tagged"), candidate("ordinal")],
    preferenceResults: { u1: preference("u1", { tags: ["exact"], levels: { restaurant: "dislike", cafe: "like" }, scores: { cafe: 100 } }) },
  }), request);
  assert(tagPlan.status === "preview-only" && tagPlan.assignments[0].placeId === "tagged", "exact tag 1건이 signed ordinal/numeric 범위보다 우선해야 한다");
});

scenario("직접 후보 담기는 설문 미응답과 구분하고 snapshot 태그는 exact match만 쓴다", () => {
  const direct = planPreferenceAutoFill(input({ preferenceResults: {} }), request);
  assert(direct.status === "preview-only" && direct.certificate.candidateSelectionOnlyMemberIds.includes("u1"), "직접 담기 행동을 근거로 보존해야 한다");
  const snapshot = planPreferenceAutoFill(input({
    placesById: { sea: place("sea", "명소", ["바다"]) },
    candidates: [candidate("sea")],
    preferenceResults: {},
  }), { ...request, supplementalPreferenceEvidenceByMemberId: { u1: { source: "travel-type-snapshot", tags: [" 바다 "] } } });
  assert(snapshot.status === "preview-only" && snapshot.certificate.snapshotEvidenceMemberIds.includes("u1"), "서버 snapshot exact tag를 저신뢰 근거로 사용해야 한다");
});

scenario("여러 날짜는 최소 부하 우선으로 분산하고 하루 일정량은 Hard cap이 아니다", () => {
  const candidates = ["a", "b", "c", "d"].map((id) => candidate(id, ["u1"]));
  const placesById = Object.fromEntries(candidates.map((entry) => [entry.placeId, place(entry.placeId)]));
  const twoDays = input({ trip: room(["u1"], { endDate: "2026-09-02" }), candidates, placesById });
  const distributed = planPreferenceAutoFill(twoDays, { ...request, dailyStartTime: "09:00", dailyEndTime: "12:00", maxNewItems: 4 });
  assert(distributed.status === "preview-only", "여러 날짜 초안을 만들어야 한다");
  assert(new Set(distributed.assignments.map((assignment) => assignment.date)).size === 2, "첫날에 몰지 않고 날짜별로 분산해야 한다");

  const dailySoft = planPreferenceAutoFill(input({
    candidates: candidates.slice(0, 3),
    placesById,
    preferenceResults: { u1: preference("u1", { window: { start: 540, end: 1080, duration: 60, daily: 60 } }) },
  }), { ...request, maxNewItems: 3 });
  assert(dailySoft.status === "preview-only" && dailySoft.assignments.length === 3, "명시 요청이 물리 슬롯 안이면 Soft 하루 목표를 넘어도 preview해야 한다");
  assert(dailySoft.limitations.some((entry) => entry.includes("Soft 목표를 넘")), "초과 사실은 숨기지 않아야 한다");
});

scenario("같은 여행의 contentType 실제 체류시간을 후보별로 적응시킨다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: {
      observedRestaurant: place("observedRestaurant", "식당", [], 39),
      a: place("a", "식당", [], 39),
    },
    itinerary: [item("observed-restaurant-item", "observedRestaurant", "2026-09-01", "10:00", 75)],
    candidates: [candidate("a", ["u1"])],
  }), request);
  assert(result.status === "preview-only", "부분 일정의 체류시간 표본으로 초안을 만들어야 한다");
  assert(result.assignments[0].durationMinutes === 75, "같은 contentType의 실제 75분을 사용해야 한다");
  assert(result.assignments[0].durationEvidence.source === "content-type"
    && result.assignments[0].durationEvidence.supportingItemIds.join(",") === "observed-restaurant-item",
  "체류시간 provenance를 보존해야 한다");
});

scenario("세부 관광분류 단일 표본을 넓은 실제 cohort로 경험적 수축한다", () => {
  const detailed = { lclsSystm2: "FOOD", lclsSystm3: "CAFE" };
  const other = { lclsSystm2: "FOOD", lclsSystm3: "DINING" };
  const result = planPreferenceAutoFill(input({
    placesById: {
      exact: { ...place("exact", "카페", [], 39), classification: detailed },
      broad: { ...place("broad", "식당", [], 39), classification: other },
      a: { ...place("a", "카페", [], 39), classification: detailed },
    },
    itinerary: [
      item("exact-item", "exact", "2026-09-01", "10:00", 45),
      item("broad-item", "broad", "2026-09-01", "14:00", 180),
    ],
    candidates: [candidate("a", ["u1"])],
  }), request);
  assert(result.status === "preview-only" && result.assignments[0].durationMinutes === 120, "45분 단일값을 그대로 전파하지 않고 180분 상위 표본과 수축해야 한다");
  assert(result.assignments[0].durationEvidence.source === "classification-level-3"
    && result.assignments[0].durationEvidence.sampleSize === 2
    && result.assignments[0].durationEvidence.shrinkageApplied
    && result.assignments[0].durationEvidence.components.length === 2,
  "가장 구체적인 출처와 수축 component를 모두 표시해야 한다");
});

scenario("세부 cohort의 단일 outlier는 상위 cohort 표본수와 산포에 따라 강하게 수축된다", () => {
  const candidateClassification = { lclsSystm2: "CULTURE", lclsSystm3: "SPECIAL" };
  const parentClassification = { lclsSystm2: "CULTURE", lclsSystm3: "GENERAL" };
  const parentIds = ["parent-0", "parent-1", "parent-2", "parent-3"];
  const placesById = {
    outlier: { ...place("outlier", "문화시설", [], 14), classification: candidateClassification },
    a: { ...place("a", "문화시설", [], 14), classification: candidateClassification },
    ...Object.fromEntries(parentIds.map((id) => [id, { ...place(id, "문화시설", [], 14), classification: parentClassification }])),
  };
  const result = planPreferenceAutoFill(input({
    placesById,
    itinerary: [
      item("outlier-item", "outlier", "2026-09-01", "00:00", 300),
      ...parentIds.map((id, index) => item(`parent-item-${index}`, id, "2026-09-01", `0${5 + index}:00`, 60)),
    ],
    candidates: [candidate("a", ["u1"])],
  }), request);
  assert(result.status === "preview-only", "outlier가 있어도 안전한 초안을 만들어야 한다");
  const evidence = result.assignments[0].durationEvidence;
  assert(evidence.durationMinutes === 105 && evidence.durationMinutes < 300, "단일 300분 outlier를 60분 상위 표본 4개로 수축해야 한다");
  assert(evidence.components[0].normalizedPrecisionWeight < evidence.components[1].normalizedPrecisionWeight
    && evidence.effectiveSampleSize > 1,
  "표본수와 empirical dispersion에서 계산한 precision을 노출해야 한다");
});

scenario("장소 표본이 없으면 그룹 설문 activity-block 구간 minimax로 자동 체류시간을 정한다", () => {
  const result = planPreferenceAutoFill(input({
    trip: room(["u1", "u2"]),
    members: [user("u1"), user("u2")],
    candidates: [candidate("a", ["u1", "u2"])],
    preferenceResults: {
      u1: preference("u1", { window: { start: 540, end: 1080, duration: 60, daily: 240 } }),
      u2: preference("u2", { window: { start: 540, end: 1080, duration: 120, daily: 240 } }),
    },
  }), { dailyStartTime: "09:00", dailyEndTime: "18:00", maxNewItems: 1 });
  assert(result.status === "preview-only" && result.assignments[0].durationMinutes === 90, "두 측정 구간 사이 minimax 90분을 사용해야 한다");
  assert(result.assignments[0].durationEvidence.source === "group-schedule-consensus"
    && result.assignments[0].durationEvidence.sampleSize === 2,
  "그룹 시간표 관측 인원을 근거로 남겨야 한다");
});

scenario("TourAPI 안내 소요시간 하한만 있으면 상한을 꾸미지 않고 15분 격자로 배치한다", () => {
  const result = planPreferenceAutoFill(input({
    placeConstraintEvidence: [{
      placeId: "a",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      recommendedDurationText: "약 1시간 10분",
    }],
  }), {
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    maxNewItems: 1,
  });
  assert(result.status === "preview-only" && result.assignments[0].durationMinutes === 75, "공식 하한 70분을 15분 단위로 올려야 한다");
  const evidence = result.assignments[0].durationEvidence;
  assert(evidence.source === "tour-recommended-minimum"
    && evidence.lowerBoundOnly
    && evidence.upperMinutes === undefined
    && evidence.sampleSize === 0
    && evidence.officialMinimumMinutes === 70
    && evidence.officialRecommendedDurationText === "약 1시간 10분",
  "하한 전용 provenance를 통계 표본이나 양방향 범위로 꾸미면 안 된다");
});

scenario("TourAPI 공식 하한은 경험적 장소 체류시간 추정의 floor로 작동한다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: {
      observed: place("observed", "문화시설", [], 14),
      a: place("a", "문화시설", [], 14),
    },
    itinerary: [item("observed-item", "observed", "2026-09-01", "10:00", 45)],
    candidates: [candidate("a", ["u1"])],
    placeConstraintEvidence: [{
      placeId: "a",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      recommendedDurationText: "1시간 20분 소요",
    }],
  }), request);
  assert(result.status === "preview-only", "공식 하한과 경험적 표본을 함께 사용해야 한다");
  const evidence = result.assignments[0].durationEvidence;
  assert(evidence.durationMinutes === 90
    && evidence.lowerMinutes === 90
    && evidence.upperMinutes === undefined
    && evidence.source === "content-type"
    && !evidence.lowerBoundOnly
    && evidence.rangeUnknown
    && !evidence.officialFloorExceededReferenceRange
    && evidence.preOfficialDurationMinutes === 45
    && evidence.preOfficialUpperMinutes === undefined
    && evidence.officialMinimumMinutes === 80
    && evidence.supportingItemIds.join(",") === "observed-item",
  "단일 경험 표본을 정확한 범위로 꾸미지 않으면서 공식 하한과 provenance를 보존해야 한다");
});

scenario("관련 없는 단일 극단 체류시간을 다른 후보 분류에 복사하지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: {
      hike: place("hike", "레포츠", [], 28),
      cafeA: place("cafeA", "카페", [], 39),
      cafeB: place("cafeB", "카페", [], 39),
    },
    candidates: [candidate("hike"), candidate("cafeA"), candidate("cafeB")],
    preferenceResults: {},
    placeConstraintEvidence: [{
      placeId: "hike",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      recommendedDurationText: "10시간",
    }],
  }), { maxNewItems: 3 });
  assert(result.status === "preview-only" && result.assignments.map((assignment) => assignment.placeId).sort().join(",") === "cafeA,cafeB", "10시간 레포츠 한 곳 때문에 카페까지 10시간으로 만들면 안 된다");
  assert(result.assignments.every((assignment) => assignment.durationMinutes === 90
    && assignment.durationEvidence.source === "editable-template"),
  "taxonomy 근거가 없는 카페는 공개된 낮은 신뢰도 편집 템플릿을 사용해야 한다");
});

scenario("자료가 부족해도 편집용 체류시간과 전환 여유로 현실적인 최대 초안을 만든다", () => {
  const noDuration = planPreferenceAutoFill(input(), {
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    maxNewItems: 1,
  });
  assert(noDuration.status === "preview-only" && noDuration.assignments[0].durationMinutes === 90, "체류시간 자료가 없어도 편집 가능한 초안을 제공해야 한다");
  assert(noDuration.assignments[0].durationEvidence.source === "editable-template", "편집 템플릿을 실제 근거로 가장하면 안 된다");
  const candidateIds = ["a", "b", "c", "d"];
  const noCount = planPreferenceAutoFill(input({
    placesById: Object.fromEntries(candidateIds.map((id) => [id, place(id)])),
    candidates: candidateIds.map((id) => candidate(id, [])),
  }), {
    dailyStartTime: "09:00",
    dailyEndTime: "13:00",
    proposedVisitDurationMinutes: 60,
  });
  assert(noCount.status === "preview-only" && noCount.assignments.length === 3, "이동 미확인 상태에서 네 장소를 이동 0분으로 연속 배치하면 안 된다");
  assert(noCount.assignments[1].startTime === "10:15" && noCount.assignments[2].startTime === "11:30", "장소 사이 15분 편집 여유를 보존해야 한다");
  assert(noCount.certificate.countBasis === "maximal-feasible-schedule"
    && noCount.certificate.feasibleCountRange?.minimum === 1
    && noCount.certificate.feasibleCountRange.maximumConfirmed === 3
    && noCount.certificate.feasibleCountRange.selected === 3
    && noCount.certificate.feasibleCountRange.selectionPolicy === "maximal-feasible",
  "체류와 전환 여유를 함께 넣은 최대 배치 가능 근거를 남겨야 한다");
});

scenario("선호 근거가 전혀 없어도 중립 후보를 꾸며낸 만족도 없이 결정적으로 배치한다", () => {
  const candidates = [candidate("a", []), candidate("b", []), candidate("c", []), candidate("d", [])];
  const placesById = {
    a: place("a", "카페", [], 39),
    b: place("b", "카페", [], 39),
    c: place("c", "명소", [], 12),
    d: place("d", "시장", [], 38),
  };
  const requestWithoutCount = { dailyStartTime: "09:00", dailyEndTime: "13:00", proposedVisitDurationMinutes: 60 };
  const forward = planPreferenceAutoFill(input({ placesById, candidates, preferenceResults: {} }), requestWithoutCount);
  const reverse = planPreferenceAutoFill(input({ placesById, candidates: [...candidates].reverse(), preferenceResults: {} }), requestWithoutCount);
  assert(forward.status === "preview-only" && reverse.status === "preview-only", "중립 후보 초안을 만들어야 한다");
  assert(forward.certificate.selectionBasis === "neutral-structural"
    && forward.certificate.preferenceEvidenceMemberIds.length === 0
    && forward.certificate.modeledMemberIds.length === 0
    && forward.certificate.missingPreferenceMemberIds.join(",") === "u1"
    && forward.certificate.fairness === undefined
    && Object.keys(forward.certificate.normalizedSatisfactionByMember).length === 0,
  "미응답자를 중립 점수로 채우거나 만족도를 계산하면 안 된다");
  assert(forward.assignments.every((assignment) => !assignment.preferredByUserIds.length && !assignment.preferenceEvidence.length), "장소별 선호 provenance를 꾸미면 안 된다");
  assert(forward.assignments.length === 3 && forward.certificate.structuralSelection?.recognizedCategoryCount === 3, "전환 여유를 지키면서 서로 다른 장소 분류를 우선해야 한다");
  assert(JSON.stringify(forward.assignments) === JSON.stringify(reverse.assignments), "후보 입력 순서가 중립 초안을 바꾸면 안 된다");
});

scenario("중립 후보의 분류가 같고 좌표가 모두 있으면 MST 직선거리로 밀집된 묶음을 고른다", () => {
  const placesById = {
    a: { ...place("a", "명소", [], 12), latitude: 35, longitude: 129 },
    b: { ...place("b", "명소", [], 12), latitude: 36, longitude: 130 },
    c: { ...place("c", "명소", [], 12), latitude: 36.001, longitude: 130.001 },
    d: { ...place("d", "명소", [], 12), latitude: 34, longitude: 128 },
  };
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: Object.keys(placesById).map((placeId) => candidate(placeId, [])),
    preferenceResults: {},
  }), { dailyStartTime: "09:00", dailyEndTime: "13:00", proposedVisitDurationMinutes: 60, maxNewItems: 2 });
  assert(result.status === "preview-only" && result.assignments.map((assignment) => assignment.placeId).sort().join(",") === "b,c", "가장 가까운 두 후보를 선택해야 한다");
  assert(result.certificate.structuralSelection?.comparableCoordinateCoverage
    && (result.certificate.structuralSelection.mstDistanceMeters ?? Infinity) < 200,
  "모든 후보에 좌표가 있을 때만 MST 보조 지표를 기록해야 한다");
});

scenario("같은 빈 구간의 여러 장소는 양 끝 기존 일정을 포함한 최단 직선거리 순서로 재배치한다", () => {
  const locatedPlace = (id: string, longitude: number) => ({
    ...place(id, "명소", [], 12),
    latitude: 35.15,
    longitude,
  });
  const placesById = {
    previous: locatedPlace("previous", 129.00),
    zNear: locatedPlace("zNear", 129.01),
    mMiddle: locatedPlace("mMiddle", 129.02),
    aFar: locatedPlace("aFar", 129.03),
    next: locatedPlace("next", 129.04),
  };
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("aFar", []), candidate("zNear", []), candidate("mMiddle", [])],
    itinerary: [
      item("previous-item", "previous", "2026-09-01", "09:00", 60),
      item("next-item", "next", "2026-09-01", "14:00", 60),
    ],
    preferenceResults: {},
  }), { dailyStartTime: "09:00", dailyEndTime: "15:00", proposedVisitDurationMinutes: 60, maxNewItems: 3 });
  assert(result.status === "preview-only", "여러 장소 일정 초안을 만들어야 한다");
  assert(result.assignments.map((assignment) => assignment.placeId).join(",") === "zNear,mMiddle,aFar", "기존 양 끝 장소 사이의 자연스러운 방문 순서여야 한다");
  assert(result.assignments.map((assignment) => assignment.startTime).join(",") === "10:15,11:30,12:45", "앞뒤 고정 일정과 재정렬 장소 모두 15분 전환 여유를 포함해 시작 시각을 다시 계산해야 한다");
  assert(result.certificate.geographicPlacement?.optimizedGapCount === 1
    && result.certificate.geographicPlacement.comparableAssignmentCount === 3
    && result.certificate.geographicPlacement.exactSequence,
  "작은 구간은 Held-Karp 순서 최적화 증거를 남겨야 한다");
});

scenario("응답은 있지만 어느 후보와도 연결되지 않으면 중립 모드로 전환하고 명시 개수는 우선한다", () => {
  const resultWithoutDaily = preference("u1", { window: { start: 540, end: 780, duration: 60, daily: 240 } });
  if (resultWithoutDaily.detailedSignals) {
    delete resultWithoutDaily.detailedSignals.preferredDailyScheduledMinutes;
    delete resultWithoutDaily.detailedSignals.preferredDailyScheduledResolutionMinutes;
  }
  const candidates = [candidate("a", []), candidate("b", []), candidate("c", [])];
  const placesById = {
    a: place("a", "카페", [], 39),
    b: place("b", "명소", [], 12),
    c: place("c", "시장", [], 38),
  };
  const automatic = planPreferenceAutoFill(input({ candidates, placesById, preferenceResults: { u1: resultWithoutDaily } }), {});
  const explicit = planPreferenceAutoFill(input({ candidates, placesById, preferenceResults: { u1: resultWithoutDaily } }), { maxNewItems: 1 });
  assert(automatic.status === "preview-only"
    && automatic.certificate.selectionBasis === "neutral-structural"
    && automatic.certificate.countBasis === "maximal-feasible-schedule"
    && automatic.assignments.length === 3,
  "후보와 연결되는 양의 근거 및 하루 일정량이 모두 없어도 자동 초안을 만들어야 한다");
  assert(explicit.status === "preview-only"
    && explicit.assignments.length === 1
    && explicit.certificate.countBasis === "explicit-limit",
  "사용자가 정한 최대 개수는 minimax 자동 개수보다 우선해야 한다");
});

scenario("선호 후보가 일부뿐이면 불호 없는 중립 후보로 요청 개수를 보충한다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: {
      preferred: place("preferred", "카페", ["coffee"], 39),
      neutralA: place("neutralA", "명소", [], 12),
      neutralB: place("neutralB", "시장", [], 38),
    },
    candidates: [candidate("preferred", []), candidate("neutralA", []), candidate("neutralB", [])],
    preferenceResults: { u1: preference("u1", { tags: ["coffee"] }) },
  }), { dailyStartTime: "09:00", dailyEndTime: "13:00", proposedVisitDurationMinutes: 60, maxNewItems: 3 });
  assert(result.status === "preview-only"
    && result.assignments.length === 3
    && result.assignments.some((assignment) => assignment.placeId === "preferred")
    && result.certificate.selectionBasis === "preference-with-neutral-supplement",
  "선호 후보만 남겨 초안을 불필요하게 비우지 않아야 한다");
});

scenario("관측된 하루 일정량의 남은 용량 0을 설문 미응답으로 오인하지 않는다", () => {
  const preferenceResults = {
    u1: preference("u1", { window: { start: 540, end: 1080, duration: 60, daily: 60 } }),
  };
  const full = planPreferenceAutoFill(input({
    placesById: { existing: place("existing"), a: place("a") },
    itinerary: [item("existing-item", "existing", "2026-09-01", "10:00", 60)],
    preferenceResults,
  }), {});
  assert(full.status === "no-space" && full.message.includes("이미 채우고"), "derivedMax=0은 실제 Soft 용량 0으로 설명해야 한다");
  const none = planPreferenceAutoFill(input({ candidates: [], preferenceResults }), {});
  assert(none.status === "no-candidates" && none.message.includes("후보 장소가 없"), "후보 0과 설문 미응답을 구분해야 한다");
});

scenario("서로 다른 체류시간을 exact bin-packing해 겹치지 않게 배치한다", () => {
  const placesById = {
    museumObserved: place("museumObserved", "명소", [], 12),
    cafeObserved: place("cafeObserved", "카페", [], 39),
    a: place("a", "명소", [], 12),
    b: place("b", "카페", [], 39),
  };
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("a", ["u1"]), candidate("b", ["u1"])],
    itinerary: [
      item("museum-observation", "museumObserved", "2026-09-01", "12:00", 120),
      item("cafe-observation", "cafeObserved", "2026-09-01", "16:00", 45),
    ],
  }), { ...request, maxNewItems: 2 });
  assert(result.status === "preview-only" && result.assignments.length === 2, "서로 다른 duration 후보 둘을 배치해야 한다");
  assert(result.assignments.map((assignment) => assignment.durationMinutes).sort((left, right) => left - right).join(",") === "45,120", "후보별 duration을 보존해야 한다");
  const ranges = result.assignments.map((assignment) => ({
    start: Number(assignment.startTime.slice(0, 2)) * 60 + Number(assignment.startTime.slice(3)),
    end: Number(assignment.startTime.slice(0, 2)) * 60 + Number(assignment.startTime.slice(3)) + assignment.durationMinutes,
  })).sort((left, right) => left.start - right.start);
  assert(ranges[0].end <= ranges[1].start, "adaptive duration 배치끼리 겹치면 안 된다");
  assert(result.certificate.durationPackingExact && result.certificate.durationPackingExpandedStates > 0, "bin-packing 증명과 탐색량을 남겨야 한다");
});

scenario("첫 best-fit이 막히는 fragmented gap도 backtracking으로 가능한 배치를 찾는다", () => {
  const observedPlaces = Object.fromEntries([60, 45, 30, 30].map((duration, index) => [
    `observed-${index}`,
    place(`observed-${index}`, `분류-${index}`, [], 100 + index),
  ]));
  const candidatePlaces = Object.fromEntries([60, 45, 30, 30].map((duration, index) => [
    `candidate-${index}`,
    place(`candidate-${index}`, `분류-${index}`, [], 100 + index),
  ]));
  const observations = [
    item("duration-60", "observed-0", "2026-09-01", "00:00", 60),
    item("duration-45", "observed-1", "2026-09-01", "01:00", 45),
    item("duration-30-a", "observed-2", "2026-09-01", "02:00", 30),
    item("duration-30-b", "observed-3", "2026-09-01", "03:00", 30),
    { ...item("fragment", undefined, "2026-09-01", "10:30", 15), itemType: "rest" as const },
  ];
  const result = planPreferenceAutoFill(input({
    placesById: { ...observedPlaces, ...candidatePlaces },
    itinerary: observations,
    candidates: [0, 1, 2, 3].map((index) => candidate(`candidate-${index}`, ["u1"])),
  }), {
    dailyStartTime: "09:00",
    dailyEndTime: "12:30",
    maxNewItems: 4,
  });
  assert(result.status === "preview-only" && result.assignments.length === 4, "90분·105분 gap에 전환 여유와 60·45·30·30분을 모두 넣어야 한다");
  assert(result.certificate.durationPackingExact && result.certificate.durationPackingExpandedStates > 4, "첫 greedy 실패 뒤 exact backtracking을 수행해야 한다");
});

scenario("복귀 cutoff 뒤에는 후보를 배치하지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    trip: room(["u1"], {
      endCondition: {
        type: "train",
        location: { name: "부산역" },
        deadline: "18:00",
        travelMinutes: 60,
        serviceBufferMinutes: 30,
      },
    }),
  }), { ...request, dailyEndTime: "20:00", maxNewItems: 8 });
  assert(result.status === "preview-only", "복귀 cutoff 전 초안은 가능해야 한다");
  assert(result.assignments.every((assignment) => Number(assignment.startTime.slice(0, 2)) * 60 + Number(assignment.startTime.slice(3)) + assignment.durationMinutes <= 16 * 60 + 30), "16:30 cutoff를 넘으면 안 된다");
});

scenario("후보별 Tour 운영시간·휴무를 feasibility와 캐시에 함께 반영한다", () => {
  const placesById = { a: place("a"), b: place("b") };
  const placeConstraintEvidence = [
    { placeId: "a", provider: "tour-api" as const, fetchedAt: "2026-08-26T00:00:00.000Z", operatingHoursText: "18:00~22:00" },
    { placeId: "b", provider: "tour-api" as const, fetchedAt: "2026-08-26T00:00:00.000Z", operatingHoursText: "09:00~12:00" },
  ];
  const daytime = planPreferenceAutoFill(input({
    placesById,
    candidates: [candidate("a"), candidate("b")],
    placeConstraintEvidence,
  }), { dailyStartTime: "09:00", dailyEndTime: "12:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(daytime.status === "preview-only" && daytime.assignments[0]?.placeId === "b", "동일 duration의 야간 후보 실패를 주간 후보 캐시에 재사용하면 안 된다");
  assert(daytime.certificate.operatingFacts.windowRestrictedAssignmentCount === 1, "운영시간을 실제 배치 제약으로 쓴 근거를 남겨야 한다");
  const evening = planPreferenceAutoFill(input({
    placesById: { a: placesById.a },
    candidates: [candidate("a")],
    placeConstraintEvidence: [placeConstraintEvidence[0]],
  }), { dailyStartTime: "09:00", dailyEndTime: "21:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(evening.status === "preview-only" && evening.assignments[0]?.startTime === "18:00", "문을 열기 전으로 배치하면 안 된다");
});

scenario("여행 전 날짜에 휴무인 후보만 남으면 빈 시간 부족으로 오인하지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { closed: place("closed") },
    candidates: [candidate("closed")],
    placeConstraintEvidence: [{
      placeId: "closed",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      restDateText: "매주 화요일",
    }],
  }), { dailyStartTime: "09:00", dailyEndTime: "18:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(result.status === "no-space" && result.message.includes("휴무") && result.message.includes("closed"), "휴무 장소와 원인을 이름으로 안내해야 한다");
});

scenario("저장된 DURI 추천 후보와 이번 요청의 미저장 발견 후보를 구분한다", () => {
  const source = input({
    placesById: { discovered: place("discovered") },
    candidates: [{ ...candidate("discovered"), recommendedByDuri: true }],
  });
  const saved = planPreferenceAutoFill(source, { ...request, maxNewItems: 1 });
  const transient = planPreferenceAutoFill(source, {
    ...request,
    maxNewItems: 1,
    transientDiscoveryPlaceIds: ["discovered"],
  });
  assert(saved.status === "preview-only" && saved.certificate.discoveryCandidatePlaceIds.length === 0, "저장된 추천 후보를 미저장 발견 후보라고 표시하면 안 된다");
  assert(transient.status === "preview-only" && transient.certificate.discoveryCandidatePlaceIds.join(",") === "discovered", "현재 요청이 보탠 장소만 발견 provenance에 남겨야 한다");
});

scenario("오전 마감 장소와 긴 오후 장소의 후보 순서를 함께 탐색한다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { afternoon: place("afternoon"), morning: place("morning") },
    candidates: [candidate("afternoon"), candidate("morning")],
    placeConstraintEvidence: [
      {
        placeId: "afternoon",
        provider: "tour-api",
        fetchedAt: "2026-08-26T00:00:00.000Z",
        recommendedDurationText: "120분",
        operatingHoursText: "12:00~16:00",
      },
      {
        placeId: "morning",
        provider: "tour-api",
        fetchedAt: "2026-08-26T00:00:00.000Z",
        recommendedDurationText: "60분",
        operatingHoursText: "09:00~11:00",
      },
    ],
  }), { dailyStartTime: "09:00", dailyEndTime: "16:00", maxNewItems: 2 });
  assert(result.status === "preview-only" && result.assignments.length === 2, "후보 순서를 고정해 가능한 운영시간 조합을 놓치면 안 된다");
  assert(result.assignments.map((assignment) => `${assignment.placeId}@${assignment.startTime}`).join(",") === "morning@09:00,afternoon@12:00", "오전 장소 뒤에 오후 장소를 배치해야 한다");
  assert(result.certificate.durationPackingExact, "상태 한도 안에서 후보 순서와 bin을 모두 확인한 증거가 필요하다");
});

scenario("참여자 만족도는 배치 불가능한 개인 최선이 아니라 실행 가능한 일정 범위로 정규화한다", () => {
  const signal = (
    userId: string,
    preferenceStrength: 1 | 2 | 3 | 4 | 5 | null,
  ): SharedDuriPreferenceEvidence["candidateSignals"][number]["signals"][number] => ({
    userId,
    mustVisit: null,
    avoid: null,
    preferenceStrength,
    version: 1,
    updatedAt: null,
  });
  const sharedPreferenceEvidence = sharedPreferences(["u1"], [
    { placeId: "top", signals: [signal("u1", 5)] },
    { placeId: "mid", signals: [signal("u1", 3)] },
    { placeId: "low", signals: [signal("u1", 1)] },
  ]);
  const result = planPreferenceAutoFill(input({
    placesById: { top: place("top"), mid: place("mid"), low: place("low") },
    candidates: [candidate("top"), candidate("mid"), candidate("low")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
    placeConstraintEvidence: [{
      placeId: "top",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      operatingHoursText: "18:00~22:00",
    }],
  }), { dailyStartTime: "09:00", dailyEndTime: "12:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(result.status === "preview-only" && result.assignments[0]?.placeId === "mid", "주간에 실행 가능한 개인 최선 후보를 선택해야 한다");
  assert(result.certificate.selectionExact
    && result.certificate.fairnessNormalizationBasis === "feasible-schedule-exact",
  "작은 문제의 일정 가능 집합과 만족도 범위를 모두 증명해야 한다");
  assert(result.certificate.normalizedSatisfactionByMember.u1 === 1
    && result.certificate.minimumNormalizedSatisfaction === 1
    && result.certificate.fairness?.maximumRegret === 0,
  "배치 불가능한 야간 top 후보 때문에 실제 최선안 만족도를 50%로 낮추면 안 된다");
});

scenario("실행 불가능한 개인 ideal이 인원 조율 장소 선택을 뒤집지 않는다", () => {
  const signal = (
    userId: string,
    preferenceStrength: 1 | 2 | 3 | 4 | 5 | null,
  ): SharedDuriPreferenceEvidence["candidateSignals"][number]["signals"][number] => ({
    userId,
    mustVisit: null,
    avoid: null,
    preferenceStrength,
    version: 1,
    updatedAt: null,
  });
  const strengths = [
    [5, null],
    [null, 1],
    [1, 4],
    [2, 5],
    [3, 3],
    [4, 2],
  ] as const;
  const candidateIds = strengths.map((_, index) => `c${index}`);
  const sharedPreferenceEvidence = sharedPreferences(["u1", "u2"], strengths.map(([u1, u2], index) => ({
    placeId: `c${index}`,
    signals: [signal("u1", u1), signal("u2", u2)],
  })));
  const result = planPreferenceAutoFill(input({
    trip: room(["u1", "u2"]),
    members: [user("u1"), user("u2")],
    placesById: Object.fromEntries(candidateIds.map((id) => [id, place(id)])),
    candidates: candidateIds.map((id) => candidate(id)),
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
    placeConstraintEvidence: [{
      placeId: "c0",
      provider: "tour-api",
      fetchedAt: "2026-08-26T00:00:00.000Z",
      operatingHoursText: "18:00~22:00",
    }],
  }), { dailyStartTime: "09:00", dailyEndTime: "12:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(result.status === "preview-only" && result.assignments[0]?.placeId === "c3", "실행 가능한 개인별 범위에서 max-min과 Nash를 계산해야 한다");
  assert(result.certificate.fairnessNormalizationBasis === "feasible-schedule-exact"
    && result.certificate.normalizedSatisfactionByMember.u1 === 0.5
    && result.certificate.normalizedSatisfactionByMember.u2 === 1
    && result.certificate.minimumNormalizedSatisfaction === 0.5,
  "실행 가능한 c1~c5의 개인별 최저·최고 범위를 certificate에 보존해야 한다");
  assert(result.certificate.fairness?.maximumRegret === 0.5
    && result.certificate.fairness.meanRegret === 0.25,
  "조율안의 최대·평균 후회값도 같은 실행 가능 범위로 계산해야 한다");
});

scenario("서로 다른 DAY의 극단 시각을 모든 날짜의 공통 극단값으로 퍼뜨리지 않는다", () => {
  const defaults = derivePreferenceAutoFillDefaults(input({
    trip: room(["u1"], { endDate: "2026-09-02" }),
    placesById: { early: place("early"), late: place("late"), a: place("a") },
    itinerary: [
      item("early-item", "early", "2026-09-01", "06:00", 60),
      item("late-item", "late", "2026-09-02", "22:00", 60),
    ],
  }));
  assert(defaults.dailyStartTime === "10:00" && defaults.dailyEndTime === "20:00", "날짜별 robust 중앙값과 편집 템플릿의 합집합만 써야 한다");
});

scenario("저녁 예약 하나만 있는 부분 일정도 나머지 낮 시간을 자동으로 채운다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { reservation: place("reservation"), a: place("a"), b: place("b") },
    candidates: [candidate("a"), candidate("b")],
    itinerary: [{ ...item("reservation-item", "reservation", "2026-09-01", "18:00", 60), itemType: "reservation" }],
  }), {});
  assert(result.status === "preview-only" && result.assignments.length >= 1, "예약의 한 시간만 하루 활동 창으로 오인해 초안을 막으면 안 된다");
  assert(result.assignments.every((assignment) => assignment.startTime < "18:00"), "기존 저녁 예약은 움직이지 않고 낮 시간에 채워야 한다");
});

scenario("시각 없는 확정 사실은 연결 장소만 보존하고 하루 전체를 막지 않는다", () => {
  const result = planPreferenceAutoFill(input({
    confirmedScheduleConstraints: [confirmed({ id: "date-only", startTime: undefined, endTime: undefined })],
  }), request);
  assert(result.status === "preview-only" && result.assignments.length === 1, "date-only 사실을 all-day blocker로 오인하면 안 된다");
  assert(result.limitations.some((limitation) => limitation.includes("시각 구간이 완전하지 않은")), "불완전 확정 사실을 사용자에게 알려야 한다");
});

scenario("중복 공유 후보 행의 must/avoid 충돌도 한 후보로 합쳐 보류한다", () => {
  const sharedPreferenceEvidence = sharedPreferences(["u1", "u2"], [
    { placeId: "a", signals: [{ userId: "u1", mustVisit: true, avoid: null, preferenceStrength: 5, version: 3, updatedAt: null }] },
    { placeId: "a", signals: [{ userId: "u2", mustVisit: null, avoid: true, preferenceStrength: 1, version: 3, updatedAt: null }] },
  ]);
  const result = planPreferenceAutoFill(input({
    trip: room(["u1", "u2"]),
    members: [user("u1"), user("u2")],
    placesById: { a: place("a"), b: place("b") },
    candidates: [candidate("a"), candidate("b")],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "preview-only" && result.assignments[0]?.placeId === "b", "중복 placeId 행 사이 충돌을 놓치면 안 된다");
});

scenario("여행방을 떠난 사용자의 오래된 제외 의견은 현재 must와 충돌하지 않는다", () => {
  const sharedPreferenceEvidence = sharedPreferences(["u1"], [{
    placeId: "a",
    signals: [
      { userId: "u1", mustVisit: true, avoid: null, preferenceStrength: 5, version: 2, updatedAt: null },
      { userId: "departed", mustVisit: null, avoid: true, preferenceStrength: 1, version: 2, updatedAt: null },
    ],
  }]);
  const result = planPreferenceAutoFill(input({
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "preview-only" && result.assignments[0]?.placeId === "a", "현재 구성원이 아닌 오래된 signal로 필수 후보를 보류하면 안 된다");
  assert(result.certificate.mandatorySharedPlaceIds.includes("a"), "현재 구성원의 must는 그대로 보존해야 한다");
});

scenario("후보가 128곳을 넘어도 필수·분류 다양성을 보존해 결정적으로 축소한다", () => {
  const ids = Array.from({ length: 140 }, (_, index) => `p-${index.toString().padStart(3, "0")}`);
  const placesById = Object.fromEntries(ids.map((id, index) => [id, place(id, `분류-${index % 9}`)]));
  const result = planPreferenceAutoFill(input({
    placesById,
    candidates: ids.map((id) => candidate(id, [])),
    preferenceResults: {},
  }), { dailyStartTime: "09:00", dailyEndTime: "18:00", proposedVisitDurationMinutes: 60, maxNewItems: 3 });
  assert(result.status === "preview-only" && result.assignments.length === 3, "큰 후보 보드 전체를 중단하면 안 된다");
  assert(result.certificate.candidatePrefilter?.originalEligibleCount === 140
    && result.certificate.candidatePrefilter.consideredCount === 128
    && result.certificate.candidatePrefilter.omittedCount === 12,
  "결정적 사전 축소 범위를 certificate에 남겨야 한다");
});

scenario("실제 경로 관측이 있으면 전환 여유를 편집 placeholder보다 늘린다", () => {
  const result = planPreferenceAutoFill(input({
    trip: room(["u1"], { transport: "car" }),
    placesById: { a: place("a"), b: place("b") },
    candidates: [candidate("a"), candidate("b")],
    routeLegEstimates: [{
      fromItemId: "observed-a",
      toItemId: "observed-b",
      date: "2026-09-01",
      departureTime: "10:00",
      mode: "car",
      durationSeconds: 45 * 60,
      distanceMeters: 20_000,
      provider: "kakao-mobility",
      timingBasis: "current-traffic",
      fetchedAt: "2026-08-26T00:00:00.000Z",
    }],
  }), { dailyStartTime: "09:00", dailyEndTime: "12:00", proposedVisitDurationMinutes: 60, maxNewItems: 2 });
  assert(result.status === "preview-only" && result.assignments.map((assignment) => assignment.startTime).join(",") === "09:00,10:45", "조회된 경로시간 중앙값을 전환 여유로 써야 한다");
  assert(result.certificate.transitionBuffer.minutes === 45 && result.certificate.transitionBuffer.basis === "observed-route-duration", "전환시간 provenance를 남겨야 한다");
});

scenario("새 장소와 앞뒤 고정 일정 사이에도 전환 여유를 확보한다", () => {
  const result = planPreferenceAutoFill(input({
    placesById: { previous: place("previous"), next: place("next"), candidate: place("candidate") },
    candidates: [candidate("candidate")],
    itinerary: [
      item("previous-item", "previous", "2026-09-01", "09:00", 60),
      item("next-item", "next", "2026-09-01", "12:00", 60),
    ],
  }), { dailyStartTime: "09:00", dailyEndTime: "13:00", proposedVisitDurationMinutes: 60, maxNewItems: 1 });
  assert(result.status === "preview-only" && result.assignments[0]?.startTime === "10:15", "앞 일정 직후 0분 간격으로 새 장소를 시작하면 안 된다");
  const assignment = result.assignments[0];
  const endMinute = Number(assignment.startTime.slice(0, 2)) * 60
    + Number(assignment.startTime.slice(3))
    + assignment.durationMinutes;
  assert(endMinute <= 11 * 60 + 45, "다음 고정 일정 전에도 최소 15분 전환 여유가 필요하다");
});

scenario("중복 후보를 한 번만 배치하고 입력 순서와 무관하게 결정적이다", () => {
  const candidates = [candidate("a", ["u1"]), candidate("a", ["u1"]), candidate("b", ["u1"]), candidate("c", ["u1"])];
  const placesById = { a: place("a"), b: place("b"), c: place("c") };
  const forward = planPreferenceAutoFill(input({ candidates, placesById }), { ...request, maxNewItems: 2 });
  const reverse = planPreferenceAutoFill(input({ candidates: [...candidates].reverse(), placesById }), { ...request, maxNewItems: 2 });
  assert(forward.status === "preview-only" && reverse.status === "preview-only", "결정적 초안을 만들어야 한다");
  assert(new Set(forward.assignments.map((assignment) => assignment.placeId)).size === forward.assignments.length, "같은 장소를 두 번 배치하면 안 된다");
  assert(JSON.stringify(forward.assignments.map((assignment) => assignment.placeId)) === JSON.stringify(reverse.assignments.map((assignment) => assignment.placeId)), "후보 배열 순서가 결과를 바꾸면 안 된다");
});

scenario("초안 envelope는 적용 불가지만 동일 validation으로 미리보기 가능하다", () => {
  const source = input();
  const plan = planPreferenceAutoFill(source, request);
  assert(plan.status === "preview-only", "초안이 필요하다");
  const session = createDuriAnalysisSession(source, "2026-08-23T00:00:00.000Z");
  const envelope = buildPreferenceAutoFillSuggestionEnvelope(session, plan, "2026-08-23T00:00:01.000Z");
  assert(envelope && !envelope.suggestion.canApply && !plan.certificate.localApplyEligible, "local/mock도 자동 적용 가능으로 표시하면 안 된다");
  const context = { tripId: source.trip.id, tripDates: getTripDates(source.trip.startDate, source.trip.endDate), placesById: source.placesById, candidates: source.candidates };
  const applied = applySuggestionChanges(source.itinerary, envelope.suggestion, context);
  assert(!applied.success && applied.status === "not-applicable", "실제 apply는 차단되어야 한다");
  const previewed = previewSuggestion(source.itinerary, envelope.suggestion, context);
  assert(previewed.success && previewed.previewItinerary.length === plan.assignments.length, "검토용 diff 미리보기는 가능해야 한다");
});

scenario("2DAY 128후보×64명×64선택은 제한 탐색 budget 안에서 종료한다", () => {
  const memberIds = Array.from({ length: 64 }, (_, index) => `u-${index.toString().padStart(2, "0")}`);
  const candidates = Array.from({ length: 128 }, (_, index) => candidate(`p-${index.toString().padStart(3, "0")}`, [memberIds[index % memberIds.length]]));
  const placesById = Object.fromEntries(candidates.map((entry) => [entry.placeId, place(entry.placeId)]));
  const startedAt = Date.now();
  const result = planPreferenceAutoFill(input({
    trip: room(memberIds, { endDate: "2026-09-02" }),
    members: memberIds.map(user),
    candidates,
    placesById,
    preferenceResults: {},
  }), {
    dailyStartTime: "00:00",
    dailyEndTime: "24:00",
    proposedVisitDurationMinutes: 15,
    maxNewItems: 64,
  });
  const elapsedMs = Date.now() - startedAt;
  assert(result.status === "preview-only" && result.assignments.length === 64, "상한 입력도 안전한 정수 효용으로 반환해야 한다");
  assert(!result.certificate.selectionExact && result.certificate.evaluatedBundleCount <= 80_000, "명시한 탐색 budget을 넘으면 안 된다");
  assert(result.certificate.fairnessNormalizationBasis === "relaxed-candidate-bound"
    && result.certificate.minimumNormalizedSatisfaction === undefined
    && Object.keys(result.certificate.normalizedSatisfactionByMember).length === 0,
  "실행 가능한 개인 ideal을 증명하지 못한 큰 문제의 탐색 점수를 만족도 퍼센트로 노출하면 안 된다");
  assert(elapsedMs < 15_000, `동기 기기 탐색이 과도하게 길다: ${elapsedMs}ms`);
  console.log(`PERF 2DAY 128x64x64 ${elapsedMs}ms / ${result.certificate.evaluatedBundleCount} evaluations`);
});

scenario("좌표 완비 128후보×64명×64선택도 거리 행렬 캐시로 제한 시간 안에 끝난다", () => {
  const memberIds = Array.from({ length: 64 }, (_, index) => `geo-u-${index.toString().padStart(2, "0")}`);
  const candidates = Array.from({ length: 128 }, (_, index) => candidate(`geo-p-${index.toString().padStart(3, "0")}`, [memberIds[index % memberIds.length]]));
  const placesById = Object.fromEntries(candidates.map((entry, index) => [entry.placeId, {
    ...place(entry.placeId, "명소", [], 12),
    latitude: 35 + Math.floor(index / 16) * 0.001,
    longitude: 129 + (index % 16) * 0.001,
  }]));
  const startedAt = Date.now();
  const result = planPreferenceAutoFill(input({
    trip: room(memberIds, { endDate: "2026-09-02" }),
    members: memberIds.map(user),
    candidates,
    placesById,
    preferenceResults: {},
  }), {
    dailyStartTime: "00:00",
    dailyEndTime: "24:00",
    proposedVisitDurationMinutes: 15,
    maxNewItems: 64,
  });
  const elapsedMs = Date.now() - startedAt;
  assert(result.status === "preview-only" && result.assignments.length === 64, "좌표 후보도 동일한 일정 수를 반환해야 한다");
  assert(elapsedMs < 6_000, `좌표 거리 비교가 JS 스레드를 과도하게 점유한다: ${elapsedMs}ms`);
  console.log(`PERF geo-128x64x64 ${elapsedMs}ms / ${result.certificate.evaluatedBundleCount} evaluations`);
});

scenario("편향된 duration 128후보도 물리적 count 상한으로 빠르게 줄인다", () => {
  const ids = Array.from({ length: 128 }, (_, index) => `skew-${index.toString().padStart(3, "0")}`);
  const startedAt = Date.now();
  const result = planPreferenceAutoFill(input({
    placesById: Object.fromEntries(ids.map((id) => [id, place(id)])),
    candidates: ids.map((id) => candidate(id, [])),
    preferenceResults: {},
    placeConstraintEvidence: ids.map((id, index) => ({
      placeId: id,
      provider: "tour-api" as const,
      fetchedAt: "2026-08-26T00:00:00.000Z",
      recommendedDurationText: index === 0 ? "15분" : "10시간",
    })),
  }), {
    dailyStartTime: "08:00",
    dailyEndTime: "20:00",
    maxNewItems: 64,
  });
  const elapsedMs = Date.now() - startedAt;
  assert(result.status === "preview-only" && result.assignments.length === 2, "15분 1곳과 10시간 1곳보다 큰 count를 탐색하면 안 된다");
  assert(elapsedMs < 2_000, `편향 duration count 탐색이 과도하게 길다: ${elapsedMs}ms`);
  console.log(`PERF skew-duration-128 ${elapsedMs}ms / ${result.certificate.evaluatedBundleCount} evaluations`);
});

async function runAsyncScenarios() {
  await asyncScenario("응답하지 않는 일정 공급자도 제한시간 뒤 생성 UI를 해제한다", async () => {
    const startedAt = Date.now();
    let caught: unknown;
    try {
      await requestPreferenceAutoFillWithDeadline(
        () => new Promise<string>(() => undefined),
        { timeoutMs: 20 },
      );
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof PreferenceAutoFillRequestTimeoutError, "무응답 공급자는 명시적 timeout으로 끝나야 한다");
    assert(Date.now() - startedAt < 1_000, "무응답 공급자가 생성 UI를 계속 붙잡으면 안 된다");
  });

  await asyncScenario("화면 요청이 취소되면 하위 네트워크 요청도 함께 중단한다", async () => {
    const parent = new AbortController();
    let childAborted = false;
    const pending = requestPreferenceAutoFillWithDeadline(
      (signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          childAborted = true;
          reject(new Error("child aborted"));
        }, { once: true });
      }),
      { timeoutMs: 1_000, signal: parent.signal },
    );
    await Promise.resolve();
    parent.abort();
    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof PreferenceAutoFillRequestAbortedError, "상위 취소를 명시적으로 전달해야 한다");
    assert(childAborted, "하위 fetch에 전달한 AbortSignal도 취소되어야 한다");
  });
}

runAsyncScenarios()
  .then(() => console.log(`Preference auto-fill verification passed: ${scenarioCount} scenarios.`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
