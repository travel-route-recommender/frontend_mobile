import type { ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../src/domain";
import { analyzeDensity, isMealPlace } from "../src/duri/duri-analysis";
import { buildItineraryFingerprint, generateSuggestionId } from "../src/duri/duri-suggestions";
import type { DuriSuggestion, ScheduleChangePreview } from "../src/duri/duri-suggestions";
import { DURI_SUGGESTION_VERSION } from "../src/features/duri/constants";
import { analyzeCandidateUsage, analyzeDayBalance, analyzeTimeConflicts, calculateAnalysisCoverage } from "../src/features/duri/logic/analysisContext";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability, isSuggestionStale } from "../src/features/duri/logic/analysisSnapshot";
import { generateDuriSuggestions } from "../src/features/duri/logic/suggestionGeneration";
import { createDuriSuggestionPreview, diffItinerarySnapshots } from "../src/features/duri/logic/suggestionPreview";
import { buildDuriAnalysisInputFromState } from "../src/features/duri/selectors/duriSelectors";
import type { DuriInputSource, DuriSuggestionEnvelope } from "../src/features/duri/types";
import { prepareDuriSuggestionAtomicApply, validateDuriSuggestion } from "../src/features/duri/validation/atomicSuggestionApply";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

// Analysis: 18 required scenarios.
const empty = state();
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(empty, "trip"), engineAvailable: true }).status === "no-itinerary", "analysis 1: empty itinerary");
const one = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00")], other: [] } });
assert(getDuriAnalysisAvailability({ input: buildDuriAnalysisInputFromState(one, "trip"), engineAvailable: true }).status === "limited", "analysis 2: one item limited");
const conflict = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00", 90), item("i2", "b", "2026-07-18", "11:00")], other: [] } });
assert(analyzeTimeConflicts(snapshotFor(conflict)).length === 1, "analysis 3: overlapping items");
const touching = state({ itineraryByTripId: { trip: [item("i1", "a", "2026-07-18", "10:00"), item("i2", "b", "2026-07-18", "11:00")], other: [] } });
assert(analyzeTimeConflicts(snapshotFor(touching)).length === 0, "analysis 4: touching ranges");
const denseItems = ["a", "b", "c", "d", "e"].map((placeId, index) => item(`dense-${index}`, placeId, "2026-07-18", `${String(8 + index).padStart(2, "0")}:00`));
const denseSnapshot = snapshotFor(state({ itineraryByTripId: { trip: denseItems, other: [] } }));
assert(analyzeDensity(denseSnapshot).issues.some((issue) => issue.severity !== "info"), "analysis 5: dense day");
assert(analyzeDayBalance(denseSnapshot).issues.length === 1, "analysis 6: day balance");
assert(isMealPlace(places.meal), "analysis 7: meal category");
assert(!isMealPlace(places.a), "analysis 8: non-meal category");
assert(calculateAnalysisCoverage(snapshotFor(touching)).routeData === "unavailable", "analysis 9: no coordinates");
const partialPlaces = { ...places, a: { ...places.a, latitude: 35.1, longitude: 129.1 } as Place };
assert(calculateAnalysisCoverage(snapshotFor(state({ placesById: partialPlaces, itineraryByTripId: touching.itineraryByTripId }))).routeData === "partial", "analysis 10: partial coordinates");
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

const immutableSource = state({ itineraryByTripId: touching.itineraryByTripId });
const immutableBefore = JSON.stringify(immutableSource);
const immutableSnapshot = snapshotFor(immutableSource);
assert(JSON.stringify(immutableSource) === immutableBefore && createDuriInputFingerprint(immutableSnapshot) === createDuriInputFingerprint(immutableSnapshot), "snapshot/fingerprint deterministic and immutable");

function sessionFor(source: DuriInputSource) {
  const input = buildDuriAnalysisInputFromState(source, "trip");
  assert(input, "session input");
  return createDuriAnalysisSession(input, "2026-07-14T00:00:00.000Z");
}

// Suggestions: 13 required scenarios.
const conflictSession = sessionFor(conflict);
const conflictSourceBeforeSuggestions = JSON.stringify(conflict);
const conflictSuggestions = generateDuriSuggestions(conflictSession, "2026-07-14T00:00:00.000Z");
assert(conflictSuggestions.some((entry) => entry.suggestion.sourceIssueIds.some((id) => id.startsWith("time-conflict"))), "suggestion 1: conflict time move");
assert(JSON.stringify(conflict) === conflictSourceBeforeSuggestions, "suggestion generation must not mutate source state");
const balanceSource = state({ itineraryByTripId: { trip: [item("b1", "a", "2026-07-18", "08:00"), item("b2", "b", "2026-07-18", "10:00"), item("b3", "c", "2026-07-18", "12:00"), item("b4", "d", "2026-07-18", "14:00")], other: [] } });
assert(generateDuriSuggestions(sessionFor(balanceSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.before?.date !== change.after?.date)), "suggestion 2: move day 1 to day 2");
const routeSource = state({ itineraryByTripId: { trip: [item("r1", "a", "2026-07-18", "09:00"), item("r2", "b", "2026-07-18", "11:00"), item("r3", "c", "2026-07-18", "13:00")], other: [] } });
assert(generateDuriSuggestions(sessionFor(routeSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.type === "reorder-route"), "suggestion 3: route reorder");
const mealSource = state({ itineraryByTripId: { trip: [item("m1", "a", "2026-07-18", "10:00", 60), item("m2", "b", "2026-07-18", "14:00", 60)], other: [] } });
assert(generateDuriSuggestions(sessionFor(mealSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.action === "add")), "suggestion 4: add candidate/meal block");

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
const validPreview = createDuriSuggestionPreview({ envelope: validEnvelope, tripDates: ["2026-07-18", "2026-07-19"], placesById: places, candidates: atomicBase.candidatesByTripId.trip });
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

console.log("Duri verification passed: 18 analysis + 13 suggestion + 10 atomic scenarios");
