import type { GroupPreferenceDimensionDiagnosis } from "./types";

export function calculateGroupMatchRate(
  dimensions: readonly GroupPreferenceDimensionDiagnosis[],
  responseCount: number,
): number | undefined {
  if (responseCount < 2) return undefined;
  const observed = dimensions.filter((dimension) => (
    dimension.pairwiseAgreement !== undefined && (dimension.pairwiseComparisonCount ?? 0) > 0
  ));
  const comparisonCount = observed.reduce((sum, dimension) => sum + (dimension.pairwiseComparisonCount ?? 0), 0);
  if (!comparisonCount) return undefined;
  const agreementTotal = observed.reduce((sum, dimension) => (
    sum + (dimension.pairwiseAgreement as number) * (dimension.pairwiseComparisonCount as number)
  ), 0);
  return Math.round(agreementTotal / comparisonCount * 100);
}
