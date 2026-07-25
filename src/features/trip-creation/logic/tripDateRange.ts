import { isValidISODate } from "../../../utils/formatters";

export type CalendarDayCell = {
  key: string;
  date: string | null;
  dayNumber: number | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function createMonthKey(year: number, monthIndex: number) {
  const normalized = new Date(year, monthIndex, 1, 12);
  return `${normalized.getFullYear()}-${pad(normalized.getMonth() + 1)}-01`;
}

export function getInitialCalendarMonth(startDate: string | null, today = new Date()) {
  if (isValidISODate(startDate)) return `${startDate.slice(0, 7)}-01`;
  return createMonthKey(today.getFullYear(), today.getMonth());
}

export function moveCalendarMonth(monthKey: string, offset: number) {
  if (!isValidISODate(monthKey) || !Number.isInteger(offset)) return monthKey;
  const [year, month] = monthKey.split("-").map(Number);
  return createMonthKey(year, month - 1 + offset);
}

export function formatCalendarMonth(monthKey: string) {
  if (!isValidISODate(monthKey)) return "월 확인 필요";
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export function buildCalendarMonth(monthKey: string): CalendarDayCell[] {
  if (!isValidISODate(monthKey)) return [];
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const daysInMonth = new Date(year, month, 0, 12).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return { key: `blank-${index}`, date: null, dayNumber: null };
    const date = `${year}-${pad(month)}-${pad(dayNumber)}`;
    return { key: date, date, dayNumber };
  });
}

export function selectTripDateRange(startDate: string | null, endDate: string | null, selectedDate: string) {
  if (!isValidISODate(selectedDate)) return { startDate, endDate };
  if (!startDate || endDate) return { startDate: selectedDate, endDate: null };
  if (selectedDate < startDate) return { startDate: selectedDate, endDate: null };
  return { startDate, endDate: selectedDate };
}

export function isDateInSelectedRange(date: string, startDate: string | null, endDate: string | null) {
  if (!startDate) return false;
  if (!endDate) return date === startDate;
  return date >= startDate && date <= endDate;
}
