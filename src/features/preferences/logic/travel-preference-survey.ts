import type { PersonalPreferenceAnswers, PreferenceScore } from "../../../domain";
import { challengeStyleQuestions } from "../config/challenge-style-questions";
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
  ChallengeStyleQuestionId,
  FivePointScaleValue,
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
const isFivePointScaleValue = (value: unknown): value is FivePointScaleValue => value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
const activityIds = new Set<ActivityTagId>(activityBlocks.map((block) => block.id));
const itineraryHourIds = new Set<ItineraryHourSlot>(itineraryHourSlots);
const mobilityIds = new Set<MobilityMode>(mobilityOptions.map((option) => option.id));
const staminaIds = new Set<StaminaLevel>(staminaOptions.map((option) => option.id));
const budgetCategoryIds = new Set<BudgetCategory>(budgetCategories.map((category) => category.id));
const itineraryMessageQuestionIds = new Set(itineraryMessageQuestions.map((question) => question.id));
const itineraryPreferenceLevels = new Set<ItineraryPreferenceLevel>(["like", "neutral", "dislike"]);
const challengeStyleQuestionIds = new Set<ChallengeStyleQuestionId>(challengeStyleQuestions.map((question) => question.id));

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

  if (isRecord(value.challengeStyleAnswers)) {
    const challengeStyleAnswers = Object.fromEntries(
      Object.entries(value.challengeStyleAnswers).filter(([questionId, response]) => (
        challengeStyleQuestionIds.has(questionId as ChallengeStyleQuestionId)
        && isFivePointScaleValue(response)
      )),
    ) as Partial<Record<ChallengeStyleQuestionId, FivePointScaleValue>>;
    if (Object.keys(challengeStyleAnswers).length) answers.challengeStyleAnswers = challengeStyleAnswers;
  }

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

  if (Array.isArray(value.budgetRanking)) {
    const budgetRanking = [...new Set(value.budgetRanking.filter((category): category is BudgetCategory => (
      typeof category === "string" && budgetCategoryIds.has(category as BudgetCategory)
    )))];
    if (budgetRanking.length) answers.budgetRanking = budgetRanking;
  }

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
    if (!answers.budgetRanking && Object.values(budgetAllocation).reduce((total, amount) => total + amount, 0) === 100) {
      answers.budgetRanking = deriveBudgetRankingFromAllocation(budgetAllocation);
    }
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

export function getChallengeStyleAnswerCount(answers: PersonalPreferenceDraftAnswers) {
  return challengeStyleQuestions.filter((question) => answers.challengeStyleAnswers?.[question.id]).length;
}

export function isChallengeStyleSurveyComplete(answers: PersonalPreferenceDraftAnswers) {
  return getChallengeStyleAnswerCount(answers) === challengeStyleQuestions.length;
}

export function isItineraryMessageSurveyComplete(answers: PersonalPreferenceDraftAnswers) {
  return getItineraryMessageAnswerCount(answers) === itineraryMessageQuestions.length;
}

export function getBudgetTotal(answers: PersonalPreferenceDraftAnswers) {
  return budgetCategories.reduce((total, category) => total + (answers.budgetAllocation?.[category.id] ?? 0), 0);
}

function deriveBudgetRankingFromAllocation(allocation: Partial<Record<BudgetCategory, number>>) {
  return budgetCategories
    .map((category, index) => ({ id: category.id, index, amount: allocation[category.id] ?? 0 }))
    .sort((left, right) => right.amount - left.amount || left.index - right.index)
    .map((entry) => entry.id);
}

export function getBudgetRanking(answers: PersonalPreferenceDraftAnswers) {
  const ranking = [...new Set((answers.budgetRanking ?? []).filter((category) => budgetCategoryIds.has(category)))];
  if (ranking.length) return ranking;
  return getBudgetTotal(answers) === 100
    ? deriveBudgetRankingFromAllocation(answers.budgetAllocation ?? {})
    : [];
}

export function isBudgetRankingComplete(answers: PersonalPreferenceDraftAnswers) {
  return getBudgetRanking(answers).length === budgetCategories.length;
}

export function isPreferenceStepComplete(stepId: PreferenceStepId, answers: PersonalPreferenceDraftAnswers) {
  switch (stepId) {
    case "challengeStyle": return isChallengeStyleSurveyComplete(answers) && (isItineraryMessageSurveyComplete(answers) || getFilledItineraryCount(answers) > 0);
    case "itinerary": return isItineraryMessageSurveyComplete(answers) || getFilledItineraryCount(answers) > 0;
    case "mobility": return Boolean(answers.mobilityModes?.length);
    case "accommodation": return accommodationAxes.every((axis) => isAccommodationScaleValue(answers.accommodation?.[axis.id]));
    case "adventure": return isFourPointScaleValue(answers.adventure);
    case "stamina": return Boolean(answers.stamina);
    case "budget": return isBudgetRankingComplete(answers);
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
  const message = step.id === "challengeStyle"
    ? `여행 메이트의 질문에 모두 답해 주세요. 현재 ${getChallengeStyleAnswerCount(answers) + getItineraryMessageAnswerCount(answers)} / ${challengeStyleQuestions.length + itineraryMessageQuestions.length}개에 답했어요.`
    : step.id === "itinerary"
    ? `여행 활동과 일정 밀도 대화에 모두 답해 주세요. 현재 ${getItineraryMessageAnswerCount(answers)} / ${itineraryMessageQuestions.length}개에 답했어요.`
    : step.id === "budget"
    ? `여행 예산의 우선순위를 모두 정해 주세요. 현재 ${getBudgetRanking(answers).length} / ${budgetCategories.length}개를 골랐어요.`
    : `${step.title} 항목의 응답을 완료해 주세요.`;
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
  const mobilityScore = !answers.mobilityModes?.length
    ? 1
    : answers.mobilityModes.some((mode) => drivingModes.includes(mode))
      ? 2
      : answers.mobilityModes.some((mode) => transitModes.includes(mode)) ? 1 : 0;
  const foodRank = getBudgetRanking(answers).indexOf("food");
  const mealScore = foodRank < 0 ? 1 : foodRank === 0 ? 2 : foodRank <= 2 ? 1 : 0;
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
    case "challengeStyle": {
      const messageAnswerCount = getItineraryMessageAnswerCount(answers);
      return messageAnswerCount
        ? `${getChallengeStyleAnswerCount(answers) + messageAnswerCount} / ${challengeStyleQuestions.length + itineraryMessageQuestions.length}개 대화 응답`
        : getFilledItineraryCount(answers) > 0
          ? `${getChallengeStyleAnswerCount(answers)} / ${challengeStyleQuestions.length}개 성향 · 기존 일정 응답`
          : `${getChallengeStyleAnswerCount(answers)} / ${challengeStyleQuestions.length + itineraryMessageQuestions.length}개 대화 응답`;
    }
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
      const ranking = getBudgetRanking(answers);
      const top = ranking.slice(0, 2).map((categoryId, index) => {
        const category = budgetCategories.find((entry) => entry.id === categoryId);
        return `${index + 1}순위 ${category?.label ?? categoryId}`;
      });
      return isBudgetRankingComplete(answers) ? top.join(" · ") : `${ranking.length} / ${budgetCategories.length}개 순위 선택`;
    }
    case "discovery": return `명소 ${scaleText(answers.landmarkImportance, 4)} · 로컬 ${scaleText(answers.localInterest, 4)}`;
  }
}
