import type { ItineraryItem } from "../../../domain";
import {
  applySuggestionChanges,
  buildItineraryFingerprint,
  generateDuriSuggestions as generateWebDuriSuggestions,
  generateSuggestionId,
} from "../../../duri/duri-suggestions";
import type { DuriSuggestion, ScheduleChangeState } from "../../../duri/duri-suggestions";
import { findNextAvailableSlot, getTripDates, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";
import { DURI_SUGGESTION_VERSION } from "../constants";
import type { DuriAnalysisSession, DuriReportIssue, DuriSuggestionEnvelope } from "../types";
import { analyzeTripEndCondition, buildTripEndConditionAdjustment } from "../../workspace/logic/tripEndCondition";

function itemState(item: ItineraryItem): ScheduleChangeState {
  return {
    date: item.date,
    startTime: item.startTime,
    durationMinutes: item.durationMinutes,
    placeId: item.placeId,
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    note: item.note,
  };
}

function finalizeSuggestion(session: DuriAnalysisSession, draft: Omit<DuriSuggestion, "id" | "itineraryFingerprint" | "canApply">): DuriSuggestion | undefined {
  const itineraryFingerprint = buildItineraryFingerprint(session.snapshot.itinerary);
  const base = { ...draft, itineraryFingerprint, canApply: draft.changes.length > 0 };
  const suggestion = { ...base, id: generateSuggestionId(base) };
  const validation = applySuggestionChanges(session.snapshot.itinerary, suggestion, {
    tripId: session.tripId,
    tripDates: getTripDates(session.snapshot.trip.startDate, session.snapshot.trip.endDate),
    placesById: session.snapshot.placesById,
    candidates: session.snapshot.candidates,
  });
  return validation.success ? suggestion : undefined;
}

function buildConflictSuggestion(session: DuriAnalysisSession, issue: DuriReportIssue) {
  if (!issue.date || issue.affectedItemIds.length < 2) return undefined;
  const pair = issue.affectedItemIds
    .map((id) => session.snapshot.itinerary.find((item) => item.id === id))
    .filter((item): item is ItineraryItem => Boolean(item))
    .sort((left, right) => timeStringToMinutes(right.startTime) - timeStringToMinutes(left.startTime) || right.id.localeCompare(left.id));
  const target = pair[0];
  if (!target) return undefined;
  const pairEnd = Math.max(...pair.map((item) => timeStringToMinutes(item.startTime) + item.durationMinutes));
  const startTime = findNextAvailableSlot({
    items: session.snapshot.itinerary,
    date: issue.date,
    durationMinutes: target.durationMinutes,
    fromMinutes: pairEnd,
    excludeItemId: target.id,
  });
  if (!startTime || startTime === target.startTime) return undefined;
  const placeName = target.placeId ? session.snapshot.placesById[target.placeId]?.name : undefined;
  return finalizeSuggestion(session, {
    tripId: session.tripId,
    sourceIssueIds: [issue.id],
    type: "move-item",
    priority: "high",
    title: `${placeName ?? "겹치는 일정"} 시간을 옮겨볼까요?`,
    summary: `${issue.date} ${target.startTime} 일정을 충돌 없는 ${startTime}로 옮겨요.`,
    reason: "기존 워크스페이스의 시간 충돌 규칙으로 확인한 빈 시간이에요.",
    affectedItemIds: [target.id],
    affectedPlaceIds: target.placeId ? [target.placeId] : [],
    changes: [{ itemId: target.id, placeId: target.placeId, action: "move", before: itemState(target), after: { ...itemState(target), startTime } }],
  });
}

function buildDayBalanceSuggestion(session: DuriAnalysisSession, issue: DuriReportIssue) {
  if (!issue.date || session.dayMetrics.length < 2) return undefined;
  const busiest = [...session.dayMetrics].sort((left, right) => right.itemCount - left.itemCount || left.date.localeCompare(right.date))[0];
  const lightest = [...session.dayMetrics].sort((left, right) => left.itemCount - right.itemCount || left.date.localeCompare(right.date))[0];
  if (!busiest || !lightest || busiest.date === lightest.date) return undefined;
  const target = sortItineraryItemsByDateAndTime(session.snapshot.itinerary.filter((item) => item.date === busiest.date)).at(-1);
  if (!target) return undefined;
  const startTime = findNextAvailableSlot({ items: session.snapshot.itinerary, date: lightest.date, durationMinutes: target.durationMinutes });
  if (!startTime) return undefined;
  const placeName = target.placeId ? session.snapshot.placesById[target.placeId]?.name : undefined;
  return finalizeSuggestion(session, {
    tripId: session.tripId,
    sourceIssueIds: [issue.id],
    type: "move-item",
    priority: "medium",
    title: `${placeName ?? "마지막 일정"}을 ${lightest.date}로 나눠볼까요?`,
    summary: `${busiest.date}의 일정 1개를 ${lightest.date} ${startTime} 빈 시간으로 옮겨 날짜별 개수 차이를 줄여요.`,
    reason: "날짜별 일정 수와 유효한 일정 시간을 비교했어요. 첫날·마지막 날의 이동 조건은 가정하지 않았어요.",
    affectedItemIds: [target.id],
    affectedPlaceIds: target.placeId ? [target.placeId] : [],
    changes: [{ itemId: target.id, placeId: target.placeId, action: "move", before: itemState(target), after: { ...itemState(target), date: lightest.date, startTime } }],
  });
}

function buildEndConditionSuggestion(session: DuriAnalysisSession, issue: DuriReportIssue) {
  const condition = session.snapshot.trip.endCondition;
  if (!condition || !session.snapshot.trip.endDate) return undefined;
  const adjustment = buildTripEndConditionAdjustment(session.snapshot.trip, session.snapshot.itinerary);
  if (adjustment.status === "adjusted") {
    const changes = adjustment.movedItemIds.flatMap((itemId) => {
      const before = session.snapshot.itinerary.find((item) => item.id === itemId);
      const after = adjustment.itinerary.find((item) => item.id === itemId);
      return before && after ? [{
        itemId,
        placeId: before.placeId,
        action: "move" as const,
        before: itemState(before),
        after: itemState(after),
      }] : [];
    });
    return finalizeSuggestion(session, {
      tripId: session.tripId,
      sourceIssueIds: [issue.id],
      type: "move-item",
      priority: "high",
      title: "종료 조건에 맞게 마지막 날 일정을 앞당길까요?",
      summary: "마지막 날 전체 일정을 같은 15분 단위만큼 앞당겨 순서·체류시간·기존 이동 및 대기 간격을 유지해요.",
      reason: condition.location.name + "에 " + condition.deadline + "까지 도착하도록 입력한 이동 "
        + condition.travelMinutes + "분과 준비 " + condition.serviceBufferMinutes + "분을 확보해요.",
      affectedItemIds: adjustment.movedItemIds,
      affectedPlaceIds: adjustment.movedItemIds.flatMap((itemId) => {
        const placeId = session.snapshot.itinerary.find((item) => item.id === itemId)?.placeId;
        return placeId ? [placeId] : [];
      }),
      changes,
    });
  }

  const lastDayItems = sortItineraryItemsByDateAndTime(
    session.snapshot.itinerary.filter((item) => item.date === session.snapshot.trip.endDate),
  ).filter((item) => item.itemType === "place" && Boolean(item.placeId));
  const remaining = [...session.snapshot.itinerary];
  const removed: ItineraryItem[] = [];
  while (lastDayItems.length) {
    const target = lastDayItems.pop();
    if (!target) break;
    removed.push(target);
    const index = remaining.findIndex((item) => item.id === target.id);
    if (index >= 0) remaining.splice(index, 1);
    const assessment = analyzeTripEndCondition(session.snapshot.trip, remaining);
    if (assessment.status !== "feasible") continue;
    return finalizeSuggestion(session, {
      tripId: session.tripId,
      sourceIssueIds: [issue.id],
      type: "remove-overload-item",
      priority: "high",
      title: "종료 조건을 위해 마지막 일정을 미배치로 돌릴까요?",
      summary: "앞당길 공간이 부족해 가장 늦은 일정부터 제외하는 안이에요. 후보 장소는 삭제하지 않아요.",
      reason: condition.location.name + " 도착·반납 시간을 지키려면 현재 체류시간으로는 마지막 날에 모두 배치할 수 없어요.",
      affectedItemIds: removed.map((item) => item.id),
      affectedPlaceIds: removed.flatMap((item) => item.placeId ? [item.placeId] : []),
      changes: removed.map((item) => ({
        itemId: item.id,
        placeId: item.placeId,
        action: "remove" as const,
        before: itemState(item),
      })),
    });
  }
  return undefined;
}

export function generateDuriSuggestions(session: DuriAnalysisSession, createdAt: string): DuriSuggestionEnvelope[] {
  const webSuggestions = generateWebDuriSuggestions({ ...session.snapshot, analysis: session.result });
  const supplemental = session.issues.flatMap((issue) => {
    if (issue.category === "end-condition" && issue.severity === "high") return buildEndConditionSuggestion(session, issue) ?? [];
    if (issue.category === "time-conflict") return buildConflictSuggestion(session, issue) ?? [];
    if (issue.category === "day-balance") return buildDayBalanceSuggestion(session, issue) ?? [];
    return [];
  });
  const seen = new Set<string>();
  const suggestions = [...supplemental, ...webSuggestions].filter((suggestion) => {
    const key = JSON.stringify(suggestion.changes);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  return suggestions.sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.id.localeCompare(right.id)).map((suggestion) => ({
    suggestion,
    baseFingerprint: session.inputFingerprint,
    algorithmVersion: DURI_SUGGESTION_VERSION,
    createdAt,
    beforeItinerary: session.snapshot.itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] })),
  }));
}
