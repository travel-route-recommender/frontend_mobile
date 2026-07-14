import type { EntityId, PreferenceDimension, PreferenceScore } from "../../domain";
import type { GroupDimensionStatus, GroupPreferenceDimensionDiagnosis } from "./types";

export function getGroupDimensionStatus(spread: number): GroupDimensionStatus {
  if (spread === 0) return "common";
  if (spread === 1) return "compatible";
  return "needs-tuning";
}

export function diagnosePreferenceDimension(
  dimension: PreferenceDimension,
  responses: readonly { userId: EntityId; score: PreferenceScore }[],
): GroupPreferenceDimensionDiagnosis {
  const safeResponses = responses.map((response) => ({ ...response }));
  const scores = safeResponses.map((response) => response.score);
  if (!scores.length) return { dimension, responses: safeResponses };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;
  return {
    dimension,
    responses: safeResponses,
    status: getGroupDimensionStatus(spread),
    min,
    max,
    spread,
    average: scores.reduce<number>((sum, score) => sum + score, 0) / scores.length,
  };
}
