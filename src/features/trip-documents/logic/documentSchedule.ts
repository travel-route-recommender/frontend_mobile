import type { ItineraryItem, ItineraryItemType, TripRoom } from "../../../domain";
import { resolveTripEndConditionAddition } from "../../workspace/logic/tripEndCondition";
import { findOverlappingItem, getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";
import type { TravelDocumentFactKind } from "../types";

export type LockedDocumentScheduleDraft = {
  label: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  itemType: ItineraryItemType;
  placeId?: string;
};

export type LockedDocumentScheduleDraftResult =
  | { ok: true; draft: LockedDocumentScheduleDraft }
  | { ok: false; message: string };

export type LockedDocumentScheduleAdditionFailure =
  | "invalid-trip"
  | "trip-not-editable"
  | "not-member"
  | "invalid-date"
  | "invalid-time"
  | "invalid-item"
  | "invalid-place"
  | "overlap"
  | "end-condition";

export type LockedDocumentScheduleAdditionResult =
  | { ok: true; itemId: string; created: boolean; itinerary: ItineraryItem[] }
  | { ok: false; status: LockedDocumentScheduleAdditionFailure };

function scheduleItemType(kind: TravelDocumentFactKind, hasPlace: boolean): ItineraryItemType {
  if (kind === "train" || kind === "bus" || kind === "rental-car-return") return "transport";
  return hasPlace ? "place" : "reservation";
}

/**
 * 임의 체류시간을 만들지 않는다. 일정 자동 추가에는 사용자가 확인한 시작·종료
 * 시각이 모두 필요하며, 분 단위 값을 그대로 보존한다.
 */
export function buildLockedDocumentScheduleDraft(input: {
  kind: TravelDocumentFactKind;
  label: string;
  date: string;
  startTime?: string;
  endTime?: string;
  placeId?: string;
}): LockedDocumentScheduleDraftResult {
  const label = input.label.trim().slice(0, 80);
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";
  if (!label) return { ok: false, message: "일정 이름을 입력해 주세요." };
  if (!startTime || !endTime) {
    return { ok: false, message: "잠금 일정으로 추가하려면 시작 시각과 종료 시각을 모두 확인해 주세요. 임의의 기본 체류시간은 사용하지 않아요." };
  }
  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 24 * 60) {
    return { ok: false, message: "같은 날짜 안에서 종료 시각이 시작 시각보다 뒤인지 확인해 주세요." };
  }
  return {
    ok: true,
    draft: {
      label,
      date: input.date,
      startTime,
      endTime,
      durationMinutes: end - start,
      itemType: scheduleItemType(input.kind, Boolean(input.placeId)),
      ...(input.placeId ? { placeId: input.placeId } : {}),
    },
  };
}

/** 같은 문서 사실을 다시 확정해도 일정 블록이 중복 생성되지 않게 한다. */
export function findEquivalentLockedDocumentSchedule(
  itinerary: readonly ItineraryItem[],
  draft: Pick<LockedDocumentScheduleDraft, "label" | "date" | "startTime" | "durationMinutes" | "itemType" | "placeId">,
) {
  return itinerary.find((item) => item.date === draft.date
    && item.startTime === draft.startTime
    && item.durationMinutes === draft.durationMinutes
    && item.itemType === draft.itemType
    && (item.placeId ?? "") === (draft.placeId ?? "")
    && (item.note?.trim() ?? "") === draft.label.trim());
}

/** Store/UI와 분리한 문서 일정 commit preflight. 실패 시 원본 배열을 변경하지 않는다. */
export function prepareLockedDocumentScheduleAddition(input: {
  trip?: TripRoom;
  currentUserId: string;
  itinerary: readonly ItineraryItem[];
  placesById: Readonly<Record<string, unknown>>;
  draft: LockedDocumentScheduleDraft;
  createItemId(): string;
}): LockedDocumentScheduleAdditionResult {
  const { trip, currentUserId, draft } = input;
  if (!trip) return { ok: false, status: "invalid-trip" };
  if (trip.status === "completed") return { ok: false, status: "trip-not-editable" };
  if (!trip.members.some((member) => member.userId === currentUserId)) return { ok: false, status: "not-member" };
  if (!getTripDates(trip.startDate, trip.endDate).includes(draft.date)) return { ok: false, status: "invalid-date" };
  if (!draft.label.trim() || !["place", "transport", "reservation"].includes(draft.itemType)) return { ok: false, status: "invalid-item" };
  if ((draft.placeId && !input.placesById[draft.placeId]) || (draft.itemType === "place" && !draft.placeId)) {
    return { ok: false, status: "invalid-place" };
  }
  const current = input.itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }));
  const equivalent = findEquivalentLockedDocumentSchedule(current, draft);
  if (equivalent) {
    return {
      ok: true,
      itemId: equivalent.id,
      created: false,
      itinerary: current.map((item) => item.id === equivalent.id ? {
        ...item,
        lockedForDuri: true,
        preferredByUserIds: [...new Set([...item.preferredByUserIds, currentUserId])],
      } : item),
    };
  }
  const nextItem: ItineraryItem = {
    id: input.createItemId(),
    tripId: trip.id,
    ...(draft.placeId ? { placeId: draft.placeId } : {}),
    date: draft.date,
    startTime: draft.startTime,
    durationMinutes: draft.durationMinutes,
    itemType: draft.itemType,
    preferredByUserIds: [currentUserId],
    note: draft.label.trim().slice(0, 80),
    lockedForDuri: true,
  };
  if (!isValidScheduleRange(nextItem)) return { ok: false, status: "invalid-time" };
  if (findOverlappingItem(current, nextItem)) return { ok: false, status: "overlap" };
  const endResolution = resolveTripEndConditionAddition(trip, sortItineraryItemsByDateAndTime([...current, nextItem]), draft.date);
  if (endResolution.status === "rejected") return { ok: false, status: "end-condition" };
  return { ok: true, itemId: nextItem.id, created: true, itinerary: endResolution.itinerary };
}
