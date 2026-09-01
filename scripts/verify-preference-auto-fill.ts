import type { ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../src/domain";
import type { ConfirmedScheduleConstraint, DuriAnalysisInput, SharedDuriPreferenceEvidence } from "../src/duri/duri-analysis";
import { applySuggestionChanges, previewSuggestion } from "../src/duri/duri-suggestions";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import {
  buildPreferenceAutoFillSuggestionEnvelope,
  derivePreferenceAutoFillDefaults,
  planPreferenceAutoFill,
} from "../src/features/duri/logic/preferenceAutoFill";
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

scenario("관측값이 없으면 임의 시작·종료·체류시간을 만들지 않는다", () => {
  const defaults = derivePreferenceAutoFillDefaults(input({ preferenceResults: { u1: preference("u1", { detailed: false }) } }));
  assert(defaults.dailyStartTime === undefined && defaults.dailyEndTime === undefined, "legacy 응답에 시간창 기본값을 만들면 안 된다");
  assert(defaults.proposedVisitDurationMinutes === undefined && defaults.maxNewItems === undefined, "임의 체류시간/개수를 만들면 안 된다");
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
  assert(defaults.dailyStartTime === undefined && defaults.proposedVisitDurationMinutes === undefined, "손상/미래 관측값을 받아들이면 안 된다");
});

scenario("문서 또는 기기 계획 사실을 읽지 못하면 false-safe 초안을 만들지 않는다", () => {
  assert(planPreferenceAutoFill(input({ documentCollectionStatus: "unavailable" }), request).status === "insufficient-data", "문서 unavailable gate가 필요하다");
  assert(planPreferenceAutoFill(input({ localPlanningFactsStatus: "unavailable" }), request).status === "insufficient-data", "local facts unavailable gate가 필요하다");
});

scenario("API 공유 성향이 stale/unavailable이면 숨은 must/avoid가 없다고 추정하지 않는다", () => {
  assert(planPreferenceAutoFill(input({ sharedPreferenceEvidenceStatus: "unavailable" }), request).status === "insufficient-data", "공유 성향 unavailable gate");
  assert(planPreferenceAutoFill(input({ sharedPreferenceEvidenceStatus: "stale" }), request).status === "insufficient-data", "공유 성향 stale gate");
});

scenario("같은 후보의 mustVisit/avoid 충돌은 평균으로 상쇄하지 않고 생성을 막는다", () => {
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
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), request);
  assert(result.status === "insufficient-data" && result.message.includes("반드시 방문과 제외"), "충돌 fail-closed");
});

scenario("API stress 기본방은 7개 부분 일정에서 Hard 충돌 없이 미배치 후보 preview를 만든다", () => {
  const memberIds = ["owner", "local", "active", "comfort", "budget"];
  const placesById = {
    gamcheon: place("gamcheon", "명소", ["문화", "사진"], 12),
    jagalchi: place("jagalchi", "시장", ["시장", "식사"], 38),
    gukje: place("gukje", "시장", ["시장", "쇼핑"], 38),
    haedong: place("haedong", "명소", ["문화", "바다"], 12),
    xsky: place("xsky", "명소", ["전망대", "입장권"], 12),
    haeundae: place("haeundae", "명소", ["바다", "휴식"], 12),
    gwangalli: place("gwangalli", "명소", ["바다", "야경"], 12),
    taejongdae: place("taejongdae", "명소", ["자연", "산책"], 12),
    huinnyeoul: place("huinnyeoul", "명소", ["문화", "카페"], 12),
  };
  const sharedPreferenceEvidence = sharedPreferences(memberIds, [
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
      item("fixture-haedong", "haedong", "2026-09-26", "09:00", 135),
      item("fixture-xsky", "xsky", "2026-09-26", "12:15", 120),
      item("fixture-haeundae", "haeundae", "2026-09-26", "14:30", 90),
      item("fixture-gwangalli", "gwangalli", "2026-09-26", "17:00", 135),
      item("fixture-taejongdae", "taejongdae", "2026-09-27", "09:30", 135),
    ],
    sourceFactsVersion: 4,
    sharedPreferenceEvidenceStatus: "loaded",
    sharedPreferenceEvidence,
  }), {
    dailyStartTime: "09:00",
    dailyEndTime: "20:00",
    maxNewItems: 2,
  });
  assert(result.status === "preview-only" && result.assignments.length > 0, "부분 일정에서 실제 preview가 생성되어야 한다");
  assert(result.assignments.some((assignment) => assignment.placeId === "gukje"), "미배치 must 후보 국제시장을 포함해야 한다");
  assert(result.assignments.every((assignment) => assignment.placeId !== "huinnyeoul"), "avoid가 있는 흰여울 후보는 제외해야 한다");
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
  assert(result.status === "no-candidates", "neutral 50은 positive evidence가 아니다");
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
    && evidence.officialFloorExceededReferenceRange
    && evidence.preOfficialDurationMinutes === 45
    && evidence.preOfficialUpperMinutes === 45
    && evidence.officialMinimumMinutes === 80
    && evidence.supportingItemIds.join(",") === "observed-item",
  "경험적 provenance를 보존하면서 공식 하한과 불일치하는 가짜 유한 상한을 만들지 않아야 한다");
});

scenario("체류시간과 장소 수의 관측 근거가 없으면 magic number로 과밀 일정을 만들지 않는다", () => {
  const noDuration = planPreferenceAutoFill(input(), {
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    maxNewItems: 1,
  });
  assert(noDuration.status === "insufficient-data" && noDuration.message.includes("체류시간"), "체류시간 근거가 없으면 abstain해야 한다");
  const noCount = planPreferenceAutoFill(input(), {
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    proposedVisitDurationMinutes: 60,
  });
  assert(noCount.status === "invalid-request" && noCount.message.includes("장소 수"), "일정량 근거 없이 최대 64곳을 채우면 안 된다");
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
    dailyEndTime: "12:00",
    maxNewItems: 4,
  });
  assert(result.status === "preview-only" && result.assignments.length === 4, "90분·75분 gap에 60·45·30·30분을 모두 넣어야 한다");
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

scenario("128후보×64명×64선택은 제한 탐색 budget 안에서 종료한다", () => {
  const memberIds = Array.from({ length: 64 }, (_, index) => `u-${index.toString().padStart(2, "0")}`);
  const candidates = Array.from({ length: 128 }, (_, index) => candidate(`p-${index.toString().padStart(3, "0")}`, [memberIds[index % memberIds.length]]));
  const placesById = Object.fromEntries(candidates.map((entry) => [entry.placeId, place(entry.placeId)]));
  const startedAt = Date.now();
  const result = planPreferenceAutoFill(input({
    trip: room(memberIds),
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
  assert(elapsedMs < 15_000, `동기 기기 탐색이 과도하게 길다: ${elapsedMs}ms`);
  console.log(`PERF 128x64x64 ${elapsedMs}ms / ${result.certificate.evaluatedBundleCount} evaluations`);
});

console.log(`Preference auto-fill verification passed: ${scenarioCount} scenarios.`);
