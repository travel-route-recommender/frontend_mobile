import type { TripRoom, User, UserPreferenceResult } from "../src/domain";
import { calculatePersonalPreferenceResult } from "../src/duri/preferences";
import {
  deriveGroupPlanningProfile,
  calculateFairPreferenceCompromise,
  calculateExactIndividualIdealUtilityPoints,
  deriveConsensusRanking,
  deriveKemenyConsensus,
  deriveMobilityConsensus,
  diagnoseGroupPreferences,
  diagnosePreferenceDimension,
  normalizedKendallDistance,
  normalizePreferenceResult,
  optimizeGroupItinerary,
  routeEdgeKey,
  solveFairGroupDecision,
  solveRobustFairGroupDecision,
  solveIntervalPreferenceConsensus,
  summarizeGroupPreferredTags,
} from "../src/duri/group-preferences";
import { getRoomPreferenceResponseSummary } from "../src/features/trips/selectors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, message: string) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const users: Record<string, User> = Object.fromEntries(["a", "b", "c"].map((id) => [id, { id, name: id.toUpperCase(), initial: id.toUpperCase() }]));
const answers = { pace: 0, budget: 1, mobility: 0, activity: 0, mealStyle: 1, planningStyle: 1 } as const;
const result = (userId: string, overrides: Partial<UserPreferenceResult> = {}) => ({
  ...calculatePersonalPreferenceResult(userId, answers, "2026-07-01T00:00:00.000Z"),
  ...overrides,
});
const trip = (memberIds: string[]): TripRoom => ({
  id: "fixture-room",
  title: "fixture",
  regionId: "busan",
  startDate: "2026-07-18",
  endDate: "2026-07-19",
  status: "planning",
  transport: "public",
  budgetLevel: "standard",
  intensity: "balanced",
  members: memberIds.map((userId, index) => ({ userId, role: index === 0 ? "owner" : "member" })),
});
const summary = (room: TripRoom, results: Record<string, unknown>, availableUsers = users) => getRoomPreferenceResponseSummary({ tripsById: { [room.id]: room }, usersById: availableUsers, preferenceResultsByUserId: results, currentUserId: "a" }, room.id);

const noMembers = summary(trip([]), {});
assert(noMembers.totalCount === 0 && noMembers.completionRate === 0, "1. 멤버 0명은 0/0이어야 한다");

const onePending = summary(trip(["a"]), {});
assert(onePending.pendingCount === 1 && onePending.coverage === "insufficient", "2. 1명 무응답은 insufficient여야 한다");

const oneCompleteRoom = trip(["a"]);
const oneComplete = summary(oneCompleteRoom, { a: result("a") });
const oneDiagnosis = diagnoseGroupPreferences(oneCompleteRoom, { a: result("a") });
assert(oneComplete.completedCount === 1 && oneDiagnosis.matchRate === undefined, "3. 1명 응답에는 match rate가 없어야 한다");

const threeMemberRoom = trip(["a", "b", "c"]);
assert(summary(threeMemberRoom, {}).completedCount === 0, "4. 3명 무응답은 0/3이어야 한다");
assert(summary(threeMemberRoom, { a: result("a") }).coverage === "insufficient", "5. 3명 중 1명 응답은 insufficient여야 한다");

const partialResults = { a: result("a"), b: result("b", { preferredTags: ["카페", "산책"] }) };
const partial = summary(threeMemberRoom, partialResults);
const partialDiagnosis = diagnoseGroupPreferences(threeMemberRoom, partialResults);
assert(partial.completedCount === 2 && partial.coverage === "partial" && partial.completionRate === 2 / 3, "6. 3명 중 2명 응답은 partial 2/3이어야 한다");

const completeResults = { ...partialResults, c: result("c", { preferredTags: ["카페", "바다"] }) };
const complete = summary(threeMemberRoom, completeResults);
const completeDiagnosis = diagnoseGroupPreferences(threeMemberRoom, completeResults);
assert(complete.isComplete && complete.coverage === "complete" && completeDiagnosis.coverage === "complete", "7. 3명 응답은 complete여야 한다");

assert(completeDiagnosis.commonPreferences.length === 6 && completeDiagnosis.commonPreferences.includes("예산") && completeDiagnosis.matchRate === 100, "8. 예산을 포함한 모든 계획 차원이 같으면 common, 100이어야 한다");

const compatible = diagnosePreferenceDimension("pace", [{ userId: "a", score: 0 }, { userId: "b", score: 1 }]);
assert(compatible.spread === 1 && compatible.status === "compatible", "9. spread 1은 compatible이어야 한다");

const tuning = diagnosePreferenceDimension("pace", [{ userId: "a", score: 0 }, { userId: "b", score: 2 }]);
assert(tuning.spread === 2 && tuning.status === "needs-tuning", "10. spread 2는 needs-tuning이어야 한다");

const corrupt = { ...result("b"), answers: { ...answers, pace: 9 } };
const corruptSummary = summary(threeMemberRoom, { a: result("a"), b: corrupt });
assert(corruptSummary.invalidMemberIds.includes("b") && corruptSummary.completedCount === 1, "11. 손상 결과는 invalid여야 한다");

const missingUserSummary = summary(trip(["a", "missing"]), { a: result("a") }, { a: users.a });
assert(missingUserSummary.invalidMemberIds.includes("missing"), "12. 없는 userId는 invalid여야 한다");
const missingUserIdSummary = summary(trip(["a", ""]), { a: result("a") }, { a: users.a });
assert(missingUserIdSummary.invalidMemberIds.includes(""), "12. userId가 비어 있는 member도 crash 없이 invalid여야 한다");

const duplicateSummary = summary(trip(["a", "a", "b"]), { a: result("a"), b: result("b") });
assert(duplicateSummary.totalCount === 2 && duplicateSummary.completedCount === 2, "13. 중복 member는 한 번만 세어야 한다");

const emptyTags = summarizeGroupPreferredTags({ a: [], b: [] });
assert(emptyTags.length === 0, "14. preferredTags가 없으면 빈 집계여야 한다");

const incompatibleVersion = result("a", { version: 99 });
const versionSummary = summary(trip(["a"]), { a: incompatibleVersion });
assert(versionSummary.invalidMemberIds.includes("a") && normalizePreferenceResult(incompatibleVersion, "a") === null, "15. config version 불일치는 invalid여야 한다");

assert(partialDiagnosis.sharedPreferredTags.includes("카페"), "태그는 완료 응답자 기준으로 집계해야 한다");
const profile = deriveGroupPlanningProfile(partialDiagnosis);
assert(profile.dataStatus === "partial" && profile.pace.spread === 0 && profile.sharedPreferredTags.includes("카페"), "GroupPlanningProfile은 partial 차원과 태그를 파생해야 한다");

const fairCompromise = calculateFairPreferenceCompromise([
  { userId: "a", score: 0 },
  { userId: "b", score: 0 },
  { userId: "c", score: 2 },
]);
assert(fairCompromise.recommendedScore === 1 && fairCompromise.maximumRegret === 0.5, "16. 다수 평균보다 최대 후회를 먼저 줄여 소수의 극단 선호를 보호한다");
const minimaxTie = calculateFairPreferenceCompromise([
  { userId: "a", score: 0 },
  { userId: "b", score: 1 },
  { userId: "c", score: 1 },
]);
assert(minimaxTie.recommendedScore === 1 && minimaxTie.equallyFairScores.join(",") === "1", "16a. 같은 최저 만족도에서는 Nash 후생이 더 큰 대안을 고른다");
assert(minimaxTie.exact && minimaxTie.paretoEfficient && minimaxTie.minimumSatisfaction === 0.5, "16b. 절충 결과는 정확성·Pareto 효율·최저 만족도를 함께 증명한다");
const mobilityConsensus = deriveMobilityConsensus([
  { userId: "a", modes: ["bus", "walk"] },
  { userId: "b", modes: ["subway", "walk"] },
  { userId: "c", modes: ["taxi"] },
]);
assert(mobilityConsensus.commonModes.length === 0 && mobilityConsensus.mostSupportedModes[0] === "walk", "17. 교집합이 없으면 최다 지지 이동수단을 조율 대안으로 계산한다");
assert(normalizedKendallDistance(["food", "stay", "activity"], ["activity", "stay", "food"]) === 1, "18. 완전 역순 예산 선호는 Kendall 거리 1이다");
const consensusRanking = deriveConsensusRanking([
  { userId: "a", ranking: ["food", "stay", "activity"] },
  { userId: "b", ranking: ["stay", "food", "activity"] },
]);
assert(consensusRanking[0].item === "food" && consensusRanking[1].item === "stay", "19. Kemeny 합의 순위는 동률도 결정적으로 정렬한다");
const tiedKemeny = deriveKemenyConsensus([
  { userId: "a", ranking: ["food", "stay"] },
  { userId: "b", ranking: ["stay", "food"] },
]);
assert(tiedKemeny.equallyOptimalRankings.length === 2 && tiedKemeny.allOptimalRankingsEnumerated, "19a. exact Kemeny가 여러 공동 최적 순위를 유일한 합의로 숨기지 않는다");

const kemeny = deriveKemenyConsensus([
  { userId: "a", ranking: ["food", "stay", "activity"] },
  { userId: "b", ranking: ["food", "stay", "activity"] },
  { userId: "c", ranking: ["activity", "stay", "food"] },
]);
assert(kemeny.exact && kemeny.ranking.join(",") === "food,stay,activity" && kemeny.totalPairwiseDisagreement === 3, "20. 3개 항목 Kemeny 중앙 순위를 완전탐색으로 정확히 계산한다");

const fairDecision = solveFairGroupDecision(["a", "b"], [
  { id: "majority-only", utilitiesByMember: { a: 1, b: 0 } },
  { id: "balanced", utilitiesByMember: { a: 0.7, b: 0.7 } },
  { id: "dominated", utilitiesByMember: { a: 0.6, b: 0.6 } },
]);
assert(fairDecision.selectedAlternativeId === "balanced" && !fairDecision.paretoFrontierAlternativeIds.includes("dominated"), "21. Pareto 지배 대안을 제거하고 max-min·Nash 공동안을 정확히 선택한다");
const reversedFairDecision = solveFairGroupDecision(["b", "a"], [
  { id: "dominated", utilitiesByMember: { a: 0.6, b: 0.6 } },
  { id: "balanced", utilitiesByMember: { a: 0.7, b: 0.7 } },
  { id: "majority-only", utilitiesByMember: { a: 1, b: 0 } },
]);
assert(reversedFairDecision.selectedAlternativeId === fairDecision.selectedAlternativeId, "22. 참여자와 대안 입력 순서를 바꿔도 공정 결정은 동일하다");
const nearUtilityDecision = solveFairGroupDecision(["a", "b"], [
  { id: "a-worse", utilitiesByMember: { a: 0.5, b: 0.5 } },
  { id: "z-better", utilitiesByMember: { a: 0.5000000000005, b: 0.5000000000005 } },
]);
const reversedNearUtilityDecision = solveFairGroupDecision(["b", "a"], [
  { id: "z-better", utilitiesByMember: { a: 0.5000000000005, b: 0.5000000000005 } },
  { id: "a-worse", utilitiesByMember: { a: 0.5, b: 0.5 } },
]);
assert(nearUtilityDecision.selectedAlternativeId === "z-better"
  && nearUtilityDecision.paretoFrontierAlternativeIds.join(",") === "z-better"
  && nearUtilityDecision.numericTolerance === 0
  && reversedNearUtilityDecision.selectedAlternativeId === "z-better",
"22aa. 고정 epsilon으로 근접한 개선을 동률 처리하지 않고 입력 순열과 무관하게 정확 비교한다");
const nearNashDecision = solveFairGroupDecision(["a", "b"], [
  { id: "a-lower-product", utilitiesByMember: { a: 0.8000000000004, b: 0.5 } },
  { id: "z-higher-product", utilitiesByMember: { a: 0.5, b: 0.8000000000005 } },
]);
assert(nearNashDecision.selectedAlternativeId === "z-higher-product",
"22ab. 최저 효용이 같은 근접 Nash 곱도 부동소수 epsilon이나 대안 ID가 아니라 유리수 교차곱으로 비교한다");
const robustDecision = solveRobustFairGroupDecision(["a", "b"], [
  {
    id: "high-average-wide-risk",
    utilityIntervalsByMember: {
      a: { lower: 0.1, nominal: 0.9, upper: 1 },
      b: { lower: 0.1, nominal: 0.9, upper: 1 },
    },
  },
  {
    id: "balanced-observed",
    utilityIntervalsByMember: {
      a: { lower: 0.65, nominal: 0.7, upper: 0.75 },
      b: { lower: 0.65, nominal: 0.7, upper: 0.75 },
    },
  },
]);
assert(robustDecision.selectedAlternativeId === "balanced-observed"
  && robustDecision.exact
  && robustDecision.lowerBoundParetoFrontierAlternativeIds.join(",") === "balanced-observed",
"22aba. 분포를 꾸미지 않고 관측 구간의 최악 효용으로 불확실한 고평균안을 거부한다");
const regretBreaksRobustTie = solveRobustFairGroupDecision(["a", "b"], [
  {
    id: "large-regret",
    utilityIntervalsByMember: {
      a: { lower: 0.5, nominal: 0.7, upper: 1 },
      b: { lower: 0.8, nominal: 0.82, upper: 0.85 },
    },
  },
  {
    id: "small-regret",
    utilityIntervalsByMember: {
      a: { lower: 0.8, nominal: 0.82, upper: 0.85 },
      b: { lower: 0.5, nominal: 0.6, upper: 0.8 },
    },
  },
]);
assert(regretBreaksRobustTie.selectedAlternativeId === "small-regret",
"22abb. 보수 최저효용 동률은 가능한 개인 최적 대비 최악 후회를 먼저 줄인다");
assertThrows(() => solveRobustFairGroupDecision(["a"], [{
  id: "invalid-interval",
  utilityIntervalsByMember: { a: { lower: 0.8, nominal: 0.5, upper: 0.7 } },
}]), "22abc. 순서가 뒤집힌 효용 구간을 거부한다");
const tooManyFairMembers = Array.from({ length: 65 }, (_, index) => `member-${index}`);
assertThrows(() => solveFairGroupDecision(tooManyFairMembers, [{
  id: "only",
  utilitiesByMember: Object.fromEntries(tooManyFairMembers.map((memberId) => [memberId, 0.5])),
}]), "22ac. exact Nash BigInt와 Gini 계산의 참여자 자릿수·계산량 상한을 강제한다");
assertThrows(() => solveFairGroupDecision(["a"], Array.from({ length: 257 }, (_, index) => ({
  id: `alternative-${index}`,
  utilitiesByMember: { a: 0.5 },
}))), "22ad. Pareto 이차 탐색의 대안 수 상한을 강제한다");
const richWithoutLegacyAxes = {
  ...result("a"),
  detailedSignals: {
    surveyVersion: 9,
    algorithmVersion: 7,
    staminaScore: 50,
    densityScore: 100,
    scheduleStyle: "packed" as const,
    mobilityModes: [],
    categoryScores: { restaurant: 0 },
    budgetRanking: ["food", "stay", "activity", "shopping", "mobility"],
    landmarkImportance: 50,
    localInterest: 50,
  },
};
const normalizedRich = normalizePreferenceResult(richWithoutLegacyAxes, "a");
assert(normalizedRich?.observedDimensions.length === 0, "22a. rich 0~100 신호를 임의 경계로 legacy 0/1/2 축에 투영하지 않는다");
const richDiagnosis = diagnoseGroupPreferences(trip(["a", "b"]), { a: richWithoutLegacyAxes, b: { ...richWithoutLegacyAxes, userId: "b" } });
assert(richDiagnosis.dimensions.budget.responses.length === 0 && richDiagnosis.dimensions.budget.status === undefined, "22b. 묻지 않은 예산 절약 강도는 그룹 공통 성향으로 판정하지 않는다");
const oneObservedAxisDiagnosis = diagnoseGroupPreferences(trip(["a", "b"]), { a: richWithoutLegacyAxes, b: result("b") });
assert(deriveGroupPlanningProfile(oneObservedAxisDiagnosis).pace.average === undefined, "22c. 완료자는 2명이어도 축 응답 한 명의 값을 그룹 평균으로 내보내지 않는다");

const zeroEdges = Object.fromEntries(["depot", "a", "b", "c"].flatMap((from) => (
  ["depot", "a", "b", "c"].map((to) => [routeEdgeKey(from, to), { status: "available" as const, durationMinutes: 0 }])
)));
const itineraryInput = {
  members: [{ id: "a" }, { id: "b" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 11 * 60, startAnchor: { kind: "node" as const, nodeId: "depot" }, endAnchor: { kind: "node" as const, nodeId: "depot" } }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 60, utilityPointsByMember: { a: 10, b: 0 } },
    { id: "b", nodeId: "b", durationMinutes: 60, utilityPointsByMember: { a: 0, b: 10 } },
    { id: "c", nodeId: "c", durationMinutes: 60, utilityPointsByMember: { a: 8, b: 8 } },
  ],
  routeEdgesByKey: zeroEdges,
  idealUtilityPointsByMember: { a: 18, b: 18 },
  maxExpandedStates: 100_000,
} as const;
const optimized = optimizeGroupItinerary(itineraryInput);
assert(optimized.certificate.status === "optimal" && optimized.certificate.exact, "23. 작은 시간창 일정은 탐색을 끝내 정확 최적성을 증명한다");
assert(optimized.assignments.map((entry) => entry.visitId).sort().join(",") === "a,b", "24. 평균이 아니라 최저 만족도를 최대화하는 두 방문을 선택한다");
assert(optimized.objective?.minimumSatisfaction === 1 / 1.8
  && optimized.certificate.absoluteMinimumSatisfactionGap === 0
  && optimized.certificate.bestMinimumSatisfactionFraction?.numerator === "5"
  && optimized.certificate.bestMinimumSatisfactionFraction.denominator === "9", "25. 참여자별 달성 가능 효용을 유리수로 정규화하고 최적성 gap 0을 반환한다");
const reorderedOptimization = optimizeGroupItinerary({
  ...itineraryInput,
  members: [...itineraryInput.members].reverse(),
  visits: [...itineraryInput.visits].reverse(),
});
assert(reorderedOptimization.assignments.map((entry) => entry.visitId).sort().join(",") === "a,b", "26. optimizer는 참여자·후보 입력 순서와 무관하게 결정적이다");
const lockedOptimization = optimizeGroupItinerary({
  ...itineraryInput,
  days: [{ ...itineraryInput.days[0], endMinute: 12 * 60 }],
  visits: itineraryInput.visits.map((visit) => visit.id === "c" ? { ...visit, mandatory: true, lockedAssignment: { dayId: "day-1", startMinute: 10 * 60 } } : visit),
});
assert(lockedOptimization.assignments.some((entry) => entry.visitId === "c" && entry.startMinute === 10 * 60), "27. 잠금 방문은 선호 목적보다 우선해 정확한 날짜·시각을 보존한다");

const intervalConsensus = solveIntervalPreferenceConsensus([
  { userId: "a", value: 240, resolution: 60, minimum: 0 },
  { userId: "b", value: 360, resolution: 60, minimum: 0 },
]);
assert(intervalConsensus.measurableConflict && intervalConsensus.recommendedValue === 300 && intervalConsensus.maximumIntervalRegret === 30, "28. 시간 해상도 구간이 겹치지 않으면 정확한 minimax 조율점을 계산한다");

const reverseNine = Array.from({ length: 9 }, (_, index) => `item-${8 - index}`);
const kemenyNine = deriveKemenyConsensus([{ userId: "a", ranking: reverseNine }]);
assert(kemenyNine.exact && kemenyNine.ranking.join(",") === reverseNine.join(","), "29. 9개 순위도 alphabetic fallback 없이 exact subset DP로 계산한다");
const largeKemenyItems = Array.from({ length: 16 }, (_, index) => `large-${String(index).padStart(2, "0")}`);
const largeKemenyRankings = [
  { userId: "a", ranking: largeKemenyItems },
  { userId: "b", ranking: [...largeKemenyItems.slice(5), ...largeKemenyItems.slice(0, 5)] },
  { userId: "c", ranking: [...largeKemenyItems].reverse() },
  { userId: "d", ranking: [...largeKemenyItems.slice(0, 8)].reverse() },
];
const largeKemeny = deriveKemenyConsensus(largeKemenyRankings);
const permutedLargeKemeny = deriveKemenyConsensus([
  largeKemenyRankings[2],
  largeKemenyRankings[0],
  largeKemenyRankings[3],
  largeKemenyRankings[1],
]);
assert(!largeKemeny.exact
  && !largeKemeny.allOptimalRankingsEnumerated
  && largeKemeny.ranking.join(",") === permutedLargeKemeny.ranking.join(",")
  && largeKemeny.totalPairwiseDisagreement === permutedLargeKemeny.totalPairwiseDisagreement,
"29a. 16개 이상 Kemeny 근사는 Copeland/Borda 다중 시작으로 응답 입력 순서와 무관하게 결정된다");
const cappedLargeKemeny = deriveKemenyConsensus(largeKemenyRankings, { maxEvaluations: 1 });
const permutedCappedLargeKemeny = deriveKemenyConsensus([...largeKemenyRankings].reverse(), { maxEvaluations: 1 });
assert(!cappedLargeKemeny.exact
  && cappedLargeKemeny.heuristicEvaluationCount === 1
  && cappedLargeKemeny.heuristicEvaluationLimitReached
  && cappedLargeKemeny.ranking.join(",") === permutedCappedLargeKemeny.ranking.join(","),
"29b. 큰 Kemeny 근사는 이웃 평가 상한에서 결정적으로 중단하고 exact로 과장하지 않는다");
assertThrows(() => deriveKemenyConsensus([{
  userId: "a",
  ranking: Array.from({ length: 129 }, (_, index) => `oversized-${index}`),
}]), "29c. pairwise 행렬 자체가 과도해지는 Kemeny 항목 수를 입력 단계에서 거부한다");
assertThrows(() => deriveKemenyConsensus(largeKemenyRankings, { maxEvaluations: 0 }),
  "29d. Kemeny 이웃 평가 상한은 1 이상의 안전한 정수만 허용한다");

const oneResponseDimension = diagnosePreferenceDimension("pace", [{ userId: "a", score: 1 }]);
assert(oneResponseDimension.status === undefined && oneResponseDimension.pairwiseAgreement === undefined, "30. 축 응답 한 명을 100% 합의로 위장하지 않는다");

const minuteEdges = Object.fromEntries(["a", "b"].flatMap((from) => ["a", "b"].map((to) => [
  routeEdgeKey(from, to),
  { status: "available" as const, durationMinutes: 0 },
])));
const baselineMinuteOptimization = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 11 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 45, utilityPointsByMember: { a: 1 }, mandatory: true },
    { id: "b", nodeId: "b", durationMinutes: 60, utilityPointsByMember: { a: 1 }, mandatory: true },
  ],
  routeEdgesByKey: minuteEdges,
  idealUtilityPointsByMember: { a: 2 },
  baselineAssignments: [
    { visitId: "a", dayId: "day-1", startMinute: 9 * 60 + 30 },
    { visitId: "b", dayId: "day-1", startMinute: 10 * 60 },
  ],
  maxExpandedStates: 100_000,
});
assert(baselineMinuteOptimization.certificate.exact
  && baselineMinuteOptimization.assignments.find((entry) => entry.visitId === "a")?.startMinute === 9 * 60 + 15
  && baselineMinuteOptimization.objective?.shiftedMinutes === 15, "31. 모든 정수 분을 열거해 earliest/baseline 사이의 진짜 최소 변경 시각을 찾는다");

const individualIdealOptimization = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 60, utilityPointsByMember: { a: 1 } },
    { id: "b", nodeId: "b", durationMinutes: 60, utilityPointsByMember: { a: 1 } },
  ],
  routeEdgesByKey: minuteEdges,
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 10_000,
});
assert(individualIdealOptimization.objective?.minimumSatisfaction === 1, "32. 배치 불가능 후보가 있어도 검증된 개인 최적 효용으로 만족도를 정규화한다");
const derivedIndividualIdeal = calculateExactIndividualIdealUtilityPoints({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 60, utilityPointsByMember: { a: 1 } },
    { id: "b", nodeId: "b", durationMinutes: 60, utilityPointsByMember: { a: 1 } },
  ],
  routeEdgesByKey: minuteEdges,
  maxExpandedStates: 10_000,
});
assert(derivedIndividualIdeal.exact && derivedIndividualIdeal.idealUtilityPointsByMember.a === 1, "32a. 동일 Hard Constraint의 개인 최적 기준도 작은 문제에서 exact 계산한다");
const zeroUtilityIdeal = calculateExactIndividualIdealUtilityPoints({
  members: [{ id: "a" }, { id: "b" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1, b: 0 } }],
  routeEdgesByKey: {},
  maxExpandedStates: 10_000,
});
assert(zeroUtilityIdeal.exact && zeroUtilityIdeal.zeroUtilityMemberIds.join(",") === "b", "32b. 효용 근거가 0인 참여자를 exact 개인 최적 계산 누락과 구분한다");

const missingRouteOptimization = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "node", nodeId: "depot" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 60, utilityPointsByMember: { a: 1 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 100,
});
assert(missingRouteOptimization.certificate.status === "feasible"
  && !missingRouteOptimization.certificate.exact
  && missingRouteOptimization.assignments.length === 0,
"33. optional 경로 누락을 0분이나 이동 불가로 오판하지 않고 알려진 경로만의 보수 해를 유지한다");

const unreachableOptimization = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "node", nodeId: "depot" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1 }, mandatory: true }],
  routeEdgesByKey: { [routeEdgeKey("depot", "a")]: { status: "unreachable" } },
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 100,
});
assert(unreachableOptimization.certificate.status === "infeasible" && unreachableOptimization.certificate.exact, "34. 확인된 unreachable 경로는 누락과 구분해 Hard Constraint infeasible로 판정한다");

const mandatoryWithoutPreferences = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 0 }, mandatory: true }],
  routeEdgesByKey: {},
  maxExpandedStates: 1_000,
});
assert(mandatoryWithoutPreferences.certificate.status === "optimal"
  && mandatoryWithoutPreferences.certificate.preferenceDataStatus === "insufficient"
  && mandatoryWithoutPreferences.assignments[0]?.visitId === "a", "35. 성향 근거가 없어도 mandatory Hard Constraint의 실행 가능성은 별도로 계산한다");

const boundedOptimization = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 10 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1 } },
    { id: "b", nodeId: "b", durationMinutes: 30, utilityPointsByMember: { a: 1 } },
  ],
  routeEdgesByKey: minuteEdges,
  idealUtilityPointsByMember: { a: 2 },
  maxExpandedStates: 1,
  acceptableMinimumUtilityGap: 1,
});
assert(!boundedOptimization.certificate.exact
  && boundedOptimization.certificate.status === "feasible"
  && boundedOptimization.certificate.minimumSatisfactionGapWithinTarget
  && boundedOptimization.certificate.gapScope === "minimum-satisfaction", "36. 최저 만족도 gap만 맞춘 중단 탐색을 전체 near-optimal로 과장하지 않는다");

const touchingIntervals = solveIntervalPreferenceConsensus([
  { userId: "a", value: 60, resolution: 60 },
  { userId: "b", value: 120, resolution: 60 },
]);
assert(!touchingIntervals.measurableConflict && touchingIntervals.commonInterval?.lower === 90, "37. 측정 구간이 경계에서 만나면 성향 충돌로 과장하지 않는다");

const microscopicGap = solveIntervalPreferenceConsensus([
  { userId: "a", value: 0.5, resolution: 1 },
  { userId: "b", value: 1.5000000000005, resolution: 1 },
]);
assert(microscopicGap.measurableConflict && microscopicGap.commonInterval === undefined, "38. 작은 양의 구간 틈도 뒤집힌 공통구간으로 반환하지 않는다");
assertThrows(() => solveIntervalPreferenceConsensus([{ userId: "a", value: 1, resolution: 1, minimum: Number.NaN }]), "39. NaN 구간 경계를 거부한다");

assertThrows(() => optimizeGroupItinerary({
  ...itineraryInput,
  days: [itineraryInput.days[0], { ...itineraryInput.days[0], id: "day-2" }],
}), "40. 같은 실제 날짜의 DAY 중복을 거부한다");
assertThrows(() => optimizeGroupItinerary({
  ...itineraryInput,
  days: [{ ...itineraryInput.days[0], date: "2026-02-30" }],
}), "41. 존재하지 않는 ISO 날짜를 거부한다");

const crossDayShift = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [
    { id: "day-1", date: "2026-07-18", startMinute: 9 * 60, endMinute: 11 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } },
    { id: "day-2", date: "2026-07-20", startMinute: 9 * 60, endMinute: 11 * 60, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } },
  ],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1 }, lockedAssignment: { dayId: "day-2", startMinute: 10 * 60 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  baselineAssignments: [{ visitId: "a", dayId: "day-1", startMinute: 9 * 60 }],
  maxExpandedStates: 10_000,
});
assert(crossDayShift.objective?.shiftedMinutes === 2 * 1440 + 60, "42. 날짜 이동 변경량을 고정 1440분이 아니라 실제 날짜·시각 차이로 계산한다");

const bridgeEdges = {
  [routeEdgeKey("depot", "finish")]: { status: "available" as const, durationMinutes: 0 },
  [routeEdgeKey("depot", "x")]: { status: "available" as const, durationMinutes: 0 },
  [routeEdgeKey("x", "finish")]: { status: "unreachable" as const },
  [routeEdgeKey("depot", "y")]: { status: "unreachable" as const },
  [routeEdgeKey("y", "finish")]: { status: "available" as const, durationMinutes: 0 },
  [routeEdgeKey("x", "y")]: { status: "available" as const, durationMinutes: 0 },
  [routeEdgeKey("y", "x")]: { status: "unreachable" as const },
};
const nonMetricBridge = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 60,
    startAnchor: { kind: "node", nodeId: "depot" },
    endAnchor: { kind: "node", nodeId: "finish" },
  }],
  visits: [
    { id: "x", nodeId: "x", durationMinutes: 20, utilityPointsByMember: { a: 1 }, mandatory: true },
    { id: "y", nodeId: "y", durationMinutes: 20, utilityPointsByMember: { a: 0 } },
  ],
  routeEdgesByKey: bridgeEdges,
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 10_000,
});
assert(nonMetricBridge.certificate.exact
  && nonMetricBridge.certificate.status === "optimal"
  && nonMetricBridge.assignments.map((entry) => entry.visitId).join(",") === "x,y",
"42a. 중간 방문에서 end-anchor 직행을 강제하지 않아 비-metric X→Y→종료 경로를 보존한다");

const optionalUnknown = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 60,
    startAnchor: { kind: "node", nodeId: "depot" },
    endAnchor: { kind: "node", nodeId: "depot" },
  }],
  visits: [{ id: "optional", nodeId: "optional", durationMinutes: 30, utilityPointsByMember: { a: 1 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 1_000,
});
assert(optionalUnknown.certificate.status === "feasible"
  && !optionalUnknown.certificate.exact
  && optionalUnknown.certificate.gapScope === "none"
  && optionalUnknown.certificate.minimumSatisfactionUpperBound === undefined
  && optionalUnknown.certificate.absoluteMinimumSatisfactionGap === undefined,
"42b. optional 경로 미확인은 알려진 경로의 안전한 일정만 반환하고 증명되지 않은 normalized gap은 숨긴다");

const unknownIdealMismatch = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 60,
    startAnchor: { kind: "node", nodeId: "depot" },
    endAnchor: { kind: "node", nodeId: "depot" },
  }],
  visits: [
    { id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1 } },
    { id: "b", nodeId: "b", durationMinutes: 30, utilityPointsByMember: { a: 1 } },
  ],
  routeEdgesByKey: {
    [routeEdgeKey("depot", "a")]: { status: "available", durationMinutes: 0 },
    [routeEdgeKey("a", "depot")]: { status: "available", durationMinutes: 0 },
    [routeEdgeKey("depot", "b")]: { status: "available", durationMinutes: 0 },
    [routeEdgeKey("b", "depot")]: { status: "available", durationMinutes: 0 },
    [routeEdgeKey("a", "b")]: { status: "unknown" },
    [routeEdgeKey("b", "a")]: { status: "unknown" },
  },
  // 알려진 간선에서만 계산한 1은 unknown=0 완화에서 가능한 효용 2의 ideal이 아니다.
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 10_000,
});
assert(unknownIdealMismatch.objective?.minimumSatisfaction === 1
  && unknownIdealMismatch.certificate.gapScope === "none"
  && unknownIdealMismatch.certificate.minimumSatisfactionUpperBound === undefined
  && unknownIdealMismatch.certificate.minimumSatisfactionGapWithinTarget === undefined,
"42ba. unknown 경로가 외부 ideal을 깨뜨릴 수 있으면 거짓 normalized gap 0을 반환하지 않는다");

const mandatoryUnknown = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 60,
    startAnchor: { kind: "node", nodeId: "depot" },
    endAnchor: { kind: "node", nodeId: "depot" },
  }],
  visits: [{ id: "mandatory", nodeId: "mandatory", durationMinutes: 30, utilityPointsByMember: { a: 1 }, mandatory: true }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 1_000,
});
assert(mandatoryUnknown.certificate.status === "insufficient-data"
  && !mandatoryUnknown.certificate.exact
  && mandatoryUnknown.assignments.length === 0,
"42c. mandatory 실행 가능성이 미확인 경로에 달리면 이동 불가가 아니라 분석 불충분으로 구분한다");
const mandatoryUnknownButTooLong = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 60,
    startAnchor: { kind: "node", nodeId: "depot" },
    endAnchor: { kind: "node", nodeId: "depot" },
  }],
  visits: [{ id: "mandatory", nodeId: "mandatory", durationMinutes: 61, utilityPointsByMember: { a: 1 }, mandatory: true }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 1_000,
});
assert(mandatoryUnknownButTooLong.certificate.status === "infeasible"
  && mandatoryUnknownButTooLong.certificate.exact,
"42ca. unknown 이동을 0분으로 완화해도 불가능한 mandatory 일정만 exact infeasible로 증명한다");

const uncertainTravelInput = {
  members: [{ id: "a" }],
  days: [{
    id: "day-1",
    date: "2026-07-18",
    startMinute: 0,
    endMinute: 80,
    startAnchor: { kind: "node" as const, nodeId: "depot" },
    endAnchor: { kind: "node" as const, nodeId: "depot" },
  }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 30, utilityPointsByMember: { a: 1 }, mandatory: true }],
  routeEdgesByKey: {
    [routeEdgeKey("depot", "a")]: { status: "available" as const, durationMinutes: 5, upperDurationMinutes: 20 },
    [routeEdgeKey("a", "depot")]: { status: "available" as const, durationMinutes: 5, upperDurationMinutes: 20 },
  },
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 10_000,
};
const uncertainTravel = optimizeGroupItinerary(uncertainTravelInput);
assert(uncertainTravel.certificate.status === "optimal"
  && uncertainTravel.assignments[0]?.startMinute === 20
  && uncertainTravel.objective?.totalTravelMinutes === 10,
"42d. Hard 시간 가능성은 이동 상한으로 지키고 이동 목적값은 명목시간으로 계산한다");
const upperInfeasible = optimizeGroupItinerary({
  ...uncertainTravelInput,
  days: [{ ...uncertainTravelInput.days[0], endMinute: 60 }],
});
assert(upperInfeasible.certificate.status === "infeasible" && upperInfeasible.certificate.exact,
"42e. 명목시간으로는 가능해도 보수적 이동 상한에서 불가능한 mandatory 일정은 거부한다");
assertThrows(() => optimizeGroupItinerary({
  ...uncertainTravelInput,
  routeEdgesByKey: {
    ...uncertainTravelInput.routeEdgesByKey,
    [routeEdgeKey("depot", "a")]: { status: "available", durationMinutes: 10, upperDurationMinutes: 9 },
  },
}), "42f. 이동시간 상한이 명목값보다 작은 모순 입력을 거부한다");

const dominatedMinuteStates = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 100, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 10, utilityPointsByMember: { a: 1 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 1_000,
});
assert(dominatedMinuteStates.certificate.exact
  && dominatedMinuteStates.assignments[0]?.startMinute === 0
  && dominatedMinuteStates.certificate.expandedStates === 2
  && dominatedMinuteStates.certificate.prunedStates >= 90,
"42g. 같은 방문 상태의 더 늦고 열등한 분 단위 label을 제거하면서 exact 해와 결정적 시각을 보존한다");

const generatedStateCapped = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 100, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 10, utilityPointsByMember: { a: 1 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  maxExpandedStates: 1_000,
  maxGeneratedStates: 1,
});
assert(!generatedStateCapped.certificate.exact
  && generatedStateCapped.certificate.status === "feasible"
  && generatedStateCapped.certificate.computationLimitReached
  && generatedStateCapped.certificate.generatedStates === 1
  && generatedStateCapped.certificate.peakFrontierStates === 1
  && generatedStateCapped.certificate.minimumSatisfactionUpperBound === 1,
"42h. label 생성 상한에서 누락 branch 상한을 보존하며 exact가 아닌 feasible로 중단한다");

const budgetPriorityInput = {
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 10, startAnchor: { kind: "open" as const }, endAnchor: { kind: "open" as const } }],
  visits: [
    { id: "a-low", nodeId: "a-low", durationMinutes: 10, utilityPointsByMember: { a: 1 } },
    { id: "z-high", nodeId: "z-high", durationMinutes: 10, utilityPointsByMember: { a: 100 } },
  ],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 100 },
  maxExpandedStates: 100,
  maxGeneratedStates: 2,
};
const budgetPrioritizesUtility = optimizeGroupItinerary(budgetPriorityInput);
assert(budgetPrioritizesUtility.assignments[0]?.visitId === "z-high"
  && budgetPrioritizesUtility.objective?.satisfactionByMember.a === 1,
"42i. 작은 생성 예산에서도 ID순 저효용 후보가 고효용 대표 branch를 가리면 안 된다");
const budgetPrioritizesMandatory = optimizeGroupItinerary({
  ...budgetPriorityInput,
  visits: budgetPriorityInput.visits.map((visit) => visit.id === "z-high" ? { ...visit, mandatory: true } : visit),
});
assert(budgetPrioritizesMandatory.assignments[0]?.visitId === "z-high"
  && budgetPrioritizesMandatory.certificate.status === "feasible",
"42j. 작은 생성 예산에서도 mandatory branch를 일반 후보보다 먼저 보존해야 한다");

const baselineStartPriority = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 100, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: [{ id: "a", nodeId: "a", durationMinutes: 10, utilityPointsByMember: { a: 1 } }],
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 1 },
  baselineAssignments: [{ visitId: "a", dayId: "day-1", startMinute: 50 }],
  maxExpandedStates: 100,
  maxGeneratedStates: 2,
});
assert(baselineStartPriority.assignments[0]?.startMinute === 50,
  "42k. 탐색 예산이 작아도 가능한 기존 일정 시각을 가장 이른 시각보다 먼저 보존해야 한다");

assertThrows(() => optimizeGroupItinerary({
  ...budgetPriorityInput,
  visits: [{
    id: "locked",
    nodeId: "locked",
    durationMinutes: 10,
    utilityPointsByMember: { a: 1 },
    lockedAssignment: { dayId: "day-1", startMinute: 5 },
  }],
  idealUtilityPointsByMember: { a: 1 },
}), "42l. 잠금 일정이 DAY 종료를 넘으면 입력 단계에서 거부해야 한다");

const directedWindowInput = {
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 40, startAnchor: { kind: "open" as const }, endAnchor: { kind: "open" as const } }],
  visits: [
    { id: "early", nodeId: "early", durationMinutes: 10, utilityPointsByMember: { a: 1 }, mandatory: true, timeWindows: [{ dayId: "day-1", startMinute: 0, endMinute: 10 }] },
    { id: "late", nodeId: "late", durationMinutes: 10, utilityPointsByMember: { a: 1 }, mandatory: true, timeWindows: [{ dayId: "day-1", startMinute: 20, endMinute: 30 }] },
  ],
  routeEdgesByKey: {
    [routeEdgeKey("early", "late")]: { status: "available" as const, durationMinutes: 0 },
  },
  idealUtilityPointsByMember: { a: 2 },
  maxExpandedStates: 1_000,
};
const directedWindowResult = optimizeGroupItinerary(directedWindowInput);
assert(directedWindowResult.certificate.exact
  && directedWindowResult.certificate.status === "optimal"
  && directedWindowResult.assignments.map((assignment) => assignment.visitId).join(",") === "early,late",
"42m. 시간창상 불가능한 역방향 경로 누락을 분석 불충분으로 오인하면 안 된다");

const lazyStartStress = optimizeGroupItinerary({
  members: [{ id: "a" }],
  days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 1440, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
  visits: Array.from({ length: 128 }, (_, index) => ({
    id: `lazy-${index}`,
    nodeId: `lazy-${index}`,
    durationMinutes: 1,
    utilityPointsByMember: { a: 1 },
  })),
  routeEdgesByKey: {},
  idealUtilityPointsByMember: { a: 128 },
  maxExpandedStates: 1,
  maxGeneratedStates: 1,
});
assert(lazyStartStress.certificate.generatedStates === 1
  && lazyStartStress.certificate.computationLimitReached,
"42n. 생성 한도 1에서 분 단위 branch를 선행 생성하지 않고 즉시 중단해야 한다");

let randomState = 0x5eed1234;
const nextRandom = () => {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return randomState;
};
for (let scenario = 0; scenario < 12; scenario += 1) {
  const visits = Array.from({ length: 4 }, (_, index) => ({
    id: `v${index}`,
    nodeId: `v${index}`,
    durationMinutes: 1 + (nextRandom() % 2),
    utilityPointsByMember: {
      a: index === 0 ? 1 + (nextRandom() % 5) : nextRandom() % 6,
      b: index === 1 ? 1 + (nextRandom() % 5) : nextRandom() % 6,
    },
  }));
  const subsets = Array.from({ length: 1 << visits.length }, (_, mask) => {
    const selected = visits.filter((_, index) => (mask & (1 << index)) !== 0);
    return {
      mask,
      selected,
      duration: selected.reduce((sum, visit) => sum + visit.durationMinutes, 0),
      utilityA: selected.reduce((sum, visit) => sum + visit.utilityPointsByMember.a, 0),
      utilityB: selected.reduce((sum, visit) => sum + visit.utilityPointsByMember.b, 0),
    };
  }).filter((entry) => entry.duration <= 3);
  const idealA = Math.max(...subsets.map((entry) => entry.utilityA));
  const idealB = Math.max(...subsets.map((entry) => entry.utilityB));
  const oracle = [...subsets].sort((left, right) => {
    const leftMinimum = Math.min(left.utilityA / idealA, left.utilityB / idealB);
    const rightMinimum = Math.min(right.utilityA / idealA, right.utilityB / idealB);
    if (leftMinimum !== rightMinimum) return rightMinimum - leftMinimum;
    const leftProduct = left.utilityA * left.utilityB;
    const rightProduct = right.utilityA * right.utilityB;
    if (leftProduct !== rightProduct) return rightProduct - leftProduct;
    if (left.selected.length !== right.selected.length) return left.selected.length - right.selected.length;
    return left.mask - right.mask;
  })[0];
  const randomEdges = Object.fromEntries(visits.flatMap((from) => visits.map((to) => [
    routeEdgeKey(from.nodeId, to.nodeId),
    { status: "available" as const, durationMinutes: 0 },
  ])));
  const result = optimizeGroupItinerary({
    members: [{ id: "a" }, { id: "b" }],
    days: [{ id: "day-1", date: "2026-07-18", startMinute: 0, endMinute: 3, startAnchor: { kind: "open" }, endAnchor: { kind: "open" } }],
    visits,
    routeEdgesByKey: randomEdges,
    idealUtilityPointsByMember: { a: idealA, b: idealB },
    maxExpandedStates: 100_000,
  });
  const selectedIds = new Set(result.assignments.map((assignment) => assignment.visitId));
  const selectedA = visits.filter((visit) => selectedIds.has(visit.id)).reduce((sum, visit) => sum + visit.utilityPointsByMember.a, 0);
  const selectedB = visits.filter((visit) => selectedIds.has(visit.id)).reduce((sum, visit) => sum + visit.utilityPointsByMember.b, 0);
  assert(result.certificate.exact
    && Math.min(selectedA / idealA, selectedB / idealB) === Math.min(oracle.utilityA / idealA, oracle.utilityB / idealB)
    && selectedA * selectedB === oracle.utilityA * oracle.utilityB
    && result.assignments.length === oracle.selected.length,
  `43-${scenario + 1}. 작은 무작위 문제를 독립 완전탐색 oracle과 대조한다`);
}

console.log("Group preference verification passed: 59 scenarios + tag/profile assertions");
