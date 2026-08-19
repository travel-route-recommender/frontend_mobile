import type { TripRoom, User, UserPreferenceResult } from "../src/domain";
import { calculatePersonalPreferenceResult } from "../src/duri/preferences";
import {
  deriveGroupPlanningProfile,
  calculateMinimaxPreferenceCompromise,
  deriveConsensusRanking,
  deriveMobilityConsensus,
  diagnoseGroupPreferences,
  diagnosePreferenceDimension,
  normalizedKendallDistance,
  normalizePreferenceResult,
  summarizeGroupPreferredTags,
} from "../src/duri/group-preferences";
import { getRoomPreferenceResponseSummary } from "../src/features/trips/selectors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

const fairCompromise = calculateMinimaxPreferenceCompromise([
  { userId: "a", score: 0 },
  { userId: "b", score: 0 },
  { userId: "c", score: 2 },
]);
assert(fairCompromise.recommendedScore === 1 && fairCompromise.maximumRegret === 0.5, "16. 다수 평균보다 최대 후회를 먼저 줄여 소수의 극단 선호를 보호한다");
const minimaxTie = calculateMinimaxPreferenceCompromise([
  { userId: "a", score: 0 },
  { userId: "b", score: 1 },
  { userId: "c", score: 1 },
]);
assert(minimaxTie.recommendedScore === 1 && minimaxTie.equallyFairScores.join(",") === "0,1", "16a. 평균 후회 tie-break와 별개로 같은 최대 후회의 모든 선택지를 조율 범위에 보존한다");
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
assert(consensusRanking[0].item === "food" && consensusRanking[1].item === "stay", "19. Borda 평균 순위는 동률을 안정적으로 정렬한다");

console.log("Group preference verification passed: 20 scenarios + tag/profile assertions");
