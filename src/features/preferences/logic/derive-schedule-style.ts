import type { ScheduleStylePreference } from "../types";

export const SCHEDULE_STYLE_ALGORITHM_VERSION = 2;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function deriveScheduleStylePreference(input: {
  densityScore: number;
  restPreferenceScore: number;
  staminaScore: number;
}): ScheduleStylePreference {
  const density = clampScore(input.densityScore);
  const activeRestPreference = 100 - clampScore(input.restPreferenceScore);
  const stamina = clampScore(input.staminaScore);
  // 중요도 응답이 없는 세 신호에 임의 가중치를 주지 않고, 이상치 한 축에
  // 결과가 끌려가지 않는 동일 가중 중앙값을 사용한다.
  const score = [density, activeRestPreference, stamina].sort((left, right) => left - right)[1];
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
