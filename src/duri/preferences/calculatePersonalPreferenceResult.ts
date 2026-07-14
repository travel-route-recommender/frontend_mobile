import type {
  PersonalPreferenceAnswers,
  PreferenceDimension,
  PreferenceScore,
  UserPreferenceResult,
} from "../../domain";
import { PERSONAL_TEST_VERSION, personalTestQuestions } from "./personalTestConfig";

export type PersonalPreferenceDraft = Partial<Record<PreferenceDimension, PreferenceScore>>;

export const defaultPersonalPreferenceAnswers: PersonalPreferenceAnswers = {
  pace: 1,
  budget: 1,
  mobility: 1,
  activity: 1,
  mealStyle: 1,
  planningStyle: 1,
};

export function isCompletePersonalPreferenceAnswers(
  answers: PersonalPreferenceDraft,
): answers is PersonalPreferenceAnswers {
  return personalTestQuestions.every((question) => answers[question.dimension] !== undefined);
}

function getProfileType(answers: PersonalPreferenceAnswers) {
  const energyScore = answers.pace + answers.activity;
  if (energyScore <= 1) return "여유로운 여행자";
  if (energyScore >= 3) return "알찬 여행자";
  return "균형형 여행자";
}

const traitByDimension: Record<PreferenceDimension, [string, string, string]> = {
  pace: ["여유로운 일정", "균형 있는 일정", "알찬 일정"],
  budget: ["실속 있는 선택", "적당한 예산", "경험 중심 소비"],
  mobility: ["가까운 동선", "적당한 이동", "먼 거리도 괜찮음"],
  activity: ["머무는 여행", "관광과 휴식", "활동적인 여행"],
  mealStyle: ["맛집 대기 최소화", "상황에 맞는 식사", "로컬 맛집 탐색"],
  planningStyle: ["정해진 계획 선호", "기본 계획과 조정", "유연한 현장 계획"],
};

function buildTraits(answers: PersonalPreferenceAnswers) {
  const dimensions: PreferenceDimension[] = ["pace", "mobility", "activity", "mealStyle", "planningStyle"];
  return dimensions.map((dimension) => traitByDimension[dimension][answers[dimension]]);
}

function buildPreferredTags(answers: PersonalPreferenceAnswers) {
  const activityTags: Record<PreferenceScore, string[]> = {
    0: ["카페", "산책", "여유", "바다"],
    1: ["명소", "사진", "카페", "산책"],
    2: ["명소", "야경", "바다", "사진"],
  };
  const extraTags = [
    ...(answers.mealStyle === 2 ? ["맛집", "로컬"] : []),
    ...(answers.budget === 0 ? ["로컬"] : []),
    ...(answers.mobility === 0 ? ["산책"] : []),
  ];
  return [...new Set([...activityTags[answers.activity], ...extraTags])];
}

export function calculatePersonalPreferenceResult(
  userId: string,
  answers: PersonalPreferenceAnswers,
  completedAt = new Date().toISOString(),
): UserPreferenceResult {
  return {
    userId,
    answers: { ...answers },
    profileType: getProfileType(answers),
    traits: buildTraits(answers),
    preferredTags: buildPreferredTags(answers),
    completedAt,
    version: PERSONAL_TEST_VERSION,
  };
}

export function normalizeLegacyPreferenceResult(
  userId: string,
  value: Partial<UserPreferenceResult>,
): UserPreferenceResult {
  if (value.answers && value.preferredTags && value.version === PERSONAL_TEST_VERSION) {
    return {
      ...value,
      userId,
      answers: { ...value.answers },
      profileType: value.profileType ?? "균형형 여행자",
      traits: value.traits ?? [],
      preferredTags: [...value.preferredTags],
      completedAt: value.completedAt ?? new Date().toISOString(),
      version: PERSONAL_TEST_VERSION,
    };
  }
  const legacyText = `${value.profileType ?? ""} ${(value.traits ?? []).join(" ")}`;
  const energyScore: PreferenceScore = /감성|여유|느린/.test(legacyText) ? 0 : /알찬|활동/.test(legacyText) ? 2 : 1;
  const answers: PersonalPreferenceAnswers = {
    ...defaultPersonalPreferenceAnswers,
    pace: energyScore,
    activity: energyScore,
    mobility: /느린|가까운/.test(legacyText) ? 0 : 1,
  };
  return {
    ...calculatePersonalPreferenceResult(userId, answers, value.completedAt ?? new Date().toISOString()),
    profileType: value.profileType ?? getProfileType(answers),
    traits: value.traits?.length ? [...value.traits] : buildTraits(answers),
  };
}
