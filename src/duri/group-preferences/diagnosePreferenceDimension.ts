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
  const average = scores.reduce<number>((sum, score) => sum + score, 0) / scores.length;
  const sorted = [...scores].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = scores.reduce<number>((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
  const meanAbsoluteDeviation = scores.reduce<number>((sum, score) => sum + Math.abs(score - average), 0) / scores.length;
  let pairSimilarityTotal = 0;
  let pairCount = 0;
  for (let left = 0; left < scores.length - 1; left += 1) {
    for (let right = left + 1; right < scores.length; right += 1) {
      pairSimilarityTotal += 1 - Math.abs(scores[left] - scores[right]) / 2;
      pairCount += 1;
    }
  }
  return {
    dimension,
    responses: safeResponses,
    ...(scores.length >= 2 ? { status: getGroupDimensionStatus(spread) } : {}),
    min,
    max,
    spread,
    average,
    median,
    variance,
    standardDeviation: Math.sqrt(variance),
    meanAbsoluteDeviation,
    ...(pairCount ? { pairwiseAgreement: pairSimilarityTotal / pairCount, pairwiseComparisonCount: pairCount } : {}),
  };
}
