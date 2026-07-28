import type { ItineraryItem, Place, TripCandidate, TripRoom } from "../../../domain";
import { previewSuggestion } from "../../../duri/duri-suggestions";
import { findTimeConflictsForDate } from "../../workspace/logic/workspaceDateTime";
import { sortItineraryItemsByDateAndTime } from "../../../utils/schedule";
import { analyzeTripEndCondition } from "../../workspace/logic/tripEndCondition";
import type {
  DuriExpectedImpact,
  DuriSuggestionEnvelope,
  DuriSuggestionPreview,
  ItinerarySnapshotItem,
  ScheduleDiffItem,
} from "../types";

export function createItinerarySnapshot(itinerary: ItineraryItem[]): ItinerarySnapshotItem[] {
  const counters = new Map<string, number>();
  return sortItineraryItemsByDateAndTime(itinerary).map((item) => {
    const order = counters.get(item.date) ?? 0;
    counters.set(item.date, order + 1);
    return { ...item, preferredByUserIds: [...item.preferredByUserIds], order };
  });
}

export function diffItinerarySnapshots(
  before: ItinerarySnapshotItem[],
  after: ItinerarySnapshotItem[],
  placesById: Record<string, Place>,
): ScheduleDiffItem[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();
  return ids.map((itemId) => {
    const previous = beforeById.get(itemId);
    const next = afterById.get(itemId);
    const placeId = next?.placeId ?? previous?.placeId;
    const placeName = placeId ? placesById[placeId]?.name ?? "알 수 없는 장소" : next?.note ?? previous?.note ?? "일정";
    if (!previous && next) return { kind: "added", itemId, placeId, placeName, after: next };
    if (previous && !next) return { kind: "removed", itemId, placeId, placeName, before: previous };
    if (!previous || !next) return { kind: "unchanged", itemId, placeId, placeName, before: previous, after: next };
    const kind = previous.date !== next.date
      ? "moved"
      : previous.startTime !== next.startTime || previous.durationMinutes !== next.durationMinutes
        ? "time-changed"
        : previous.order !== next.order
          ? "reordered"
          : "unchanged";
    return { kind, itemId, placeId, placeName, before: previous, after: next };
  });
}

function countConflictPairs(itinerary: ItineraryItem[], tripDates: string[]) {
  return tripDates.reduce((total, date) => {
    const pairs = new Set<string>();
    for (const conflict of findTimeConflictsForDate(itinerary, date)) {
      for (const other of conflict.conflictingItemIds) pairs.add([conflict.itemId, other].sort().join("::"));
    }
    return total + pairs.size;
  }, 0);
}

function countUnscheduledSharedCandidates(itinerary: ItineraryItem[], candidates: TripCandidate[]) {
  const scheduled = new Set(itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  return candidates.filter((candidate) => !scheduled.has(candidate.placeId) && new Set(candidate.addedByUserIds).size >= 2).length;
}

export function calculateExpectedImpact({
  before,
  after,
  tripDates,
  candidates,
}: {
  before: ItineraryItem[];
  after: ItineraryItem[];
  tripDates: string[];
  candidates: TripCandidate[];
}): DuriExpectedImpact {
  const metrics: DuriExpectedImpact["metrics"] = [];
  const beforeConflicts = countConflictPairs(before, tripDates);
  const afterConflicts = countConflictPairs(after, tripDates);
  if (beforeConflicts !== afterConflicts) metrics.push({ id: "time-conflicts", label: "시간 충돌", before: beforeConflicts, after: afterConflicts, unit: "건" });
  for (const date of tripDates) {
    const beforeCount = before.filter((item) => item.date === date).length;
    const afterCount = after.filter((item) => item.date === date).length;
    if (beforeCount !== afterCount) metrics.push({ id: `items-${date}`, label: `${date} 일정`, before: beforeCount, after: afterCount, unit: "개" });
  }
  const beforeUnscheduled = countUnscheduledSharedCandidates(before, candidates);
  const afterUnscheduled = countUnscheduledSharedCandidates(after, candidates);
  if (beforeUnscheduled !== afterUnscheduled) metrics.push({ id: "shared-candidates", label: "미배치 공동 후보", before: beforeUnscheduled, after: afterUnscheduled, unit: "개" });
  return { metrics };
}

export function createDuriSuggestionPreview({
  envelope,
  tripDates,
  placesById,
  candidates,
  trip,
}: {
  envelope: DuriSuggestionEnvelope;
  tripDates: string[];
  placesById: Record<string, Place>;
  candidates: TripCandidate[];
  trip: TripRoom;
}): DuriSuggestionPreview {
  const simulated = previewSuggestion(envelope.beforeItinerary, envelope.suggestion, {
    tripId: envelope.suggestion.tripId,
    tripDates,
    placesById,
    candidates,
  });
  const before = createItinerarySnapshot(envelope.beforeItinerary);
  if (!simulated.success) {
    return {
      suggestionId: envelope.suggestion.id,
      tripId: envelope.suggestion.tripId,
      baseFingerprint: envelope.baseFingerprint,
      before,
      after: before,
      diff: diffItinerarySnapshots(before, before, placesById),
      affectedDates: [],
      impact: { metrics: [] },
      validation: { valid: false, message: simulated.reason },
    };
  }
  const after = createItinerarySnapshot(simulated.previewItinerary);
  const diff = diffItinerarySnapshots(before, after, placesById);
  const affectedDates = [...new Set(diff.filter((item) => item.kind !== "unchanged").flatMap((item) => [item.before?.date, item.after?.date].filter((date): date is string => Boolean(date))))].sort();
  const endCondition = analyzeTripEndCondition(trip, simulated.previewItinerary);
  const endConditionValid = endCondition.status !== "infeasible" && endCondition.status !== "invalid";
  return {
    suggestionId: envelope.suggestion.id,
    tripId: envelope.suggestion.tripId,
    baseFingerprint: envelope.baseFingerprint,
    before,
    after,
    diff,
    affectedDates,
    impact: calculateExpectedImpact({ before: envelope.beforeItinerary, after: simulated.previewItinerary, tripDates, candidates }),
    validation: endConditionValid ? { valid: true } : { valid: false, message: endCondition.message },
  };
}
