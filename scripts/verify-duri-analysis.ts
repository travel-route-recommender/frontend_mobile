import type { ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../src/domain";
import { analyzeDensity, isMealPlace } from "../src/duri/duri-analysis";
import type { ConfirmedScheduleConstraint, DuriAnalysisInput, PlaceCongestionEvidence, RouteLegEstimate } from "../src/duri/duri-analysis";
import { buildItineraryFingerprint, generateSuggestionId } from "../src/duri/duri-suggestions";
import type { DuriSuggestion, ScheduleChangePreview } from "../src/duri/duri-suggestions";
import { DURI_SUGGESTION_VERSION } from "../src/features/duri/constants";
import { analyzeCandidateUsage, analyzeDayBalance, analyzeOvernightRecovery, analyzeTimeConflicts, calculateAnalysisCoverage } from "../src/features/duri/logic/analysisContext";
import { buildDuriAnalysisInputWithDocuments, isDuriAnalysisCompletionCurrent } from "../src/features/duri/logic/analysisInput";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability, isSuggestionStale } from "../src/features/duri/logic/analysisSnapshot";
import { analyzePlaceCongestionConstraints, analyzePlaceOperatingConstraints, analyzePlacePracticalConstraints, analyzeRecommendedDurations, hasEvaluableOperatingFactForDate, parseExplicitParkingAvailability, parseOperatingWindows, parseRecommendedDurationMinutes } from "../src/features/duri/logic/placeConstraintAnalysis";
import { analyzePreferenceConstraints } from "../src/features/duri/logic/preferenceConstraintAnalysis";
import { buildScheduledRouteLegs, collectCarRouteEvidence, isRouteOptimizationFixedItem } from "../src/features/duri/logic/routeEvidence";
import { analyzeConfirmedScheduleConstraints, analyzeDocumentReferences, analyzeDuplicateVisits, analyzeRouteCostEvidence, analyzeRouteOptimization, analyzeRouteTimeConstraints } from "../src/features/duri/logic/scheduleConstraintAnalysis";
import { generateDuriSuggestions } from "../src/features/duri/logic/suggestionGeneration";
import { getDuriItemProtection } from "../src/features/duri/logic/suggestionProtection";
import { createDuriSuggestionPreview, diffItinerarySnapshots } from "../src/features/duri/logic/suggestionPreview";
import { buildDuriAnalysisInputFromState } from "../src/features/duri/selectors/duriSelectors";
import { enrichDuriAnalysisInput, normalizeTourCongestionDays } from "../src/features/duri/services/duriEvidenceService";
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

function inputFor(source: DuriInputSource) {
  const input = buildDuriAnalysisInputFromState(source, "trip");
  assert(input, "trip input");
  return input;
}

// Analysis: 25 required scenarios.
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

const detailedPreference = (userId: string, mobilityScore: 0 | 1 | 2, mobilityModes: string[]) => ({
  ...preference(userId),
  answers: { ...preference(userId).answers, mobility: mobilityScore },
  detailedSignals: {
    surveyVersion: 1,
    algorithmVersion: 1,
    staminaScore: 0,
    densityScore: 0,
    scheduleStyle: "relaxed" as const,
    preferredDailyScheduledMinutes: 30,
    preferredAverageStayMinutes: 60,
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
assert(preferenceIssues.some((issue) => issue.id === "preference-coordination-mobility" && issue.constraintType === "soft"), "analysis 20: opposite direct mobility answers require soft coordination");
assert(preferenceIssues.some((issue) => issue.id === "preference-coordination-mobility"
  && issue.summary.includes("가중치")
  && issue.evidence.some((entry) => entry.label === "계산 가정" && entry.value.includes("동일 가중치"))),
"analysis 20a: minimax coordination discloses equal-member and equal-step-distance assumptions");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-mobility-mode-owner-car") && issue.confidence === "high"), "analysis 21: explicit selected transport modes are compared with the room fact");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-mobility-mode-owner-car")
  && issue.evidence.some((entry) => entry.value.includes("지하철") && !entry.value.includes("subway"))),
"analysis 21a: internal mobility IDs are translated in user-facing evidence");
assert(preferenceIssues.some((issue) => issue.id.startsWith("preference-daily-load-owner-") && issue.evidence.some((entry) => entry.value.includes("조회 실패 이동구간 제외"))), "analysis 22: direct preferred daily load uses only scheduled and known route minutes");
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
assert(rawGapDensity.issues[0]?.evidence.some((entry) => entry.label.includes("이동 제외 휴식") && entry.value.includes("45분 이상 1회")), "analysis 26: an unmeasured long gap remains a possible break");
assert(routeAdjustedDensity.issues[0]?.evidence.some((entry) => entry.label.includes("이동 제외 휴식") && entry.value.includes("45분 이상 0회") && entry.value.includes("실제 경로 1구간")), "analysis 27: a gap fully consumed by measured travel is not counted as rest");
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
assert(generateDuriSuggestions(sessionFor(balanceSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.before?.date !== change.after?.date)), "suggestion 2: move day 1 to day 2");
const routeSource = state({ itineraryByTripId: { trip: [item("r1", "a", "2026-07-18", "09:00"), item("r2", "b", "2026-07-18", "11:00"), item("r3", "c", "2026-07-18", "13:00")], other: [] } });
assert(!generateDuriSuggestions(sessionFor(routeSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.type === "reorder-route"), "suggestion 3: address-area heuristic never creates an applicable route reorder");
const mealSource = state({ itineraryByTripId: { trip: [item("m1", "a", "2026-07-18", "10:00", 60), item("m2", "b", "2026-07-18", "14:00", 60)], other: [] } });
assert(generateDuriSuggestions(sessionFor(mealSource), "2026-07-14T00:00:00.000Z").some((entry) => entry.suggestion.changes.some((change) => change.action === "add")), "suggestion 4: add candidate/meal block");
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
  assert(optimizationIssue?.constraintType === "soft" && optimizationIssue.suggestionSupported === false, "evidence 21: route optimization remains a read-only soft suggestion");
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
  console.log("Duri verification passed: 29 analysis + 20 suggestion + 10 atomic + 19 end-condition + evidence/OCR/congestion scenarios");
}).catch((error) => {
  console.error(error);
  throw error;
});
