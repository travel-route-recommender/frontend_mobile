import type { ItineraryItem } from "../../../domain";
import {
  DEFAULT_PLACE_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  SLOT_MINUTES,
  WORKSPACE_END_MINUTES,
  WORKSPACE_START_MINUTES,
} from "../../../data/workspaceSchedule";
import { findNextAvailableSlot, sortItineraryItemsByDateAndTime } from "../../../utils/schedule";
import type { ItineraryMoveDirection, WorkspaceDate } from "../types";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildTripDateRange(startDate: string, endDate: string): WorkspaceDate[] {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || startDate > endDate) return [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const result: WorkspaceDate[] = [];
  for (let cursor = Date.parse(`${startDate}T00:00:00Z`); cursor <= end; cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const [, month, day] = date.split("-");
    result.push({
      date,
      dayIndex: result.length,
      dayLabel: `DAY ${result.length + 1}`,
      monthDayLabel: `${Number(month)}/${Number(day)}`,
      weekdayLabel: new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(new Date(cursor)),
      itineraryCount: 0,
    });
  }
  return result;
}

export function addDaysToDate(date: string, days: number) {
  if (!isValidDateOnly(date) || !Number.isInteger(days)) return null;
  const next = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(next).toISOString().slice(0, 10);
}

export function parseTimeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59 || hour < 0 || hour > 24) return null;
  if (hour === 24 && minute !== 0) return null;
  return hour * 60 + minute;
}

export function formatMinutesToTime(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutesToTime(value: string, minutesToAdd: number): string | null {
  const start = parseTimeToMinutes(value);
  if (start === null || !Number.isInteger(minutesToAdd)) return null;
  return formatMinutesToTime(start + minutesToAdd);
}

export function calculateDurationMinutes(startTime: string, endTime: string): number | null {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

export type TimeRangeValidation =
  | { valid: true; durationMinutes: number }
  | { valid: false; message: string };

export function validateTimeRange(startTime: string, endTime: string): TimeRangeValidation {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return { valid: false, message: "시간을 HH:mm 형식으로 입력해 주세요." };
  if (start < WORKSPACE_START_MINUTES || start >= WORKSPACE_END_MINUTES || end > WORKSPACE_END_MINUTES) {
    return { valid: false, message: "일정 시간은 08:00부터 24:00 사이에서 설정해 주세요." };
  }
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return { valid: false, message: "시간은 30분 단위로 설정해 주세요." };
  }
  const durationMinutes = end - start;
  if (durationMinutes < MIN_DURATION_MINUTES) return { valid: false, message: "종료 시간은 시작 시간보다 30분 이상 뒤여야 해요." };
  return { valid: true, durationMinutes };
}

export function doTimeRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  const values = [leftStart, leftEnd, rightStart, rightEnd].map(parseTimeToMinutes);
  if (values.some((value) => value === null)) return false;
  const [leftStartMinutes, leftEndMinutes, rightStartMinutes, rightEndMinutes] = values as number[];
  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

export function getItineraryEndTime(item: Pick<ItineraryItem, "startTime" | "durationMinutes">) {
  return addMinutesToTime(item.startTime, item.durationMinutes) ?? "--:--";
}

export type TimeConflict = { itemId: string; conflictingItemIds: string[] };

export function findTimeConflictsForDate(items: readonly ItineraryItem[], date: string): TimeConflict[] {
  const target = items.filter((item) => item.date === date);
  return target.map((item) => {
    const endTime = getItineraryEndTime(item);
    const conflictingItemIds = target
      .filter((other) => other.id !== item.id && doTimeRangesOverlap(item.startTime, endTime, other.startTime, getItineraryEndTime(other)))
      .map((other) => other.id);
    return { itemId: item.id, conflictingItemIds };
  }).filter((conflict) => conflict.conflictingItemIds.length > 0);
}

export function findConflictingItems(
  items: readonly ItineraryItem[],
  range: { date: string; startTime: string; endTime: string },
  excludeItemId?: string,
) {
  return items.filter((item) => item.id !== excludeItemId && item.date === range.date && doTimeRangesOverlap(
    range.startTime,
    range.endTime,
    item.startTime,
    getItineraryEndTime(item),
  ));
}

export function getDefaultScheduleRange(items: readonly ItineraryItem[], date: string) {
  const startTime = findNextAvailableSlot({
    items: [...items],
    date,
    durationMinutes: DEFAULT_PLACE_DURATION_MINUTES,
    fromMinutes: WORKSPACE_START_MINUTES,
  }) ?? formatMinutesToTime(WORKSPACE_START_MINUTES) ?? "08:00";
  return {
    startTime,
    endTime: addMinutesToTime(startTime, DEFAULT_PLACE_DURATION_MINUTES) ?? "09:00",
  };
}

export function normalizeItineraryOrder(items: readonly ItineraryItem[]) {
  const seen = new Set<string>();
  return sortItineraryItemsByDateAndTime(items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }));
}

export type MoveWithinDateResult = {
  status: "success" | "boundary" | "invalid-item" | "invalid-time";
  items: ItineraryItem[];
};

export function moveItemWithinDate(
  items: readonly ItineraryItem[],
  itemId: string,
  direction: ItineraryMoveDirection,
): MoveWithinDateResult {
  const source = items.find((item) => item.id === itemId);
  if (!source) return { status: "invalid-item", items: [...items] };
  const sameDate = sortItineraryItemsByDateAndTime(items.filter((item) => item.date === source.date));
  const index = sameDate.findIndex((item) => item.id === itemId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= sameDate.length) return { status: "boundary", items: [...items] };

  const first = sameDate[Math.min(index, neighborIndex)];
  const second = sameDate[Math.max(index, neighborIndex)];
  const firstStart = parseTimeToMinutes(first.startTime);
  const secondStart = parseTimeToMinutes(second.startTime);
  if (firstStart === null || secondStart === null || first.durationMinutes <= 0 || second.durationMinutes <= 0) {
    return { status: "invalid-time", items: [...items] };
  }
  const gap = secondStart - (firstStart + first.durationMinutes);
  if (gap < 0) return { status: "invalid-time", items: [...items] };
  const swappedSecondStart = formatMinutesToTime(firstStart + second.durationMinutes + gap);
  if (!swappedSecondStart) return { status: "invalid-time", items: [...items] };

  const replacements: Record<string, ItineraryItem> = {
    [second.id]: { ...second, startTime: first.startTime },
    [first.id]: { ...first, startTime: swappedSecondStart },
  };
  return {
    status: "success",
    items: normalizeItineraryOrder(items.map((item) => replacements[item.id] ?? item)),
  };
}

export function moveItemToIndexWithinDate(
  items: readonly ItineraryItem[],
  itemId: string,
  targetIndex: number,
): MoveWithinDateResult {
  const source = items.find((item) => item.id === itemId);
  if (!source) return { status: "invalid-item", items: [...items] };
  const sameDate = sortItineraryItemsByDateAndTime(items.filter((item) => item.date === source.date));
  const sourceIndex = sameDate.findIndex((item) => item.id === itemId);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= sameDate.length) {
    return { status: "boundary", items: [...items] };
  }
  if (sourceIndex === targetIndex) return { status: "success", items: normalizeItineraryOrder(items) };

  const direction: ItineraryMoveDirection = targetIndex < sourceIndex ? "up" : "down";
  let nextItems = [...items];
  let currentIndex = sourceIndex;
  while (currentIndex !== targetIndex) {
    const moved = moveItemWithinDate(nextItems, itemId, direction);
    if (moved.status !== "success") return moved;
    nextItems = moved.items;
    currentIndex += direction === "up" ? -1 : 1;
  }
  return { status: "success", items: nextItems };
}

export function moveItemToDate(items: readonly ItineraryItem[], itemId: string, date: string, startTime: string) {
  if (!items.some((item) => item.id === itemId)) return [...items];
  return normalizeItineraryOrder(items.map((item) => item.id === itemId ? { ...item, date, startTime } : item));
}
