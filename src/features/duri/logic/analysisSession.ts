import { analyzeTrip } from "../../../duri/duri-analysis";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { DURI_ANALYSIS_VERSION } from "../constants";
import type { DuriAnalysisSession } from "../types";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "./analysisSnapshot";
import {
  analyzeCandidateUsage,
  analyzeDayBalance,
  analyzeEndCondition,
  analyzeOvernightRecovery,
  analyzeTimeConflicts,
  buildGroupPreferenceInsights,
  calculateAnalysisCoverage,
  mapCoreIssues,
  sortDuriReportIssues,
} from "./analysisContext";
import {
  analyzeConfirmedScheduleConstraints,
  analyzeDocumentReferences,
  analyzeDuplicateVisits,
  analyzeRouteCostEvidence,
  analyzeRouteOptimization,
  analyzeRouteTimeConstraints,
  analyzeTransitRouteDetails,
} from "./scheduleConstraintAnalysis";
import { analyzePlaceCongestionConstraints, analyzePlaceOperatingConstraints, analyzePlacePracticalConstraints, analyzeRecommendedDurations } from "./placeConstraintAnalysis";
import { analyzePreferenceConstraints } from "./preferenceConstraintAnalysis";

export function createDuriAnalysisSession(input: DuriAnalysisInput, analyzedAt: string): DuriAnalysisSession {
  const snapshot = createDuriAnalysisSnapshot(input);
  const result = analyzeTrip(snapshot);
  const confirmedSchedule = analyzeConfirmedScheduleConstraints(snapshot);
  const routeTime = analyzeRouteTimeConstraints(snapshot, analyzedAt);
  const transitDetails = analyzeTransitRouteDetails(snapshot, analyzedAt);
  const routeOptimization = analyzeRouteOptimization(snapshot);
  const routeCosts = analyzeRouteCostEvidence(snapshot, analyzedAt);
  const operatingHours = analyzePlaceOperatingConstraints(snapshot, analyzedAt);
  const recommendedDurations = analyzeRecommendedDurations(snapshot, analyzedAt);
  const practicalPlaceFacts = analyzePlacePracticalConstraints(snapshot, analyzedAt);
  const congestion = analyzePlaceCongestionConstraints(snapshot, analyzedAt);
  const documentChecks = analyzeDocumentReferences(snapshot);
  const duplicateVisits = analyzeDuplicateVisits(snapshot);
  const preferenceConstraints = analyzePreferenceConstraints(snapshot, analyzedAt);
  const conflicts = analyzeTimeConflicts(snapshot);
  const endCondition = analyzeEndCondition(snapshot);
  const overnightRecovery = analyzeOvernightRecovery(snapshot);
  const dayBalance = analyzeDayBalance(snapshot, analyzedAt);
  const candidateUsage = analyzeCandidateUsage(snapshot);
  const coreIssues = [result.route, result.density, result.meal, result.preference].flatMap((category) => category.issues);
  const mappedCoreIssues = mapCoreIssues(coreIssues);
  const contextIssues = [
    ...confirmedSchedule,
    ...routeTime,
    ...operatingHours,
    ...conflicts,
    ...endCondition,
    ...overnightRecovery,
    ...routeOptimization,
    ...routeCosts,
    ...recommendedDurations,
    ...practicalPlaceFacts,
    ...congestion,
    ...transitDetails,
    ...documentChecks,
    ...duplicateVisits,
    ...preferenceConstraints,
    ...dayBalance.issues,
    ...candidateUsage.issues,
  ];
  const reportIssues = sortDuriReportIssues([
    ...mappedCoreIssues,
    ...contextIssues,
  ]);
  const overallStatus = reportIssues.some((issue) => issue.severity === "high")
    ? "warning"
    : reportIssues.some((issue) => issue.severity === "medium")
      ? "attention"
      : result.overallStatus === "insufficient-data"
        ? "insufficient-data"
        : "good";
  const confirmedScheduleWarning = confirmedSchedule.find((issue) => issue.severity === "high");
  const routeWarning = routeTime.find((issue) => issue.severity === "high");
  const operatingWarning = operatingHours.find((issue) => issue.severity === "high");
  const endConditionWarning = endCondition.find((issue) => issue.severity === "high");
  const overallMessage = confirmedScheduleWarning
    ? "확정된 예약·교통 일정을 먼저 일정표와 맞춰 주세요."
    : routeWarning
      ? "실제 경로 예상시간보다 짧게 잡힌 이동 구간을 먼저 확인해 주세요."
    : operatingWarning
      ? "운영일·운영시간과 맞지 않는 방문 일정을 먼저 확인해 주세요."
    : endConditionWarning
    ? "마지막 날 종료 지점에 도착할 시간을 먼저 확보해 주세요."
    : conflicts.length
    ? `시간이 겹치는 일정 ${conflicts.length}건을 먼저 확인해 주세요.`
    : dayBalance.issues.length && result.overallStatus === "good"
      ? "날짜별 일정 수 차이를 함께 확인해 보세요."
      : result.overallMessage;
  return {
    tripId: snapshot.trip.id,
    inputFingerprint: createDuriInputFingerprint(snapshot),
    algorithmVersion: DURI_ANALYSIS_VERSION,
    analyzedAt,
    snapshot,
    result,
    overallStatus,
    overallMessage,
    coverage: calculateAnalysisCoverage(snapshot),
    issues: reportIssues,
    dayMetrics: dayBalance.metrics,
    candidateUsage: candidateUsage.usage,
    groupInsights: buildGroupPreferenceInsights(snapshot),
  };
}
