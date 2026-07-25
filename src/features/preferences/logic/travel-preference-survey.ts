import type { PersonalPreferenceAnswers, PreferenceScore } from "../../../domain";
import { itineraryMessageQuestions } from "../config/itinerary-message-questions";
import {
  accommodationAxes,
  activityBlocks,
  budgetCategories,
  itineraryHourSlots,
  mobilityOptions,
  preferenceSteps,
  staminaOptions,
} from "../config/travel-preference-test-config";
import type {
  AccommodationScaleValue,
  ActivityTagId,
  BudgetCategory,
  FourPointScaleValue,
  ItineraryBlock,
  ItineraryDay,
  ItineraryHourSlot,
  ItineraryPreferenceLevel,
  MobilityMode,
  PersonalPreferenceDraftAnswers,
  PreferenceStepId,
  StaminaLevel,
} from "../types";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isAccommodationScaleValue = (value: unknown): value is AccommodationScaleValue => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;
const isFourPointScaleValue = (value: unknown): value is FourPointScaleValue => value === 1 || value === 2 || value === 3 || value === 4;
const activityIds = new Set<ActivityTagId>(activityBlocks.map((block) => block.id));
const itineraryHourIds = new Set<ItineraryHourSlot>(itineraryHourSlots);
const mobilityIds = new Set<MobilityMode>(mobilityOptions.map((option) => option.id));
const staminaIds = new Set<StaminaLevel>(staminaOptions.map((option) => option.id));
const itineraryMessageQuestionIds = new Set(itineraryMessageQuestions.map((question) => question.id));
const itineraryPreferenceLevels = new Set<ItineraryPreferenceLevel>(["like", "neutral", "dislike"]);

export function createEmptyItineraryDay(index: number): ItineraryDay {
  return { id: `day-${index}`, blocks: [] };
}

export function getItineraryDays(answers: PersonalPreferenceDraftAnswers) {
  return answers.itineraryDays?.length ? answers.itineraryDays : [createEmptyItineraryDay(1)];
}

export function getItinerarySlotIndex(slot: ItineraryHourSlot) {
  return itineraryHourSlots.indexOf(slot);
}

export function getItinerarySlotAt(index: number) {
  return itineraryHourSlots[index];
}

export function canPlaceItineraryBlock(day: ItineraryDay, startIndex: number, durationHours: number, excludedBlockId?: string) {
  if (!Number.isInteger(startIndex) || !Number.isInteger(durationHours) || durationHours < 1 || startIndex < 0 || startIndex + durationHours > itineraryHourSlots.length) return false;
  const occupied = new Set(day.blocks.filter((block) => block.id !== excludedBlockId).flatMap((block) => {
    const blockStart = getItinerarySlotIndex(block.startSlot);
    return Array.from({ length: block.durationHours }, (_, offset) => blockStart + offset);
  }));
  return Array.from({ length: durationHours }, (_, offset) => startIndex + offset).every((index) => !occupied.has(index));
}

export function normalizeTravelPreferenceSurveyAnswers(value: unknown): PersonalPreferenceDraftAnswers {
  if (!isRecord(value)) return {};
  const answers: PersonalPreferenceDraftAnswers = {};

  if (Array.isArray(value.itineraryDays)) {
    const seenIds = new Set<string>();
    const itineraryDays = value.itineraryDays.flatMap((entry, index): ItineraryDay[] => {
      if (!isRecord(entry)) return [];
      const rawId = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `day-${index + 1}`;
      const id = seenIds.has(rawId) ? `day-${index + 1}` : rawId;
      seenIds.add(id);
      const rawBlocks: unknown[] = Array.isArray(entry.blocks)
        ? entry.blocks
        : isRecord(entry.slots)
          ? Object.entries(entry.slots).map(([slot, activity], slotIndex) => ({ id: `${id}-legacy-${slotIndex}`, startSlot: slot, activityId: activity, durationHours: 1 }))
          : [];
      const blocks: ItineraryBlock[] = [];
      const seenBlockIds = new Set<string>();
      rawBlocks.forEach((rawBlock, blockIndex) => {
        if (!isRecord(rawBlock)) return;
        const activityId = rawBlock.activityId;
        const startSlot = rawBlock.startSlot;
        const durationHours = typeof rawBlock.durationHours === "number" && Number.isFinite(rawBlock.durationHours) ? Math.round(rawBlock.durationHours) : 1;
        if (typeof activityId !== "string" || !activityIds.has(activityId as ActivityTagId) || typeof startSlot !== "string" || !itineraryHourIds.has(startSlot as ItineraryHourSlot)) return;
        const rawBlockId = typeof rawBlock.id === "string" && rawBlock.id.trim() ? rawBlock.id.trim() : `${id}-block-${blockIndex + 1}`;
        const blockId = seenBlockIds.has(rawBlockId) ? `${id}-block-${blockIndex + 1}` : rawBlockId;
        const candidate: ItineraryBlock = { id: blockId, activityId: activityId as ActivityTagId, startSlot: startSlot as ItineraryHourSlot, durationHours };
        if (!canPlaceItineraryBlock({ id, blocks }, getItinerarySlotIndex(candidate.startSlot), candidate.durationHours)) return;
        seenBlockIds.add(blockId);
        blocks.push(candidate);
      });
      return [{ id, blocks }];
    });
    if (itineraryDays.length) answers.itineraryDays = itineraryDays;
  }

  if (isRecord(value.itineraryMessageAnswers)) {
    const itineraryMessageAnswers = Object.fromEntries(
      Object.entries(value.itineraryMessageAnswers).filter(([questionId, level]) => (
        itineraryMessageQuestionIds.has(questionId as typeof itineraryMessageQuestions[number]["id"])
        && typeof level === "string"
        && itineraryPreferenceLevels.has(level as ItineraryPreferenceLevel)
      )),
    );
    if (Object.keys(itineraryMessageAnswers).length) answers.itineraryMessageAnswers = itineraryMessageAnswers;
  }

  if (Array.isArray(value.mobilityModes)) {
    answers.mobilityModes = [...new Set(value.mobilityModes.filter((mode): mode is MobilityMode => typeof mode === "string" && mobilityIds.has(mode as MobilityMode)))];
  }

  if (isRecord(value.accommodation)) {
    const source = value.accommodation;
    const accommodation = Object.fromEntries(accommodationAxes.flatMap((axis) => {
      const score = source[axis.id];
      return isAccommodationScaleValue(score) ? [[axis.id, score]] : [];
    }));
    if (Object.keys(accommodation).length) answers.accommodation = accommodation;
  }

  if (isFourPointScaleValue(value.adventure)) answers.adventure = value.adventure;
  if (typeof value.stamina === "string" && staminaIds.has(value.stamina as StaminaLevel)) answers.stamina = value.stamina as StaminaLevel;

  if (isRecord(value.budgetAllocation)) {
    const source = value.budgetAllocation;
    const budgetAllocation = Object.fromEntries(budgetCategories.map((category) => {
      const rawAmount = source[category.id];
      const amount = typeof rawAmount === "number" && Number.isFinite(rawAmount)
        ? Math.max(0, Math.min(100, Math.round(rawAmount / 5) * 5))
        : 0;
      return [category.id, amount];
    })) as Record<BudgetCategory, number>;
    answers.budgetAllocation = budgetAllocation;
  }

  if (isFourPointScaleValue(value.landmarkImportance)) answers.landmarkImportance = value.landmarkImportance;
  if (isFourPointScaleValue(value.localInterest)) answers.localInterest = value.localInterest;
  return answers;
}

export function getFilledItineraryCount(answers: PersonalPreferenceDraftAnswers) {
  return getItineraryDays(answers).reduce((total, day) => total + day.blocks.reduce((dayTotal, block) => dayTotal + block.durationHours, 0), 0);
}

export function getItineraryMessageAnswerCount(answers: PersonalPreferenceDraftAnswers) {
  return itineraryMessageQuestions.filter((question) => answers.itineraryMessageAnswers?.[question.id]).length;
}

export function isItineraryMessageSurveyComplete(answers: PersonalPreferenceDraftAnswers) {
  return getItineraryMessageAnswerCount(answers) === itineraryMessageQuestions.length;
}

export function getBudgetTotal(answers: PersonalPreferenceDraftAnswers) {
  return budgetCategories.reduce((total, category) => total + (answers.budgetAllocation?.[category.id] ?? 0), 0);
}

export function isPreferenceStepComplete(stepId: PreferenceStepId, answers: PersonalPreferenceDraftAnswers) {
  switch (stepId) {
    case "itinerary": return isItineraryMessageSurveyComplete(answers) || getFilledItineraryCount(answers) > 0;
    case "mobility": return Boolean(answers.mobilityModes?.length);
    case "accommodation": return accommodationAxes.every((axis) => isAccommodationScaleValue(answers.accommodation?.[axis.id]));
    case "adventure": return isFourPointScaleValue(answers.adventure);
    case "stamina": return Boolean(answers.stamina);
    case "budget": return getBudgetTotal(answers) === 100;
    case "discovery": return isFourPointScaleValue(answers.landmarkImportance) && isFourPointScaleValue(answers.localInterest);
  }
}

export function getCompletedPreferenceStepCount(answers: PersonalPreferenceDraftAnswers) {
  return preferenceSteps.filter((step) => isPreferenceStepComplete(step.id, answers)).length;
}

export type TravelPreferenceSurveyValidation =
  | { valid: true; answers: PersonalPreferenceDraftAnswers }
  | { valid: false; message: string; firstInvalidStepIndex: number };

export function validateTravelPreferenceSurvey(answers: PersonalPreferenceDraftAnswers): TravelPreferenceSurveyValidation {
  const firstInvalidStepIndex = preferenceSteps.findIndex((step) => !isPreferenceStepComplete(step.id, answers));
  if (firstInvalidStepIndex < 0) return { valid: true, answers };
  const step = preferenceSteps[firstInvalidStepIndex];
  const message = step.id === "itinerary"
    ? `여행 활동과 일정 밀도 대화에 모두 답해 주세요. 현재 ${getItineraryMessageAnswerCount(answers)} / ${itineraryMessageQuestions.length}개에 답했어요.`
    : step.id === "budget"
    ? `여행 코인을 100개 모두 배분해 주세요. 현재 ${getBudgetTotal(answers)}개를 배분했어요.`
    : `${step.eyebrow} 항목의 응답을 완료해 주세요.`;
  return { valid: false, message, firstInvalidStepIndex };
}

function asLegacyScore(value: number): PreferenceScore {
  if (value <= 0) return 0;
  if (value >= 2) return 2;
  return 1;
}

export function deriveLegacyPreferenceAnswers(answers: PersonalPreferenceDraftAnswers): PersonalPreferenceAnswers {
  const averageFilledHours = getFilledItineraryCount(answers) / getItineraryDays(answers).length;
  const legacyItineraryScore = averageFilledHours <= 4 ? 0 : averageFilledHours <= 9 ? 1 : 2;
  const itineraryScore = answers.itineraryMessageAnswers?.density === "like"
    ? 2
    : answers.itineraryMessageAnswers?.density === "dislike"
      ? 0
      : answers.itineraryMessageAnswers?.density === "neutral" ? 1 : legacyItineraryScore;
  const staminaScore = answers.stamina === "low" ? 0 : answers.stamina === "high" ? 2 : 1;
  const drivingModes: MobilityMode[] = ["ownCar", "rentalCar"];
  const transitModes: MobilityMode[] = ["bus", "subway", "train", "taxi"];
  const mobilityScore = answers.mobilityModes?.some((mode) => drivingModes.includes(mode))
    ? 2
    : answers.mobilityModes?.some((mode) => transitModes.includes(mode)) ? 1 : 0;
  const foodCoins = answers.budgetAllocation?.food ?? 0;
  const mealScore = foodCoins <= 10 ? 0 : foodCoins >= 30 ? 2 : 1;
  const planningScore = answers.adventure === 1 ? 0 : answers.adventure === 4 ? 2 : 1;

  return {
    pace: itineraryScore,
    budget: 1,
    mobility: mobilityScore,
    activity: asLegacyScore(Math.round((itineraryScore + staminaScore) / 2)),
    mealStyle: mealScore,
    planningStyle: planningScore,
  };
}

const scaleText = (value: number | undefined, max: number) => value ? `${value} / ${max}` : "미응답";

export function formatPreferenceStepAnswer(stepId: PreferenceStepId, answers: PersonalPreferenceDraftAnswers) {
  switch (stepId) {
    case "itinerary": {
      const messageAnswerCount = getItineraryMessageAnswerCount(answers);
      return messageAnswerCount
        ? `${messageAnswerCount} / ${itineraryMessageQuestions.length}개 대화 응답`
        : `${getItineraryDays(answers).length}일 · ${getFilledItineraryCount(answers)}시간 일정`;
    }
    case "mobility": return mobilityOptions.filter((option) => answers.mobilityModes?.includes(option.id)).map((option) => option.label).join(" · ") || "미응답";
    case "accommodation": return `${accommodationAxes.filter((axis) => answers.accommodation?.[axis.id]).length} / ${accommodationAxes.length}개 기준 응답`;
    case "adventure": return scaleText(answers.adventure, 4);
    case "stamina": return staminaOptions.find((option) => option.id === answers.stamina)?.label ?? "미응답";
    case "budget": {
      const top = [...budgetCategories]
        .sort((left, right) => (answers.budgetAllocation?.[right.id] ?? 0) - (answers.budgetAllocation?.[left.id] ?? 0))
        .slice(0, 2)
        .map((category) => `${category.label} ${answers.budgetAllocation?.[category.id] ?? 0}`);
      return getBudgetTotal(answers) === 100 ? top.join(" · ") : `${getBudgetTotal(answers)} / 100개 배분`;
    }
    case "discovery": return `명소 ${scaleText(answers.landmarkImportance, 4)} · 로컬 ${scaleText(answers.localInterest, 4)}`;
  }
}
