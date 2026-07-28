import { SLOT_MINUTES, WORKSPACE_START_MINUTES } from "../../../data/workspaceSchedule";
import type { ItineraryItem, TripRoom } from "../../../domain";
import { minutesToTimeString, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";

export type TripEndConditionFeasibility = {
  status: "not-configured" | "insufficient-data" | "feasible" | "infeasible" | "invalid";
  endDate?: string;
  deadlineMinutes?: number;
  cutoffMinutes?: number;
  latestEndMinutes?: number;
  overflowMinutes?: number;
  affectedItemIds: string[];
  message: string;
};

function getCutoffMinutes(trip: TripRoom) {
  if (!trip.endCondition) return undefined;
  const deadlineMinutes = timeStringToMinutes(trip.endCondition.deadline);
  if (
    !trip.endCondition.location.name.trim()
    || !Number.isFinite(deadlineMinutes)
    || deadlineMinutes % SLOT_MINUTES !== 0
    || !Number.isInteger(trip.endCondition.travelMinutes)
    || trip.endCondition.travelMinutes < 0
    || trip.endCondition.travelMinutes > 1440
    || !Number.isInteger(trip.endCondition.serviceBufferMinutes)
    || trip.endCondition.serviceBufferMinutes < 0
    || trip.endCondition.serviceBufferMinutes > 720
  ) return undefined;
  const rawCutoff = deadlineMinutes - trip.endCondition.travelMinutes - trip.endCondition.serviceBufferMinutes;
  return {
    deadlineMinutes,
    cutoffMinutes: Math.floor(rawCutoff / SLOT_MINUTES) * SLOT_MINUTES,
  };
}

export type TripEndConditionTimelineEntry = {
  date: string;
  locationName: string;
  deadline: string;
  deadlineMinutes: number;
  cutoffMinutes: number;
  travelMinutes: number;
  serviceBufferMinutes: number;
  note?: string;
};

export function buildTripEndConditionTimelineEntry(
  trip: TripRoom,
): TripEndConditionTimelineEntry | undefined {
  if (!trip.endCondition || !trip.endDate || trip.dateUndecided) return undefined;
  const cutoff = getCutoffMinutes(trip);
  if (!cutoff || cutoff.deadlineMinutes < 0 || cutoff.deadlineMinutes >= 24 * 60) return undefined;
  return {
    date: trip.endDate,
    locationName: trip.endCondition.location.name.trim(),
    deadline: trip.endCondition.deadline,
    deadlineMinutes: cutoff.deadlineMinutes,
    cutoffMinutes: cutoff.cutoffMinutes,
    travelMinutes: trip.endCondition.travelMinutes,
    serviceBufferMinutes: trip.endCondition.serviceBufferMinutes,
    ...(trip.endCondition.note?.trim() ? { note: trip.endCondition.note.trim() } : {}),
  };
}

export function analyzeTripEndCondition(trip: TripRoom, itinerary: readonly ItineraryItem[]): TripEndConditionFeasibility {
  if (!trip.endCondition) return { status: "not-configured", affectedItemIds: [], message: "등록된 여행 종료 조건이 없어요." };
  if (!trip.endDate || trip.dateUndecided) return { status: "invalid", affectedItemIds: [], message: "여행 날짜를 확정해야 종료 조건을 검증할 수 있어요." };
  const cutoff = getCutoffMinutes(trip);
  if (!cutoff || cutoff.deadlineMinutes < 0 || cutoff.deadlineMinutes >= 24 * 60 || !Number.isFinite(cutoff.cutoffMinutes)) {
    return { status: "invalid", endDate: trip.endDate, affectedItemIds: [], message: "여행 종료 시각을 확인해 주세요." };
  }
  const items = sortItineraryItemsByDateAndTime(itinerary.filter((item) => item.date === trip.endDate));
  if (!items.length) {
    return {
      status: "insufficient-data",
      endDate: trip.endDate,
      ...cutoff,
      affectedItemIds: [],
      message: "마지막 날 일정이 없어 종료 지점 이동 가능성을 아직 계산하지 않았어요.",
    };
  }
  const latestEndMinutes = Math.max(...items.map((item) => timeStringToMinutes(item.startTime) + item.durationMinutes));
  if (!Number.isFinite(latestEndMinutes)) {
    return { status: "invalid", endDate: trip.endDate, ...cutoff, affectedItemIds: items.map((item) => item.id), message: "마지막 날 일정 시간을 확인해 주세요." };
  }
  const overflowMinutes = Math.max(latestEndMinutes - cutoff.cutoffMinutes, 0);
  const affectedItemIds = items
    .filter((item) => timeStringToMinutes(item.startTime) + item.durationMinutes > cutoff.cutoffMinutes)
    .map((item) => item.id);
  if (overflowMinutes > 0 || cutoff.cutoffMinutes < WORKSPACE_START_MINUTES) {
    return {
      status: "infeasible",
      endDate: trip.endDate,
      ...cutoff,
      latestEndMinutes,
      overflowMinutes: Math.max(overflowMinutes, WORKSPACE_START_MINUTES - cutoff.cutoffMinutes),
      affectedItemIds,
      message: cutoff.cutoffMinutes < WORKSPACE_START_MINUTES
        ? "입력한 종료 시각·이동·준비시간을 함께 고려하면 일정표 시작 시각인 08:00 전부터 이동해야 해요."
        : `종료 지점 이동과 준비시간을 빼면 마지막 일정은 ${minutesToTimeString(cutoff.cutoffMinutes)}까지 끝나야 해요.`,
    };
  }
  return {
    status: "feasible",
    endDate: trip.endDate,
    ...cutoff,
    latestEndMinutes,
    overflowMinutes: 0,
    affectedItemIds: [],
    message: `현재 마지막 일정은 ${minutesToTimeString(latestEndMinutes)}에 끝나 종료 조건을 지킬 수 있어요.`,
  };
}

export type TripEndConditionAdjustment =
  | { status: "not-needed"; itinerary: ItineraryItem[]; movedItemIds: [] }
  | { status: "adjusted"; itinerary: ItineraryItem[]; movedItemIds: string[] }
  | { status: "cannot-fit"; itinerary: ItineraryItem[]; movedItemIds: []; message: string };

/**
 * 마지막 날 일정의 순서, 체류시간, 일정 사이 간격을 유지한 채 전체를 같은 15분 단위만큼 앞당긴다.
 * 삭제나 체류시간 축소는 하지 않으며 08:00 이전이 필요하면 적용 불가로 반환한다.
 */
export function buildTripEndConditionAdjustment(trip: TripRoom, itinerary: readonly ItineraryItem[]): TripEndConditionAdjustment {
  const analysis = analyzeTripEndCondition(trip, itinerary);
  const original = itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }));
  if (analysis.status !== "infeasible" || !trip.endDate || analysis.cutoffMinutes === undefined) {
    return { status: "not-needed", itinerary: original, movedItemIds: [] };
  }
  const lastDayItems = sortItineraryItemsByDateAndTime(original.filter((item) => item.date === trip.endDate));
  const overflowMinutes = (analysis.latestEndMinutes ?? analysis.cutoffMinutes) - analysis.cutoffMinutes;
  const shiftMinutes = Math.ceil(Math.max(overflowMinutes, 0) / SLOT_MINUTES) * SLOT_MINUTES;
  if (!shiftMinutes) {
    return { status: "cannot-fit", itinerary: original, movedItemIds: [], message: analysis.message };
  }
  const startsById = new Map<string, string>();
  for (const item of lastDayItems) {
    const nextStart = timeStringToMinutes(item.startTime) - shiftMinutes;
    if (!Number.isFinite(nextStart) || nextStart < WORKSPACE_START_MINUTES) {
      return {
        status: "cannot-fit",
        itinerary: original,
        movedItemIds: [],
        message: "장소 사이의 기존 이동·대기 간격과 체류시간을 유지하면 08:00 이후에 종료 조건을 맞출 수 없어요. 일정 제외 또는 체류시간 조정이 필요해요.",
      };
    }
    startsById.set(item.id, minutesToTimeString(nextStart));
  }
  const movedItemIds = lastDayItems.filter((item) => startsById.get(item.id) !== item.startTime).map((item) => item.id);
  if (!movedItemIds.length) return { status: "cannot-fit", itinerary: original, movedItemIds: [], message: analysis.message };
  return {
    status: "adjusted",
    itinerary: original.map((item) => startsById.has(item.id) ? { ...item, startTime: startsById.get(item.id) as string } : item),
    movedItemIds,
  };
}

export type TripEndConditionMutationResolution =
  | { status: "unchanged"; itinerary: ItineraryItem[] }
  | { status: "adjusted"; itinerary: ItineraryItem[]; movedItemIds: string[] }
  | { status: "rejected"; itinerary: ItineraryItem[]; message: string };

/**
 * 사용자 변경을 종료 조건 기준으로 preflight한다. 그대로 가능하면 유지하고,
 * 순서·체류시간을 보존한 채 앞당길 수 있으면 조정하며, 그 외에는 commit하지 않는다.
 */
export function resolveTripEndConditionMutation(
  trip: TripRoom,
  itinerary: readonly ItineraryItem[],
): TripEndConditionMutationResolution {
  const original = itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }));
  const assessment = analyzeTripEndCondition(trip, original);
  if (assessment.status !== "infeasible" && assessment.status !== "invalid") {
    return { status: "unchanged", itinerary: original };
  }
  if (assessment.status === "invalid") {
    return { status: "rejected", itinerary: original, message: assessment.message };
  }
  const adjustment = buildTripEndConditionAdjustment(trip, original);
  if (adjustment.status !== "adjusted") {
    return { status: "rejected", itinerary: original, message: adjustment.status === "cannot-fit" ? adjustment.message : assessment.message };
  }
  const adjustedAssessment = analyzeTripEndCondition(trip, adjustment.itinerary);
  if (adjustedAssessment.status !== "feasible") {
    return { status: "rejected", itinerary: original, message: adjustedAssessment.message };
  }
  return { status: "adjusted", itinerary: adjustment.itinerary, movedItemIds: adjustment.movedItemIds };
}

export type TripEndConditionAdditionResolution =
  | { status: "accepted"; itinerary: ItineraryItem[] }
  | { status: "rejected"; itinerary: ItineraryItem[]; message: string };

/**
 * 새 일정 추가는 사용자가 고른 시간을 보존한다. 종료 조건을 침범하면 기존 일정을
 * 자동으로 옮기지 않고 추가 전체를 거부한다.
 */
export function resolveTripEndConditionAddition(
  trip: TripRoom,
  itinerary: readonly ItineraryItem[],
  addedDate?: string,
): TripEndConditionAdditionResolution {
  const original = itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }));
  if (addedDate && addedDate !== trip.endDate) return { status: "accepted", itinerary: original };
  const assessment = analyzeTripEndCondition(trip, original);
  if (assessment.status === "infeasible" || assessment.status === "invalid") {
    return { status: "rejected", itinerary: original, message: assessment.message };
  }
  return { status: "accepted", itinerary: original };
}
