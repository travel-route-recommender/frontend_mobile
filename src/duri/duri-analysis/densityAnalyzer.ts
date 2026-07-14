import { DURI_ANALYSIS_CONFIG } from "./config";
import { categoryStatusFromIssues, getItemEndMinutes, groupItineraryByDate, insufficientCategory } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";
import { timeStringToMinutes } from "../../utils/schedule";
import { buildGroupProfileEvidence, canAdjustGroupThreshold, getGroupDimensionTone } from "../group-preferences";

export function analyzeDensity(input: DuriAnalysisInput): CategoryAnalysisResult {
  if (input.itinerary.length < 2) return insufficientCategory("density", "일정이 더 모이면 하루 활동량과 휴식 간격을 분석할 수 있어요.");
  const issues: AnalysisIssue[] = [];
  let analyzableDayCount = 0;
  let analyzableItemCount = 0;
  let densePlaceCount: number = DURI_ANALYSIS_CONFIG.density.densePlaceCount;
  let denseActiveMinutes: number = DURI_ANALYSIS_CONFIG.density.denseActiveMinutes;
  let maxConsecutiveItems: number = DURI_ANALYSIS_CONFIG.density.maxConsecutiveItemsWithoutBreak;
  let longActivityStreakMinutes: number = DURI_ANALYSIS_CONFIG.density.longActivityStreakMinutes;
  if (canAdjustGroupThreshold(input.groupPlanningProfile, "pace")) {
    const tone = getGroupDimensionTone(input.groupPlanningProfile, "pace");
    if (tone === "low") {
      densePlaceCount -= 1;
      denseActiveMinutes -= 30;
      longActivityStreakMinutes -= 30;
    } else if (tone === "high") {
      densePlaceCount += 1;
      denseActiveMinutes += 30;
      longActivityStreakMinutes += 30;
      maxConsecutiveItems += 1;
    }
  }
  if (canAdjustGroupThreshold(input.groupPlanningProfile, "activity")) {
    const tone = getGroupDimensionTone(input.groupPlanningProfile, "activity");
    if (tone === "low") {
      maxConsecutiveItems = Math.max(maxConsecutiveItems - 1, 2);
      longActivityStreakMinutes -= 30;
    } else if (tone === "high") {
      longActivityStreakMinutes += 30;
    }
  }
  const groupEvidence = [
    ...buildGroupProfileEvidence(input.groupPlanningProfile, "pace"),
    ...buildGroupProfileEvidence(input.groupPlanningProfile, "activity"),
    ...buildGroupProfileEvidence(input.groupPlanningProfile, "planningStyle"),
  ];

  for (const [date, dayItems] of groupItineraryByDate(input.itinerary)) {
    const items = dayItems.filter((item) => Number.isFinite(timeStringToMinutes(item.startTime)) && item.durationMinutes > 0);
    if (!items.length) continue;
    analyzableDayCount += 1;
    analyzableItemCount += items.length;
    const placeCount = items.filter((item) => item.itemType === "place").length;
    const occupiedMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0);
    const firstStart = timeStringToMinutes(items[0].startTime);
    const lastEnd = Math.max(...items.map(getItemEndMinutes));
    const gaps = items.slice(1).map((item, index) => Math.max(timeStringToMinutes(item.startTime) - getItemEndMinutes(items[index]), 0));
    const meaningfulBreaks = gaps.filter((gap) => gap >= DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes).length + items.filter((item) => item.itemType === "rest").length;

    let streakCount = 0;
    let streakMinutes = 0;
    let maxStreakCount = 0;
    let maxStreakMinutes = 0;
    items.forEach((item, index) => {
      const previousGap = index ? gaps[index - 1] : Number.POSITIVE_INFINITY;
      if (item.itemType === "rest" || previousGap >= DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes) {
        streakCount = 0;
        streakMinutes = 0;
      }
      if (item.itemType !== "rest" && item.itemType !== "transport") {
        streakCount += 1;
        streakMinutes += item.durationMinutes + (index && previousGap < DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes ? previousGap : 0);
        maxStreakCount = Math.max(maxStreakCount, streakCount);
        maxStreakMinutes = Math.max(maxStreakMinutes, streakMinutes);
      }
    });

    const veryDense = placeCount >= DURI_ANALYSIS_CONFIG.density.veryDensePlaceCount || occupiedMinutes >= DURI_ANALYSIS_CONFIG.density.veryDenseActiveMinutes;
    const dense = placeCount >= densePlaceCount || occupiedMinutes >= denseActiveMinutes;
    const longStreak = maxStreakCount > maxConsecutiveItems || maxStreakMinutes >= longActivityStreakMinutes;
    const needsAttention = dense || longStreak;
    issues.push({
      id: `density-${date}`,
      category: "density",
      status: veryDense ? "warning" : needsAttention ? "attention" : "good",
      severity: veryDense ? "high" : needsAttention ? "medium" : "info",
      title: veryDense ? "일정 밀도가 매우 높아요" : needsAttention ? "휴식 간격을 확인해 주세요" : "활동과 휴식 사이에 여유가 있어요",
      summary: needsAttention ? `${date}에 장소 ${placeCount}개, 최대 ${maxStreakMinutes}분 연속 활동이 예정되어 있어요.` : `${date}에는 의미 있는 휴식 구간 ${meaningfulBreaks}개가 있어요.`,
      date,
      affectedItemIds: items.map((item) => item.id),
      affectedPlaceIds: items.flatMap((item) => (item.placeId ? [item.placeId] : [])),
      affectedMemberIds: [],
      evidence: [
        { label: "장소 일정", value: `${placeCount}개`, itemIds: items.map((item) => item.id) },
        { label: "일정 점유시간", value: `${Math.round(occupiedMinutes / 30) / 2}시간` },
        { label: "일정 범위·휴식", value: `${Math.floor(firstStart / 60)}:${String(firstStart % 60).padStart(2, "0")}–${Math.floor(lastEnd / 60)}:${String(lastEnd % 60).padStart(2, "0")} · 45분 이상 ${meaningfulBreaks}회` },
        ...groupEvidence,
      ],
    });
  }

  if (!analyzableDayCount || analyzableItemCount < 2) return insufficientCategory("density", "유효한 일정 시간 정보가 부족해 밀도를 분석할 수 없어요.");
  const status = categoryStatusFromIssues(issues);
  return { category: "density", status, summary: status === "good" ? "현재 일정에는 활동 사이 여유가 있어요." : "활동 수와 연속 활동 시간을 함께 조정해 보세요.", issues };
}
