import { MIN_DURATION_MINUTES } from "../../../data/workspaceSchedule";

export type ScheduleBlockDisplayMode = "micro" | "compact" | "full";

export function getScheduleBlockDisplayMode(durationMinutes: number): ScheduleBlockDisplayMode {
  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0
    ? durationMinutes
    : MIN_DURATION_MINUTES;
  if (safeDuration <= MIN_DURATION_MINUTES) return "micro";
  if (safeDuration < 60) return "compact";
  return "full";
}

export function shouldShowScheduleResizeHandle(
  canEdit: boolean,
  durationMinutes: number,
) {
  return canEdit
    && Number.isFinite(durationMinutes)
    && durationMinutes >= MIN_DURATION_MINUTES;
}
