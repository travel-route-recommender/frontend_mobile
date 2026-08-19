import { DURI_ANALYSIS_CONFIG } from "./config";
import { categoryStatusFromIssues, getItemEndMinutes, groupItineraryByDate, insufficientCategory } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";
import { timeStringToMinutes } from "../../utils/schedule";
import { buildGroupProfileEvidence, canAdjustGroupThreshold, getGroupDimensionTone } from "../group-preferences";

function routeMinutesBetween(
  input: Pick<DuriAnalysisInput, "trip" | "routeLegEstimates">,
  fromItemId: string,
  toItemId: string,
  date: string,
) {
  const estimate = (input.routeLegEstimates ?? [])
    .filter((entry) => entry.fromItemId === fromItemId
      && entry.toItemId === toItemId
      && entry.date === date
      && entry.mode === input.trip.transport
      && Number.isFinite(entry.durationSeconds)
      && entry.durationSeconds >= 0
      && Number.isFinite(Date.parse(entry.fetchedAt)))
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
  return estimate ? Math.ceil(estimate.durationSeconds / 60) : undefined;
}

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
    const adjustedGaps = items.slice(1).map((item, index) => {
      const previous = items[index];
      const rawGapMinutes = gaps[index];
      const routeMinutes = previous.placeId && item.placeId
        ? routeMinutesBetween(input, previous.id, item.id, date)
        : undefined;
      return {
        idleMinutes: routeMinutes === undefined ? rawGapMinutes : Math.max(0, rawGapMinutes - routeMinutes),
        routeAdjusted: routeMinutes !== undefined,
      };
    });
    const meaningfulBreaks = adjustedGaps
      .filter((gap) => gap.idleMinutes >= DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes).length
      + items.filter((item) => item.itemType === "rest").length;
    const routeAdjustedGapCount = adjustedGaps.filter((gap) => gap.routeAdjusted).length;

    let streakCount = 0;
    let streakMinutes = 0;
    let maxStreakCount = 0;
    let maxStreakMinutes = 0;
    items.forEach((item, index) => {
      const previousIdleGap = index ? adjustedGaps[index - 1].idleMinutes : Number.POSITIVE_INFINITY;
      if (item.itemType === "rest" || previousIdleGap >= DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes) {
        streakCount = 0;
        streakMinutes = 0;
      }
      if (item.itemType !== "rest" && item.itemType !== "transport") {
        streakCount += 1;
        // 실제 이동으로 설명되는 긴 공백은 휴식으로 끊지 않는다. 휴식으로
        // 확인되지 않은 전체 공백은 이동·대기 활동시간으로 연속 구간에 포함한다.
        streakMinutes += item.durationMinutes
          + (index && previousIdleGap < DURI_ANALYSIS_CONFIG.density.minMeaningfulBreakMinutes ? gaps[index - 1] : 0);
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
      title: veryDense ? "일정 밀도가 매우 높아요" : needsAttention ? "휴식 간격을 확인해 주세요" : meaningfulBreaks ? "이동시간을 제외해도 휴식 여유가 있어요" : "현재 일정 밀도는 높지 않아요",
      summary: needsAttention ? `${date}에 장소 ${placeCount}개, 최대 ${maxStreakMinutes}분 연속 활동이 예정되어 있어요.` : `${date}에는 이동시간을 제외해 확인한 의미 있는 휴식 구간 ${meaningfulBreaks}개가 있어요.`,
      date,
      affectedItemIds: items.map((item) => item.id),
      affectedPlaceIds: items.flatMap((item) => (item.placeId ? [item.placeId] : [])),
      affectedMemberIds: [],
      evidence: [
        { label: "장소 일정", value: `${placeCount}개`, itemIds: items.map((item) => item.id) },
        { label: "일정 점유시간", value: `${Math.round(occupiedMinutes / 30) / 2}시간` },
        { label: "일정 범위·이동 제외 휴식", value: `${Math.floor(firstStart / 60)}:${String(firstStart % 60).padStart(2, "0")}–${Math.floor(lastEnd / 60)}:${String(lastEnd % 60).padStart(2, "0")} · 45분 이상 ${meaningfulBreaks}회 · 실제 경로 ${routeAdjustedGapCount}구간 반영` },
        ...groupEvidence,
      ],
    });
  }

  if (!analyzableDayCount || analyzableItemCount < 2) return insufficientCategory("density", "유효한 일정 시간 정보가 부족해 밀도를 분석할 수 없어요.");
  const status = categoryStatusFromIssues(issues);
  return { category: "density", status, summary: status === "good" ? "현재 일정 밀도는 높지 않아요." : "활동 수와 연속 활동 시간을 함께 조정해 보세요.", issues };
}
