import { calculatePersonalPreferenceResult } from "../../../duri/preferences";
import {
  itineraryPreferenceLevelScores,
} from "../config/itinerary-message-questions";
import {
  PERSONAL_SURVEY_DRAFT_VERSION,
  activityBlocks,
  budgetCategories,
  itineraryHourSlots,
} from "../config/travel-preference-test-config";
import type {
  AccommodationScaleValue,
  ActivityTagId,
  BudgetCategory,
  FourPointScaleValue,
  PersonalPreferenceDraftAnswers,
  StaminaLevel,
  TravelPreferenceSurveyResult,
} from "../types";
import {
  deriveLegacyPreferenceAnswers,
  getBudgetRanking,
  normalizeTravelPreferenceSurveyAnswers,
  validateTravelPreferenceSurvey,
} from "./travel-preference-survey";
import { classifyChallengeStyle } from "./classify-challenge-style";
import { deriveScheduleStylePreference } from "./derive-schedule-style";

export const TRAVEL_PREFERENCE_ALGORITHM_VERSION = 6;

const budgetPriorityWeights = [33, 27, 20, 13, 7] as const;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const scaleFourPoint = (value: FourPointScaleValue | undefined) => clampScore((((value ?? 1) - 1) / 3) * 100);
const scaleEightPoint = (value: AccommodationScaleValue | undefined) => clampScore((((value ?? 1) - 1) / 7) * 100);

function staminaLevel(level: StaminaLevel | undefined) {
  if (level === "low") return { level: "LOW" as const, score: 0 };
  if (level === "high") return { level: "HIGH" as const, score: 100 };
  return { level: "NORMAL" as const, score: 50 };
}

function buildAllocation(answers: PersonalPreferenceDraftAnswers) {
  const ranking = getBudgetRanking(answers);
  return Object.fromEntries(budgetCategories.map((category) => {
    const rankIndex = ranking.indexOf(category.id);
    return [category.id, rankIndex >= 0 ? budgetPriorityWeights[rankIndex] : 0];
  })) as Record<BudgetCategory, number>;
}

function buildItineraryMessagePreference(
  answers: PersonalPreferenceDraftAnswers,
  blocks: NonNullable<PersonalPreferenceDraftAnswers["itineraryDays"]>[number]["blocks"],
  legacyDensityScore: number,
) {
  const allocatedMinutes = Object.fromEntries(activityBlocks.map((activity) => [
    activity.id,
    blocks
      .filter((block) => block.activityId === activity.id)
      .reduce((total, block) => total + block.durationHours * 60, 0),
  ])) as Record<ActivityTagId, number>;
  const maxAllocatedMinutes = Math.max(...Object.values(allocatedMinutes), 0);
  const categoryScores = Object.fromEntries(activityBlocks.map((activity) => {
    const messageLevel = answers.itineraryMessageAnswers?.[activity.id];
    const legacyScore = maxAllocatedMinutes
      ? clampScore((allocatedMinutes[activity.id] / maxAllocatedMinutes) * 100)
      : 0;
    return [activity.id, messageLevel ? itineraryPreferenceLevelScores[messageLevel] : legacyScore];
  })) as Record<ActivityTagId, number>;
  const densityLevel = answers.itineraryMessageAnswers?.density;
  return {
    categoryScores,
    densityScore: densityLevel ? itineraryPreferenceLevelScores[densityLevel] : legacyDensityScore,
  };
}

export function calculateTravelPreferenceSurveyResult(
  userId: string,
  sourceAnswers: PersonalPreferenceDraftAnswers,
  completedAt = new Date().toISOString(),
): TravelPreferenceSurveyResult {
  const answers = normalizeTravelPreferenceSurveyAnswers(sourceAnswers);
  const validation = validateTravelPreferenceSurvey(answers);
  if (!validation.valid) throw new Error(validation.message);

  const days = answers.itineraryDays ?? [];
  const blocks = days.flatMap((day) => day.blocks);
  const scheduledMinutes = blocks.reduce((total, block) => total + block.durationHours * 60, 0);
  const restBlocks = blocks.filter((block) => block.activityId === "rest");
  const restMinutes = restBlocks.reduce((total, block) => total + block.durationHours * 60, 0);
  const activityMinutes = Math.max(0, scheduledMinutes - restMinutes);
  const scheduleSpanMinutes = days.length * itineraryHourSlots.length * 60;
  const legacyDensityScore = scheduleSpanMinutes ? clampScore((scheduledMinutes / scheduleSpanMinutes) * 100) : 0;
  const itineraryMessagePreference = buildItineraryMessagePreference(answers, blocks, legacyDensityScore);
  const landmarkBlocks = blocks.filter((block) => block.activityId === "attraction");
  const localBlocks = blocks.filter((block) => block.activityId === "local");
  const placeBlocks = blocks.filter((block) => block.activityId !== "rest");
  const landmarkImportance = scaleFourPoint(answers.landmarkImportance);
  const localInterest = scaleFourPoint(answers.localInterest);
  const challengeStylePreference = classifyChallengeStyle(answers.challengeStyleAnswers);
  const challengeScore = answers.adventure
    ? scaleFourPoint(answers.adventure)
    : challengeStylePreference.scores.exploration;
  const allocation = buildAllocation(answers);
  const budgetRanking = getBudgetRanking(answers);
  const staminaPreference = staminaLevel(answers.stamina);
  const scheduleStylePreference = deriveScheduleStylePreference({
    densityScore: itineraryMessagePreference.densityScore,
    restPreferenceScore: itineraryMessagePreference.categoryScores.rest,
    staminaScore: staminaPreference.score,
  });
  return {
    userId,
    surveyVersion: PERSONAL_SURVEY_DRAFT_VERSION,
    algorithmVersion: TRAVEL_PREFERENCE_ALGORITHM_VERSION,
    completedAt,
    answers,
    challengeStylePreference,
    scheduleStylePreference,
    itineraryMessagePreference,
    scheduleFeatures: {
      dayCount: days.length,
      scheduleSpanMinutes,
      scheduledMinutes,
      activityMinutes,
      restMinutes,
      freeTimeMinutes: Math.max(0, scheduleSpanMinutes - scheduledMinutes),
      blockCount: blocks.length,
      restBlockCount: restBlocks.length,
      averageStayMinutes: blocks.length ? Math.round(scheduledMinutes / blocks.length) : 0,
      averageDailyScheduledMinutes: days.length ? Math.round(scheduledMinutes / days.length) : 0,
      densityScore: itineraryMessagePreference.densityScore,
    },
    placeFeatures: {
      selectedPlaceCount: placeBlocks.length,
      selectedLandmarkCount: landmarkBlocks.length,
      selectedLocalPlaceCount: localBlocks.length,
      landmarkAllocatedMinutes: landmarkBlocks.reduce((total, block) => total + block.durationHours * 60, 0),
      localAllocatedMinutes: localBlocks.reduce((total, block) => total + block.durationHours * 60, 0),
      landmarkImportance,
      localInterest,
    },
    accommodationPreference: {
      stayImportance: scaleEightPoint(answers.accommodation?.stayMeaning),
      facilityOverLocation: scaleEightPoint(answers.accommodation?.locationFacility),
      // 화면 척도는 왼쪽이 편안함, 오른쪽이 가격이므로 API 의미에 맞게 방향을 뒤집는다.
      comfortOverPrice: 100 - scaleEightPoint(answers.accommodation?.comfortPrice),
    },
    challengePreference: {
      score: challengeScore,
      label: challengeScore >= 50 ? "LESS_VALIDATED" : "VALIDATED",
    },
    staminaPreference,
    spendingAllocation: {
      totalCoins: budgetCategories.reduce((total, category) => total + allocation[category.id], 0),
      allocation,
    },
    spendingPriority: { ranking: budgetRanking },
    discoveryPreference: { landmarkImportance, localInterest },
  };
}

export function calculateLegacyPreferenceProjection(
  userId: string,
  answers: PersonalPreferenceDraftAnswers,
  completedAt = new Date().toISOString(),
) {
  return calculatePersonalPreferenceResult(userId, deriveLegacyPreferenceAnswers(answers), completedAt);
}

export function buildDuriPreferenceSignals(result: TravelPreferenceSurveyResult) {
  return {
    surveyVersion: result.surveyVersion,
    algorithmVersion: result.algorithmVersion,
    staminaScore: result.staminaPreference.score,
    densityScore: result.itineraryMessagePreference.densityScore,
    scheduleStyle: result.scheduleStylePreference.type,
    preferredDailyScheduledMinutes: result.scheduleFeatures.averageDailyScheduledMinutes,
    preferredAverageStayMinutes: result.scheduleFeatures.averageStayMinutes,
    mobilityModes: [...(result.answers.mobilityModes ?? [])],
    categoryScores: { ...result.itineraryMessagePreference.categoryScores },
    budgetRanking: [...result.spendingPriority.ranking],
    landmarkImportance: result.discoveryPreference.landmarkImportance,
    localInterest: result.discoveryPreference.localInterest,
  };
}
