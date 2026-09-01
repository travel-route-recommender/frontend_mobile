import { analyzeDensity } from "./robustDensityAnalyzer";
import { analyzeMeals } from "./mealAnalyzer";
import { analyzePreferences } from "./preferenceAnalyzer";
import { analyzeRoute } from "./routeAnalyzer";
import { insufficientCategory } from "./shared";
import { createOverallMessage } from "./suggestionFactory";
import { deriveGroupPlanningProfile } from "../group-preferences";
import type { AnalysisStatus, DuriAnalysisInput, DuriAnalysisResult } from "./types";

export function analyzeTrip(input: DuriAnalysisInput): DuriAnalysisResult {
  const groupPlanningProfile = deriveGroupPlanningProfile(input.groupPreferenceDiagnosis);
  const enrichedInput = { ...input, groupPlanningProfile };
  const route = analyzeRoute(enrichedInput);
  // API 일정은 서버 시간을 그대로 분석할 수 있지만, 로컬 overlay를 읽지 못하면
  // 휴식·이동·식사 분류와 일정별 선호 참여자 정보는 복원할 수 없다. 이 상태에서
  // 모든 항목을 장소로 간주하면 밀도·식사·선호 균형을 사실처럼 오판하므로 해당
  // 세 범주만 명시적으로 보류한다. 시간 충돌·경로·확정 일정 검사는 계속 수행된다.
  const overlayUnavailable = input.scheduleOverlayStatus === "unavailable";
  const density = overlayUnavailable
    ? insufficientCategory("density", "일정 종류 정보를 읽지 못해 활동·휴식 밀도를 판정하지 않았어요.")
    : analyzeDensity(enrichedInput);
  const meal = overlayUnavailable
    ? insufficientCategory("meal", "식사·휴식 일정 종류 정보를 읽지 못해 식사 누락을 판정하지 않았어요.")
    : analyzeMeals(enrichedInput);
  const preference = overlayUnavailable
    ? insufficientCategory("preference", "일정별 선호 참여자 정보를 읽지 못해 일정 반영 균형을 판정하지 않았어요.")
    : analyzePreferences(enrichedInput);
  const categories = [route, density, meal, preference];
  const hasHighWarning = categories.some((category) => category.issues.some((issue) => issue.severity === "high"));
  const hasMediumIssue = categories.some((category) => category.issues.some((issue) => issue.severity === "medium"));
  const insufficientCount = categories.filter((category) => category.status === "insufficient-data").length;
  const overallStatus: AnalysisStatus = hasHighWarning
    ? "warning"
    : hasMediumIssue
      ? "attention"
      : insufficientCount > categories.length / 2
        ? "insufficient-data"
        : "good";

  return {
    tripId: input.trip.id,
    overallStatus,
    overallMessage: createOverallMessage(overallStatus, categories),
    analyzedItemCount: input.itinerary.length,
    groupPlanningProfile,
    route,
    density,
    meal,
    preference,
  };
}
