import type { TripStatus } from "../domain";

export function formatTripDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) && Number.isNaN(end.getTime())) return "날짜 미정";
  if (Number.isNaN(start.getTime())) return `${end.getMonth() + 1}.${end.getDate()}`;
  if (Number.isNaN(end.getTime())) return `${start.getMonth() + 1}.${start.getDate()}`;
  return `${start.getMonth() + 1}.${start.getDate()} - ${end.getMonth() + 1}.${end.getDate()}`;
}

export function formatTripStatus(status: TripStatus) {
  if (status === "planning") return "여행 계획 중";
  if (status === "drafting") return "일정 초안 작성 중";
  if (status === "confirmed") return "일정 확정";
  return "여행 완료";
}

export function isValidISODate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatDayLabel(date: string, tripStartDate: string) {
  const start = new Date(`${tripStartDate}T00:00:00`).getTime();
  const target = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(target)) return "날짜 미정";
  const dayIndex = Math.round((target - start) / 86_400_000) + 1;
  return `Day ${Math.max(dayIndex, 1)}`;
}

export function getTripDateForDayLabel(day: "Day 1" | "Day 2", startDate: string, endDate: string) {
  return day === "Day 1" ? startDate : endDate;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function formatTimeLabel(time: string) {
  const hour = Number(time.split(":")[0]);
  if (hour < 12) return "오전";
  if (hour < 18) return "오후";
  return "저녁";
}


