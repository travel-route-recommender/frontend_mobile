import type {
  ChallengeStylePreference,
  PreferencePreviewResult,
  ScheduleStylePreference,
} from "../types";
import {
  getChallengeStylePresentation,
  getPreferenceTypePresentation,
} from "./formatPreferenceResult";

export type PreferencePresentationDetails = {
  challengeStyle?: ChallengeStylePreference;
  scheduleStyle?: ScheduleStylePreference;
};

export type ResolvedPreferencePresentation = {
  title: string;
  description: string;
  icon: string;
  planningMessage: string;
  traits: string[];
  preferredTags: string[];
  keywordCount: number;
};

/**
 * My Page와 개인 결과 화면이 기존 계산 결과를 같은 규칙으로 표현하도록 만든 단일 표시 모델이다.
 * 상세 설문 결과가 있으면 기존 결과 화면과 동일하게 도전 유형 및 일정 수식어를 우선한다.
 */
export function resolvePreferencePresentation(
  result: PreferencePreviewResult,
  details: PreferencePresentationDetails = {},
): ResolvedPreferencePresentation {
  const legacyPresentation = getPreferenceTypePresentation(result.profileType);
  const challengePresentation = details.challengeStyle
    ? getChallengeStylePresentation(details.challengeStyle.type)
    : null;
  const basePresentation = challengePresentation ?? legacyPresentation;
  const preferredTags = [...result.preferredTags];

  return {
    ...basePresentation,
    title: details.scheduleStyle
      ? `${details.scheduleStyle.modifier} ${basePresentation.title}`
      : basePresentation.title,
    traits: [...(challengePresentation?.traits ?? result.traits)],
    preferredTags,
    keywordCount: preferredTags.length,
  };
}
