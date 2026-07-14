import type { GroupPreferenceDimensionDiagnosis } from "./types";

const statusScore = {
  common: 100,
  compatible: 60,
  "needs-tuning": 20,
} as const;

export function calculateGroupMatchRate(
  dimensions: readonly GroupPreferenceDimensionDiagnosis[],
  responseCount: number,
): number | undefined {
  if (responseCount < 2) return undefined;
  const scores = dimensions.flatMap((dimension) => dimension.status ? [statusScore[dimension.status]] : []);
  if (!scores.length) return undefined;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}
