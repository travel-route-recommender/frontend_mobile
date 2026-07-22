import { calculatePersonalPreferenceResult } from "../../../duri/preferences";
import { PERSONAL_SURVEY_DRAFT_VERSION, budgetCategories, itineraryHourSlots, mobilityOptions } from "../config/travel-preference-test-config";
import type {
  AccommodationScaleValue,
  BudgetCategory,
  FourPointScaleValue,
  MobilityMode,
  PersonalPreferenceDraftAnswers,
  StaminaLevel,
  TravelPreferenceSurveyResult,
} from "../types";
import {
  deriveLegacyPreferenceAnswers,
  getItineraryDays,
  normalizeTravelPreferenceSurveyAnswers,
  validateTravelPreferenceSurvey,
} from "./travel-preference-survey";

export const TRAVEL_PREFERENCE_ALGORITHM_VERSION = 1;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const scaleFourPoint = (value: FourPointScaleValue | undefined) => clampScore((((value ?? 1) - 1) / 3) * 100);
const scaleEightPoint = (value: AccommodationScaleValue | undefined) => clampScore((((value ?? 1) - 1) / 7) * 100);

function staminaLevel(level: StaminaLevel | undefined) {
  if (level === "low") return { level: "LOW" as const, score: 0 };
  if (level === "high") return { level: "HIGH" as const, score: 100 };
  return { level: "NORMAL" as const, score: 50 };
}

function buildAllocation(answers: PersonalPreferenceDraftAnswers) {
  return Object.fromEntries(budgetCategories.map((category) => [category.id, answers.budgetAllocation?.[category.id] ?? 0])) as Record<BudgetCategory, number>;
}

function buildTransportPreferences(answers: PersonalPreferenceDraftAnswers) {
  return Object.fromEntries(mobilityOptions.map((mode) => [mode.id, answers.mobilityModes?.includes(mode.id) ? 100 : 0])) as Record<MobilityMode, number>;
}

export function calculateTravelPreferenceSurveyResult(
  userId: string,
  sourceAnswers: PersonalPreferenceDraftAnswers,
  completedAt = new Date().toISOString(),
): TravelPreferenceSurveyResult {
  const answers = normalizeTravelPreferenceSurveyAnswers(sourceAnswers);
  const validation = validateTravelPreferenceSurvey(answers);
  if (!validation.valid) throw new Error(validation.message);

  const days = getItineraryDays(answers);
  const blocks = days.flatMap((day) => day.blocks);
  const scheduledMinutes = blocks.reduce((total, block) => total + block.durationHours * 60, 0);
  const restBlocks = blocks.filter((block) => block.activityId === "rest");
  const restMinutes = restBlocks.reduce((total, block) => total + block.durationHours * 60, 0);
  const activityMinutes = Math.max(0, scheduledMinutes - restMinutes);
  const scheduleSpanMinutes = days.length * itineraryHourSlots.length * 60;
  const landmarkBlocks = blocks.filter((block) => block.activityId === "attraction");
  const localBlocks = blocks.filter((block) => block.activityId === "local");
  const placeBlocks = blocks.filter((block) => block.activityId !== "rest");
  const landmarkImportance = scaleFourPoint(answers.landmarkImportance);
  const localInterest = scaleFourPoint(answers.localInterest);
  const challengeScore = scaleFourPoint(answers.adventure);
  const allocation = buildAllocation(answers);
  return {
    userId,
    surveyVersion: PERSONAL_SURVEY_DRAFT_VERSION,
    algorithmVersion: TRAVEL_PREFERENCE_ALGORITHM_VERSION,
    completedAt,
    answers,
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
      densityScore: scheduleSpanMinutes ? clampScore((scheduledMinutes / scheduleSpanMinutes) * 100) : 0,
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
    transportPreferences: buildTransportPreferences(answers),
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
    staminaPreference: staminaLevel(answers.stamina),
    spendingAllocation: {
      totalCoins: budgetCategories.reduce((total, category) => total + allocation[category.id], 0),
      allocation,
    },
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
