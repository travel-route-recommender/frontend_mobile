import { validateAppState } from "../src/core/state-integrity";
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

console.log("State integrity verification passed: invariants, migration, session isolation, and Duri stale detection");

