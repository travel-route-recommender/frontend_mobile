import type { ItineraryItem } from "../../domain";
import { MIN_DURATION_MINUTES, SLOT_MINUTES } from "../../data/workspaceSchedule";
import {
  findOverlappingItem,
  isValidGridScheduleRange,
  isValidScheduleRange,
  sortItineraryItemsByDateAndTime,
  timeStringToMinutes,
} from "../../utils/schedule";
import { buildItineraryFingerprint, generateSuggestionId } from "./fingerprint";
import type {
  DuriSuggestion,
  ScheduleChangePreview,
  ScheduleChangeState,
  SuggestionChangeContext,
  SuggestionChangeResult,
  SuggestionPreviewResult,
} from "./types";

function stateMatches(item: ItineraryItem, expected?: ScheduleChangeState) {
  if (!expected) return true;
  return (
    (expected.date === undefined || expected.date === item.date) &&
    (expected.startTime === undefined || expected.startTime === item.startTime) &&
    (expected.durationMinutes === undefined || expected.durationMinutes === item.durationMinutes) &&
    (expected.placeId === undefined || expected.placeId === item.placeId) &&
    (expected.itemType === undefined || expected.itemType === item.itemType) &&
    (!Object.prototype.hasOwnProperty.call(expected, "preferredByUserIds")
      || JSON.stringify([...(expected.preferredByUserIds ?? [])].sort()) === JSON.stringify([...item.preferredByUserIds].sort())) &&
    (!Object.prototype.hasOwnProperty.call(expected, "note") || expected.note === item.note) &&
    (!Object.prototype.hasOwnProperty.call(expected, "lockedForDuri") || Boolean(expected.lockedForDuri) === Boolean(item.lockedForDuri))
  );
}

function validateFinalItinerary(
  itinerary: ItineraryItem[],
  context: SuggestionChangeContext,
): "conflict" | "invalid" | undefined {
  const ids = new Set<string>();
  for (const item of itinerary) {
    if (item.tripId !== context.tripId || ids.has(item.id)) return "invalid";
    ids.add(item.id);
    if (!context.tripDates.includes(item.date) || !isValidScheduleRange(item)) return "invalid";
    if (item.placeId) {
      if (!context.placesById[item.placeId]) return "invalid";
    }
    if (findOverlappingItem(itinerary, item, item.id)) return "conflict";
  }
  return undefined;
}

function failed(status: "conflict" | "invalid" | "not-applicable", reason: string): SuggestionChangeResult {
  return { success: false, status, changedItemIds: [], reason };
}

export function applySuggestionChanges(
  itinerary: ItineraryItem[],
  suggestion: DuriSuggestion,
  context: SuggestionChangeContext,
): SuggestionChangeResult {
  if (!suggestion.canApply || !suggestion.changes.length || suggestion.tripId !== context.tripId) {
    return failed("not-applicable", suggestion.unavailableReason ?? "현재 상태에는 적용할 수 없는 제안이에요.");
  }

  const candidatePlaceIds = new Set(context.candidates.map((candidate) => candidate.placeId));
  let next = itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }));

  for (const change of suggestion.changes) {
    if (change.action === "add") {
      const after = change.after;
      if (!change.itemId || !after?.date || !after.startTime || !after.durationMinutes || !after.itemType) {
        return failed("invalid", "추가할 일정 정보가 올바르지 않아요.");
      }
      if (!isValidGridScheduleRange({ date: after.date, startTime: after.startTime, durationMinutes: after.durationMinutes })) {
        return failed("invalid", "두리가 추가하는 일정은 15분 단위여야 해요.");
      }
      if (after.lockedForDuri) return failed("invalid", "두리는 새 일정을 사용자 잠금 상태로 만들 수 없어요.");
      if (next.some((item) => item.id === change.itemId)) return failed("invalid", "같은 일정 ID가 이미 존재해요.");
      if (
        after.placeId &&
        ["insert-meal", "add-preference-place"].includes(suggestion.type) &&
        !candidatePlaceIds.has(after.placeId)
      ) {
        return failed("invalid", "제안에 필요한 후보 장소를 찾을 수 없어요.");
      }
      next.push({
        id: change.itemId,
        tripId: context.tripId,
        placeId: after.placeId,
        date: after.date,
        startTime: after.startTime,
        durationMinutes: after.durationMinutes,
        itemType: after.itemType,
        preferredByUserIds: [...(after.preferredByUserIds ?? [])],
        note: after.note,
        ...(after.lockedForDuri ? { lockedForDuri: true } : {}),
      });
      continue;
    }

    if (!change.itemId) return failed("invalid", "변경할 일정 ID가 없어요.");
    const index = next.findIndex((item) => item.id === change.itemId);
    if (index < 0 || !stateMatches(next[index], change.before)) return failed("invalid", "변경 대상 일정이 없거나 내용이 달라졌어요.");
    if (next[index].lockedForDuri) return failed("not-applicable", "사용자가 두리 변경 잠금으로 보호한 일정은 변경할 수 없어요.");
    if (change.action === "remove") {
      next = next.filter((item) => item.id !== change.itemId);
      continue;
    }
    const after = change.after;
    if (!after) return failed("invalid", "변경 후 일정 정보가 없어요.");
    if (
      change.action === "replace" &&
      after.placeId &&
      !candidatePlaceIds.has(after.placeId)
    ) {
      return failed("invalid", "대체할 후보 장소를 찾을 수 없어요.");
    }
    if (change.action === "move") {
      if (!after.date || !after.startTime) return failed("invalid", "이동할 날짜와 시간이 없어요.");
      const movedStart = timeStringToMinutes(after.startTime);
      if (!Number.isFinite(movedStart) || movedStart % SLOT_MINUTES !== 0) return failed("invalid", "두리가 이동하는 시작 시각은 15분 단위여야 해요.");
      next[index] = {
        ...next[index],
        ...(after.date !== undefined ? { date: after.date } : {}),
        ...(after.startTime !== undefined ? { startTime: after.startTime } : {}),
      };
    } else if (change.action === "resize") {
      if (!after.durationMinutes) return failed("invalid", "변경할 체류시간이 없어요.");
      if (!Number.isInteger(after.durationMinutes) || after.durationMinutes < MIN_DURATION_MINUTES || after.durationMinutes % SLOT_MINUTES !== 0) return failed("invalid", "두리가 바꾸는 체류시간은 15분 단위여야 해요.");
      next[index] = {
        ...next[index],
        ...(after.durationMinutes !== undefined ? { durationMinutes: after.durationMinutes } : {}),
      };
    } else if (change.action === "replace") {
      if (!after.placeId) return failed("invalid", "대체할 장소 정보가 없어요.");
      next[index] = {
        ...next[index],
        placeId: after.placeId,
        ...(after.preferredByUserIds !== undefined
          ? { preferredByUserIds: [...after.preferredByUserIds] }
          : {}),
      };
    }
  }

  const failureStatus = validateFinalItinerary(next, context);
  if (failureStatus) {
    return failed(
      failureStatus,
      failureStatus === "conflict" ? "변경 후 일정이 다른 일정과 겹쳐요." : "변경 후 일정 정보가 올바르지 않아요.",
    );
  }
  const changedItemIds = [...new Set(suggestion.changes.flatMap((change) => change.itemId ? [change.itemId] : []))];
  const affectedDate = suggestion.changes.find((change) => change.after?.date || change.before?.date)?.after?.date
    ?? suggestion.changes.find((change) => change.before?.date)?.before?.date;
  return { success: true, itinerary: sortItineraryItemsByDateAndTime(next), changedItemIds, affectedDate };
}

export function previewSuggestion(
  itinerary: ItineraryItem[],
  suggestion: DuriSuggestion,
  context: SuggestionChangeContext,
): SuggestionPreviewResult {
  // canApply=false는 자동 적용 금지이지 미리보기 금지가 아니다. 이동·운영시간 같은
  // Hard 근거가 덜 모인 초안도 동일한 구조 validation을 거쳐 사용자가 검토할 수 있다.
  const result = applySuggestionChanges(itinerary, suggestion.canApply ? suggestion : {
    ...suggestion,
    canApply: true,
  }, context);
  if (result.success) return { success: true, previewItinerary: result.itinerary, changedItemIds: result.changedItemIds, affectedDate: result.affectedDate };
  return { success: false, reason: result.reason };
}

export function createInverseSuggestion(
  suggestion: DuriSuggestion,
  beforeItinerary: ItineraryItem[],
  afterItinerary: ItineraryItem[],
): DuriSuggestion {
  const beforeById = new Map(beforeItinerary.map((item) => [item.id, item]));
  const afterById = new Map(afterItinerary.map((item) => [item.id, item]));
  const toState = (item: ItineraryItem): ScheduleChangeState => ({
    date: item.date,
    startTime: item.startTime,
    durationMinutes: item.durationMinutes,
    placeId: item.placeId,
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    note: item.note,
    lockedForDuri: Boolean(item.lockedForDuri),
  });
  const changes: ScheduleChangePreview[] = [];
  for (const change of [...suggestion.changes].reverse()) {
    if (!change.itemId) continue;
    const before = beforeById.get(change.itemId);
    const after = afterById.get(change.itemId);
    if (change.action === "add" && after) {
      changes.push({ itemId: after.id, placeId: after.placeId, action: "remove", before: toState(after) });
    } else if (change.action === "remove" && before) {
      changes.push({ itemId: before.id, placeId: before.placeId, action: "add", after: toState(before) });
    } else if (before && after) {
      changes.push({ itemId: before.id, placeId: before.placeId, action: change.action, before: toState(after), after: toState(before) });
    }
  }
  const itineraryFingerprint = buildItineraryFingerprint(afterItinerary);
  const base = {
    tripId: suggestion.tripId,
    sourceIssueIds: suggestion.sourceIssueIds,
    type: suggestion.type,
    priority: suggestion.priority,
    title: `${suggestion.title} 실행 취소`,
    summary: "마지막 제안 적용 전 일정으로 되돌려요.",
    reason: "현재 화면에서 마지막으로 적용한 제안만 되돌립니다.",
    affectedItemIds: changes.flatMap((change) => change.itemId ? [change.itemId] : []),
    affectedPlaceIds: [...new Set(changes.flatMap((change) => {
      const placeId = change.after?.placeId ?? change.before?.placeId;
      return placeId ? [placeId] : [];
    }))],
    changes,
    canApply: changes.length > 0,
    itineraryFingerprint,
  } satisfies Omit<DuriSuggestion, "id">;
  return { ...base, id: generateSuggestionId(base) };
}
