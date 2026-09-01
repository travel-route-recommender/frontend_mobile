import { challengeStyleQuestions } from "../config/challenge-style-questions";
import { itineraryMessageQuestions } from "../config/itinerary-message-questions";
import {
  accommodationAxes,
  budgetCategories,
  discoveryScenes,
  preferenceSteps,
} from "../config/travel-preference-test-config";
import type { PersonalPreferenceDraftAnswers, PreferenceStepId } from "../types";
import { getBudgetRanking } from "./travel-preference-survey";

export const preferenceStoryQuestions = [
  ...challengeStyleQuestions.map((question) => ({ kind: "challenge" as const, question })),
  ...itineraryMessageQuestions.map((question) => ({ kind: "itinerary" as const, question })),
] as const;

export const preferenceQuestionCount = (
  preferenceStoryQuestions.length
  + accommodationAxes.length
  + 1
  + 1
  + discoveryScenes.length
);

export const preferenceIndividualSelectionCount = (
  preferenceStoryQuestions.length
  + accommodationAxes.length
  + 1
  + budgetCategories.length
  + discoveryScenes.length
);

export type PreferenceStepProgress = {
  innerIndex: number;
  innerCount: number;
  innerLabel: string;
  innerProgressLabel: string;
};

export type PreferenceTestProgress = PreferenceStepProgress & {
  chapterIndex: number;
  chapterCount: number;
  chapterLabel: string;
  isFinalAtomicItem: boolean;
};

function currentOrFinalIndex(count: number, firstUnansweredIndex: number) {
  if (count <= 0) return 0;
  return firstUnansweredIndex < 0 ? count : firstUnansweredIndex + 1;
}

export function getFirstUnansweredStoryQuestionIndex(answers: PersonalPreferenceDraftAnswers) {
  const index = preferenceStoryQuestions.findIndex((entry) => entry.kind === "challenge"
    ? !answers.challengeStyleAnswers?.[entry.question.id]
    : !answers.itineraryMessageAnswers?.[entry.question.id]);
  return index < 0 ? Math.max(preferenceStoryQuestions.length - 1, 0) : index;
}

export function resolvePreferenceStepProgress(
  stepId: PreferenceStepId,
  answers: PersonalPreferenceDraftAnswers,
  storyQuestionIndex = getFirstUnansweredStoryQuestionIndex(answers),
): PreferenceStepProgress {
  let innerIndex = 1;
  let innerCount = 1;
  let innerLabel = "선택";

  switch (stepId) {
    case "challengeStyle":
    case "itinerary":
      innerCount = preferenceStoryQuestions.length;
      innerIndex = Math.max(1, Math.min(storyQuestionIndex + 1, innerCount));
      innerLabel = "질문";
      break;
    case "accommodation": {
      innerCount = accommodationAxes.length;
      const firstUnanswered = accommodationAxes.findIndex((axis) => !answers.accommodation?.[axis.id]);
      innerIndex = currentOrFinalIndex(innerCount, firstUnanswered);
      innerLabel = "숙소 기준";
      break;
    }
    case "stamina":
      innerLabel = "체력 선택";
      break;
    case "budget": {
      innerCount = budgetCategories.length;
      innerIndex = Math.max(1, Math.min(getBudgetRanking(answers).length + 1, innerCount));
      innerLabel = "예산 순위";
      break;
    }
    case "discovery": {
      innerCount = discoveryScenes.length;
      const firstUnanswered = discoveryScenes.findIndex((scene) => (
        scene.id === "landmarkImportance" ? !answers.landmarkImportance : !answers.localInterest
      ));
      innerIndex = currentOrFinalIndex(innerCount, firstUnanswered);
      innerLabel = "선택";
      break;
    }
    case "mobility":
      innerLabel = "이동 선택";
      break;
    case "adventure":
      innerLabel = "도전 기준";
      break;
  }

  return {
    innerIndex,
    innerCount,
    innerLabel,
    innerProgressLabel: `${innerLabel} ${innerIndex} / ${innerCount}`,
  };
}

export function resolvePreferenceTestProgress(input: {
  answers: PersonalPreferenceDraftAnswers;
  chapterIndex: number;
  stepId: PreferenceStepId;
  storyQuestionIndex?: number;
}): PreferenceTestProgress {
  const chapterCount = preferenceSteps.length;
  const chapterIndex = Math.max(1, Math.min(input.chapterIndex + 1, chapterCount));
  const inner = resolvePreferenceStepProgress(input.stepId, input.answers, input.storyQuestionIndex);
  return {
    ...inner,
    chapterIndex,
    chapterCount,
    chapterLabel: `챕터 ${chapterIndex} / ${chapterCount}`,
    isFinalAtomicItem: chapterIndex === chapterCount && inner.innerIndex === inner.innerCount,
  };
}

/** 같은 화면 안의 단순 선택은 유지하고, 실제 atomic view가 바뀔 때만 key를 바꾼다. */
export function resolvePreferenceScrollResetKey(input: {
  answers: PersonalPreferenceDraftAnswers;
  stepId: PreferenceStepId;
  storyQuestionIndex?: number;
}) {
  if (input.stepId === "challengeStyle" || input.stepId === "itinerary") {
    const questionIndex = input.storyQuestionIndex ?? getFirstUnansweredStoryQuestionIndex(input.answers);
    return `${input.stepId}:${questionIndex}`;
  }
  if (input.stepId === "budget") {
    return `${input.stepId}:${getBudgetRanking(input.answers).length}`;
  }
  return input.stepId;
}
