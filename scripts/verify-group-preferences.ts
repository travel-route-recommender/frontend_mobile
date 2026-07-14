import type { TripRoom, User, UserPreferenceResult } from "../src/domain";
import { calculatePersonalPreferenceResult } from "../src/duri/preferences";
import {
  deriveGroupPlanningProfile,
  diagnoseGroupPreferences,
  diagnosePreferenceDimension,
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

assert(completeDiagnosis.commonPreferences.length === 5 && completeDiagnosis.matchRate === 100, "8. 모든 계획 차원이 같으면 common, 100이어야 한다");

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

console.log("Group preference verification passed: 15 scenarios + tag/profile assertions");
