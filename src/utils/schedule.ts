import type { ItineraryItem } from "../domain";
import {
  MIN_DURATION_MINUTES,
  SLOT_HEIGHT_PX,
  SLOT_MINUTES,
  WORKSPACE_END_MINUTES,
  WORKSPACE_START_MINUTES,
} from "../data/workspaceSchedule";

export type ScheduleRange = Pick<ItineraryItem, "date" | "startTime" | "durationMinutes"> & {
  id?: string;
};

export type GridPointer = { clientX: number; clientY: number };
export type GridRect = { left: number; top: number; width: number; height: number };

export function timeStringToMinutes(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return Number.NaN;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59 || hours > 24) return Number.NaN;
  if (hours === 24 && minutes !== 0) return Number.NaN;
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number) {
  const safeMinutes = Math.min(Math.max(Math.round(minutes), 0), 24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function snapMinutesToSlot(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export function clampMinutesToSchedule(minutes: number) {
  return Math.min(Math.max(minutes, WORKSPACE_START_MINUTES), WORKSPACE_END_MINUTES);
}

export function getTopFromStartTime(startTime: string) {
  const minutes = timeStringToMinutes(startTime);
  if (!Number.isFinite(minutes)) return 0;
  return ((minutes - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function getHeightFromDuration(durationMinutes: number) {
  return (Math.max(durationMinutes, MIN_DURATION_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function getDateIndex(date: string, tripDates: string[]) {
  return tripDates.indexOf(date);
}

export function getSlotFromPointerPosition(pointer: GridPointer, gridRect: GridRect, tripDates: string[]) {
  if (!tripDates.length || gridRect.width <= 0 || gridRect.height <= 0) return undefined;
  const dateIndex = Math.min(
    Math.max(Math.floor(((pointer.clientX - gridRect.left) / gridRect.width) * tripDates.length), 0),
    tripDates.length - 1,
  );
  const relativeY = Math.min(Math.max(pointer.clientY - gridRect.top, 0), gridRect.height);
  const rawMinutes = WORKSPACE_START_MINUTES + (relativeY / gridRect.height) * (WORKSPACE_END_MINUTES - WORKSPACE_START_MINUTES);
  const minutes = Math.min(snapMinutesToSlot(rawMinutes), WORKSPACE_END_MINUTES - SLOT_MINUTES);
  return { date: tripDates[dateIndex], startTime: minutesToTimeString(minutes), dateIndex };
}

export function sortItineraryItemsByDateAndTime<T extends ScheduleRange>(items: T[]) {
  return [...items].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    return dateOrder || timeStringToMinutes(left.startTime) - timeStringToMinutes(right.startTime);
  });
}

export function isTimeRangeOverlapping(left: ScheduleRange, right: ScheduleRange) {
  if (left.date !== right.date) return false;
  const leftStart = timeStringToMinutes(left.startTime);
  const rightStart = timeStringToMinutes(right.startTime);
  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return false;
  return leftStart < rightStart + right.durationMinutes && rightStart < leftStart + left.durationMinutes;
}

export function findOverlappingItem<T extends ScheduleRange>(items: T[], range: ScheduleRange, excludeItemId?: string) {
  return items.find((item) => item.id !== excludeItemId && isTimeRangeOverlapping(item, range));
}

export function findNextAvailableSlot({
  items,
  date,
  durationMinutes,
  fromMinutes = WORKSPACE_START_MINUTES,
  excludeItemId,
}: {
  items: ScheduleRange[];
  date: string;
  durationMinutes: number;
  fromMinutes?: number;
  excludeItemId?: string;
}) {
  const firstSlot = Math.max(snapMinutesToSlot(fromMinutes), WORKSPACE_START_MINUTES);
  for (let minutes = firstSlot; minutes + durationMinutes <= WORKSPACE_END_MINUTES; minutes += SLOT_MINUTES) {
    const startTime = minutesToTimeString(minutes);
    if (!findOverlappingItem(items, { date, startTime, durationMinutes }, excludeItemId)) return startTime;
  }
  return undefined;
}

export function getTripDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function formatScheduleDate(date: string, index: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return { dayLabel: `Day ${index + 1}`, dateLabel: "날짜 미정" };
  return {
    dayLabel: `Day ${index + 1}`,
    dateLabel: new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(parsed),
  };
}

export function getEndTime(startTime: string, durationMinutes: number) {
  const start = timeStringToMinutes(startTime);
  return Number.isFinite(start) ? minutesToTimeString(start + durationMinutes) : "--:--";
}

export function isValidScheduleRange(range: ScheduleRange) {
  const start = timeStringToMinutes(range.startTime);
  return (
    Number.isFinite(start) &&
    start >= WORKSPACE_START_MINUTES &&
    start < WORKSPACE_END_MINUTES &&
    range.durationMinutes >= MIN_DURATION_MINUTES &&
    range.durationMinutes % SLOT_MINUTES === 0 &&
    start + range.durationMinutes <= WORKSPACE_END_MINUTES
  );
}


