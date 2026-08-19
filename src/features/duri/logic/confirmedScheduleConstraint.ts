import type { ItineraryItem, TripRoom } from "../../../domain";
import type { ConfirmedScheduleConstraint } from "../../../duri/duri-analysis";
import { getTripDates, timeStringToMinutes } from "../../../utils/schedule";

/** 하드 판정과 최적화 잠금에 실제로 사용할 수 있는 사용자 확인 사실만 통과시킨다. */
export function isUsableConfirmedScheduleConstraint(
  constraint: ConfirmedScheduleConstraint,
  trip: Pick<TripRoom, "startDate" | "endDate">,
) {
  const confirmedAt = Date.parse(constraint.confirmedAt);
  const startMinutes = constraint.startTime === undefined ? undefined : timeStringToMinutes(constraint.startTime);
  const endMinutes = constraint.endTime === undefined ? undefined : timeStringToMinutes(constraint.endTime);
  return Boolean(
    constraint.id
    && constraint.label.trim()
    && (constraint.itineraryItemId || constraint.placeId)
    && Number.isFinite(confirmedAt)
    && (startMinutes === undefined || Number.isFinite(startMinutes))
    && (endMinutes === undefined || Number.isFinite(endMinutes))
    && (endMinutes === undefined || startMinutes !== undefined)
    && (startMinutes === undefined || endMinutes === undefined || endMinutes > startMinutes)
    && getTripDates(trip.startDate, trip.endDate).includes(constraint.date),
  );
}

/**
 * 예약 시각은 1분 단위일 수 있지만 Workspace는 15분 격자다. 따라서 문자열
 * exact-match 대신 일정 블록이 사용자가 확인한 예약 구간을 실제로 포함하는지 본다.
 */
export function itineraryItemCoversConfirmedTime(
  item: Pick<ItineraryItem, "date" | "startTime" | "durationMinutes">,
  constraint: Pick<ConfirmedScheduleConstraint, "date" | "startTime" | "endTime">,
) {
  if (item.date !== constraint.date) return false;
  if (!constraint.startTime && !constraint.endTime) return true;
  const itemStart = timeStringToMinutes(item.startTime);
  const itemEnd = itemStart + item.durationMinutes;
  const confirmedStart = constraint.startTime === undefined ? undefined : timeStringToMinutes(constraint.startTime);
  const confirmedEnd = constraint.endTime === undefined ? undefined : timeStringToMinutes(constraint.endTime);
  if (!Number.isFinite(itemStart) || !Number.isFinite(itemEnd)) return false;
  if (confirmedStart !== undefined && (!Number.isFinite(confirmedStart) || confirmedStart < itemStart || confirmedStart >= itemEnd)) return false;
  if (confirmedEnd !== undefined && (!Number.isFinite(confirmedEnd) || confirmedEnd > itemEnd)) return false;
  return true;
}
