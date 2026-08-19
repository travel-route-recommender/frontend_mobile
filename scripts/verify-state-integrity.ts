import { validateAppState } from "../src/core/state-integrity";
import { resolveAppHydrationPolicy } from "../src/core/state-integrity/appHydrationPolicy";
import { createDemoData, type DuriDomainState } from "../src/data/mock/demoData";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { buildDuriAnalysisInputFromState } from "../src/features/duri/selectors/duriSelectors";
import { normalizePersistedState, CURRENT_SCHEMA_VERSION } from "../src/store/normalizePersistedState";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function copyDomain(value: DuriDomainState): DuriDomainState {
  return JSON.parse(JSON.stringify(value)) as DuriDomainState;
}

const optionalDocumentFailure = new Error("document metadata unavailable");
const optionalFailureGate = resolveAppHydrationPolicy({
  required: [{ isHydrated: true, error: null }, { isHydrated: true, error: null }],
  optional: [{ isHydrated: false, error: optionalDocumentFailure }],
});
assert(optionalFailureGate.isHydrated && !optionalFailureGate.error
  && optionalFailureGate.optionalErrors[0] === optionalDocumentFailure,
"optional 문서 hydration 실패는 기록하되 앱 전역 진입을 막지 않는다");
const requiredFailure = new Error("domain unavailable");
const requiredFailureGate = resolveAppHydrationPolicy({
  required: [{ isHydrated: false, error: requiredFailure }],
  optional: [{ isHydrated: true, error: null }],
});
assert(!requiredFailureGate.isHydrated && requiredFailureGate.error === requiredFailure, "필수 도메인 hydration 실패는 기존 전역 gate로 유지한다");

const base = createDemoData();
const clean = validateAppState({
  domain: base,
  auth: { sessionKind: "member", currentSessionUserId: base.currentUserId, preferenceTestCompleted: true },
});
assert(clean.valid && clean.warnings.length === 0, "demo seed must satisfy all state invariants");

const damaged = copyDomain(base);
const tripId = damaged.activeTripId;
const trip = damaged.tripsById[tripId];
const firstCandidate = damaged.candidatesByTripId[tripId][0];
const firstItem = damaged.itineraryByTripId[tripId][0];
damaged.tripOrder = [tripId, tripId, "missing-trip"];
trip.members = [...trip.members, { userId: "", role: "member" }, { ...trip.members[0] }];
damaged.candidatesByTripId[tripId] = [firstCandidate, { ...firstCandidate, addedByUserIds: [...firstCandidate.addedByUserIds] }];
damaged.itineraryByTripId[tripId] = [
  { ...firstItem, preferredByUserIds: [...firstItem.preferredByUserIds, "user-outside"] },
  { ...firstItem },
];
damaged.savedPlaceIdsByUserId[damaged.currentUserId] = [
  ...damaged.savedPlaceIdsByUserId[damaged.currentUserId],
  damaged.savedPlaceIdsByUserId[damaged.currentUserId][0],
];

const brokenReport = validateAppState({
  domain: damaged,
  auth: { sessionKind: "member", currentSessionUserId: damaged.currentUserId, preferenceTestCompleted: true },
});
for (const expectedCode of [
  "trip.order-duplicate",
  "trip.order-reference-missing",
  "trip.member-id-empty",
  "trip.member-duplicate",
  "candidate.place-duplicate",
  "itinerary.item-id-duplicate",
  "saved.place-duplicate",
]) {
  assert(brokenReport.errors.some((entry) => entry.code === expectedCode), `validator must report ${expectedCode}`);
}

const normalized = normalizePersistedState(damaged);
const normalizedReport = validateAppState({
  domain: normalized,
  auth: { sessionKind: "member", currentSessionUserId: normalized.currentUserId, preferenceTestCompleted: true },
});
assert(normalized.schemaVersion === CURRENT_SCHEMA_VERSION, "migration must stamp the current schema version");
assert(normalizedReport.valid, "safe normalization must repair deterministic relation damage");
assert(normalized.tripOrder.join(",") === tripId, "tripOrder must remove duplicates and unknown IDs");
assert(normalized.tripsById[tripId].members.every((member) => Boolean(member.userId)), "blank member IDs must be removed");
assert(new Set(normalized.candidatesByTripId[tripId].map((entry) => entry.placeId)).size === normalized.candidatesByTripId[tripId].length, "duplicate candidates must merge");
assert(new Set(normalized.savedPlaceIdsByUserId[normalized.currentUserId]).size === normalized.savedPlaceIdsByUserId[normalized.currentUserId].length, "saved place IDs must deduplicate independently");
assert(normalized.itineraryByTripId[tripId].every((item) => item.preferredByUserIds.every((userId) => normalized.tripsById[tripId].members.some((member) => member.userId === userId))), "itinerary preference references must stay within trip members");

const invalidFacts = copyDomain(base);
invalidFacts.tripsById[tripId].endCondition = {
  type: "train",
  location: { name: "" },
  deadline: "18:60",
  travelMinutes: -1,
  serviceBufferMinutes: 721,
};
const invalidFactsReport = validateAppState({
  domain: invalidFacts,
  auth: { sessionKind: "member", currentSessionUserId: invalidFacts.currentUserId, preferenceTestCompleted: true },
});
for (const expectedCode of [
  "trip.end-condition-location-invalid",
  "trip.end-condition-deadline-invalid",
  "trip.end-condition-travel-invalid",
  "trip.end-condition-buffer-invalid",
]) {
  assert(invalidFactsReport.errors.some((entry) => entry.code === expectedCode), `validator must report ${expectedCode}`);
}

const legacyFacts = copyDomain(base);
(legacyFacts.tripsById[tripId] as unknown as Record<string, unknown>).transport = "walking";
(legacyFacts.tripsById[tripId] as unknown as Record<string, unknown>).endCondition = { type: "train", location: { name: "부산역" }, deadline: "18:60", travelMinutes: 40, serviceBufferMinutes: 20 };
const migratedFacts = normalizePersistedState(legacyFacts);
assert(migratedFacts.tripsById[tripId].transport === "public", "legacy walking transport must migrate to public transit and walking");
assert(migratedFacts.tripsById[tripId].endCondition === null, "invalid persisted end condition must be discarded instead of guessed");

const minutePrecisionFacts = copyDomain(base);
(minutePrecisionFacts.tripsById[tripId] as unknown as Record<string, unknown>).endCondition = { type: "train", location: { name: "부산역" }, deadline: "18:07", travelMinutes: 40, serviceBufferMinutes: 20 };
const normalizedMinutePrecisionFacts = normalizePersistedState(minutePrecisionFacts);
assert(normalizedMinutePrecisionFacts.tripsById[tripId].endCondition?.deadline === "18:07", "persisted end condition must preserve arbitrary one-minute deadlines");
assert(!validateAppState({
  domain: normalizedMinutePrecisionFacts,
  auth: { sessionKind: "member", currentSessionUserId: normalizedMinutePrecisionFacts.currentUserId, preferenceTestCompleted: true },
}).errors.some((entry) => entry.code === "trip.end-condition-deadline-invalid"), "state integrity must accept arbitrary one-minute deadlines");

const undecidedFacts = copyDomain(base);
undecidedFacts.tripsById[tripId] = { ...undecidedFacts.tripsById[tripId], startDate: null, endDate: null, dateUndecided: true };
const undecidedReport = validateAppState({
  domain: undecidedFacts,
  auth: { sessionKind: "member", currentSessionUserId: undecidedFacts.currentUserId, preferenceTestCompleted: true },
});
assert(undecidedReport.errors.some((entry) => entry.code === "trip.date-undecided-end-condition-present"), "날짜 미정 여행은 종료 조건을 보유하면 안 된다");
assert(normalizePersistedState(undecidedFacts).tripsById[tripId].endCondition === null, "normalization must remove an end condition from an undecided-date trip");

const mismatchedSession = validateAppState({
  domain: base,
  auth: { sessionKind: "guest", currentSessionUserId: "missing-user", preferenceTestCompleted: false },
});
assert(mismatchedSession.errors.some((entry) => entry.code === "user.session-reference-missing"), "missing session user must be invalid");
assert(mismatchedSession.errors.some((entry) => entry.code === "user.session-domain-mismatch"), "auth/domain user mismatch must be invalid");

const input = buildDuriAnalysisInputFromState(base, tripId);
assert(input, "demo trip must produce Duri input");
const session = createDuriAnalysisSession(input, "2026-07-15T00:00:00.000Z");
const changed = copyDomain(base);
changed.itineraryByTripId[tripId] = changed.itineraryByTripId[tripId].map((item, index) => index === 0 ? { ...item, startTime: "10:30" } : item);
const stale = validateAppState({
  domain: changed,
  auth: { sessionKind: "member", currentSessionUserId: changed.currentUserId, preferenceTestCompleted: true },
  duri: { sessionsByTripId: { [tripId]: session }, suggestionsByTripId: {}, receiptsBySuggestionId: {} },
});
assert(stale.valid, "stale analysis is expected state, not structural corruption");
assert(stale.warnings.some((entry) => entry.code === "duri.analysis-stale"), "itinerary change must make the existing analysis stale");

console.log("State integrity verification passed: invariants, fact migration, session isolation, and Duri stale detection");
