import { isValidISODate } from "../../../utils/formatters";

const DAY_MS = 86_400_000;

function dateOnlyUtc(value: string) {
  if (!isValidISODate(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dateToDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateOnlyToLocalDate(value: string, fallback = new Date()) {
  if (!isValidISODate(value)) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function getTripDayCount(startDate: string, endDate: string) {
  const start = dateOnlyUtc(startDate);
  const end = dateOnlyUtc(endDate);
  if (start === undefined || end === undefined || end < start) return undefined;
  return Math.round((end - start) / DAY_MS) + 1;
}

export function formatTripDurationLabel(startDate: string, endDate: string) {
  const days = getTripDayCount(startDate, endDate);
  if (days === undefined) return "기간 확인 필요";
  if (days === 1) return "당일치기";
  return `${days - 1}박 ${days}일`;
}

export function getTripTimingLabel(startDate: string, endDate: string, today = dateToDateOnly(new Date())) {
  const start = dateOnlyUtc(startDate);
  const end = dateOnlyUtc(endDate);
  const current = dateOnlyUtc(today);
  if (start === undefined || end === undefined || current === undefined) return undefined;
  if (current >= start && current <= end) return "여행 중";
  const difference = Math.round((start - current) / DAY_MS);
  if (difference > 0) return `D-${difference}`;
  return `D+${Math.max(Math.round((current - end) / DAY_MS), 0)}`;
}
