import type {
  PreferencePreviewResult,
  TravelPreferenceSurveyResult,
} from "../types";
import {
  resolvePreferencePresentation,
  type ResolvedPreferencePresentation,
} from "./resolve-preference-presentation";

export type ResolvedPreferenceResultPair = {
  canonicalResult: PreferencePreviewResult;
  canonicalPresentation: ResolvedPreferencePresentation;
  completedAt: string;
  detailedResult: TravelPreferenceSurveyResult | null;
};

type DetailedResultCandidate = TravelPreferenceSurveyResult | null | undefined;

/**
 * 저장된 canonical result와 같은 완료 건에서 계산된 상세 결과만 한 화면에 묶는다.
 * 현재 모델에는 별도 resultId가 없으므로 owner userId와 completedAt의 정확한 일치를 사용한다.
 */
export function resolvePreferenceResultPair(
  canonicalResult: PreferencePreviewResult,
  detailedCandidates: DetailedResultCandidate | readonly DetailedResultCandidate[],
  expectedUserId?: string,
): ResolvedPreferenceResultPair {
  const candidates = Array.isArray(detailedCandidates) ? detailedCandidates : [detailedCandidates];
  const detailedResult = candidates.find((candidate): candidate is TravelPreferenceSurveyResult => Boolean(
    candidate
      && candidate.completedAt === canonicalResult.completedAt
      && (expectedUserId === undefined || candidate.userId === expectedUserId),
  )) ?? null;

  return {
    canonicalResult,
    canonicalPresentation: resolvePreferencePresentation(canonicalResult, detailedResult ? {
      challengeStyle: detailedResult.challengeStylePreference,
      scheduleStyle: detailedResult.scheduleStylePreference,
    } : undefined),
    completedAt: canonicalResult.completedAt,
    detailedResult,
  };
}
