import type { ItineraryItem, Place } from "../../domain";
import { DURI_ANALYSIS_CONFIG } from "./config";
import { categoryStatusFromIssues, getItemEndMinutes, groupItineraryByDate, insufficientCategory, normalizeTrait } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";
import { timeStringToMinutes } from "../../utils/schedule";
import { buildGroupProfileEvidence } from "../group-preferences";

const mealCategoryKeywords = ["음식점", "식당", "레스토랑", "한식", "양식", "일식", "중식", "분식"];
const mealTagKeywords = ["음식", "맛집", "식사", "브런치", "한식", "양식", "일식", "중식", "분식"];
const explicitMealNameKeywords = ["식당", "레스토랑", "국밥", "횟집", "분식점"];

export function isMealPlace(place: Place) {
  const category = normalizeTrait(place.category);
  const tags = place.tags.map(normalizeTrait);
  const name = normalizeTrait(place.name);
  return (
    mealCategoryKeywords.some((keyword) => category.includes(normalizeTrait(keyword))) ||
    mealTagKeywords.some((keyword) => tags.some((tag) => tag.includes(normalizeTrait(keyword)))) ||
    explicitMealNameKeywords.some((keyword) => name.includes(normalizeTrait(keyword)))
  );
}

export function isMealItem(item: ItineraryItem, placesById: DuriAnalysisInput["placesById"]) {
  if (item.itemType === "meal") return true;
  const place = item.placeId ? placesById[item.placeId] : undefined;
  return place ? isMealPlace(place) : false;
}

export function analyzeMeals(input: DuriAnalysisInput): CategoryAnalysisResult {
  if (!input.itinerary.length) return insufficientCategory("meal", "일정 시간대가 없어 식사 누락 여부를 확인할 수 없어요.");
  const issues: AnalysisIssue[] = [];
  const mealCandidateCount = input.candidates.filter((candidate) => {
    const place = input.placesById[candidate.placeId];
    return place ? isMealPlace(place) : false;
  }).length;
  let checkedWindowCount = 0;
  const groupEvidence = buildGroupProfileEvidence(input.groupPlanningProfile, "mealStyle");

  for (const [date, items] of groupItineraryByDate(input.itinerary)) {
    if (!items.length) continue;
    const firstStart = Math.min(...items.map((item) => timeStringToMinutes(item.startTime)));
    const lastEnd = Math.max(...items.map(getItemEndMinutes));
    const mealRanges = [
      ...(firstStart <= DURI_ANALYSIS_CONFIG.meal.breakfast.end ? [DURI_ANALYSIS_CONFIG.meal.breakfast] : []),
      DURI_ANALYSIS_CONFIG.meal.lunch,
      DURI_ANALYSIS_CONFIG.meal.dinner,
    ].filter((timeRange) => firstStart < timeRange.end && lastEnd > timeRange.start);

    for (const timeRange of mealRanges) {
      checkedWindowCount += 1;
      const matchingItems = items.filter((item) => {
        if (!isMealItem(item, input.placesById)) return false;
        const start = timeStringToMinutes(item.startTime);
        return start < timeRange.end && timeRange.start < getItemEndMinutes(item);
      });
      if (matchingItems.length) continue;

      const adjacent = items
        .filter((item) => timeStringToMinutes(item.startTime) < timeRange.end && getItemEndMinutes(item) > timeRange.start - 60)
        .slice(0, 3);
      issues.push({
        id: `meal-${date}-${timeRange.label}`,
        category: "meal",
        status: "attention",
        severity: timeRange.label === "아침" ? "low" : "medium",
        title: `${timeRange.label} 일정이 비어 있어요`,
        summary: `${date} ${Math.floor(timeRange.start / 60)}:${String(timeRange.start % 60).padStart(2, "0")}–${Math.floor(timeRange.end / 60)}:${String(timeRange.end % 60).padStart(2, "0")} 사이에 명확한 식사 일정이 없어요.`,
        date,
        affectedItemIds: adjacent.map((item) => item.id),
        affectedPlaceIds: adjacent.flatMap((item) => (item.placeId ? [item.placeId] : [])),
        affectedMemberIds: [],
        evidence: [
          { label: "누락 식사", value: timeRange.label },
          { label: "검사 시간대", value: `${Math.floor(timeRange.start / 60)}:${String(timeRange.start % 60).padStart(2, "0")}–${Math.floor(timeRange.end / 60)}:${String(timeRange.end % 60).padStart(2, "0")}`, itemIds: adjacent.map((item) => item.id) },
          { label: "식사 후보 장소", value: `${mealCandidateCount}곳`, placeIds: input.candidates.flatMap((candidate) => (input.placesById[candidate.placeId] && isMealPlace(input.placesById[candidate.placeId]) ? [candidate.placeId] : [])) },
          ...groupEvidence,
        ],
      });
    }
  }

  if (!checkedWindowCount) return insufficientCategory("meal", "현재 일정 범위가 식사 시간대를 지나지 않아 누락 여부를 판단하지 않았어요.");
  if (!issues.length) {
    issues.push({
      id: "meal-coverage",
      category: "meal",
      status: "good",
      severity: "info",
      title: "검사한 식사 시간대가 일정에 반영되어 있어요",
      summary: `${checkedWindowCount}개 식사 시간대에서 명확한 식사 일정을 확인했어요.`,
      affectedItemIds: input.itinerary.filter((item) => isMealItem(item, input.placesById)).map((item) => item.id),
      affectedPlaceIds: input.itinerary.flatMap((item) => (item.placeId && isMealItem(item, input.placesById) ? [item.placeId] : [])),
      affectedMemberIds: [],
      evidence: [{ label: "검사한 식사 시간대", value: `${checkedWindowCount}개` }, ...groupEvidence],
    });
  }
  const status = categoryStatusFromIssues(issues);
  return { category: "meal", status, summary: status === "good" ? "현재 일정 범위의 식사 시간이 반영되어 있어요." : `${issues.filter((issue) => issue.severity !== "info").length}개 식사 시간대를 확인해 주세요.`, issues };
}
