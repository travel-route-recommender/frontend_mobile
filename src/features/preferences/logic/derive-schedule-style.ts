import type { ScheduleStylePreference } from "../types";

export const SCHEDULE_STYLE_ALGORITHM_VERSION = 1;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function deriveScheduleStylePreference(input: {
  densityScore: number;
  restPreferenceScore: number;
  staminaScore: number;
}): ScheduleStylePreference {
  const density = clampScore(input.densityScore);
  const activeRestPreference = 100 - clampScore(input.restPreferenceScore);
  const stamina = clampScore(input.staminaScore);
  const score = clampScore(
    density * 0.6
      + activeRestPreference * 0.25
      + stamina * 0.15,
  );
  const packed = score > 50;

  return {
    algorithmVersion: SCHEDULE_STYLE_ALGORITHM_VERSION,
    type: packed ? "packed" : "relaxed",
    modifier: packed ? "알찬" : "여유로운",
    label: packed ? "알찬 일정" : "여유로운 일정",
    score,
    components: { density, activeRestPreference, stamina },
  };
}
