import { analyzeTrip } from "../../../duri/duri-analysis";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { DURI_ANALYSIS_VERSION } from "../constants";
import type { DuriAnalysisSession } from "../types";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "./analysisSnapshot";
import {
  analyzeCandidateUsage,
  analyzeDayBalance,
  analyzeEndCondition,
  analyzeTimeConflicts,
  buildGroupPreferenceInsights,
  calculateAnalysisCoverage,
  mapCoreIssues,
  sortDuriReportIssues,
} from "./analysisContext";

export function createDuriAnalysisSession(input: DuriAnalysisInput, analyzedAt: string): DuriAnalysisSession {
  const snapshot = createDuriAnalysisSnapshot(input);
  const result = analyzeTrip(snapshot);
  const conflicts = analyzeTimeConflicts(snapshot);
  const endCondition = analyzeEndCondition(snapshot);
  const dayBalance = analyzeDayBalance(snapshot);
  const candidateUsage = analyzeCandidateUsage(snapshot);
  const coreIssues = [result.route, result.density, result.meal, result.preference].flatMap((category) => category.issues);
  const contextIssues = [...endCondition, ...conflicts, ...dayBalance.issues, ...candidateUsage.issues];
  const overallStatus = contextIssues.some((issue) => issue.severity === "high")
    ? "warning"
    : contextIssues.some((issue) => issue.severity === "medium") && result.overallStatus === "good"
      ? "attention"
      : result.overallStatus;
  const endConditionWarning = endCondition.find((issue) => issue.severity === "high");
  const overallMessage = endConditionWarning
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
    issues: sortDuriReportIssues([
      ...mapCoreIssues(coreIssues),
      ...contextIssues,
    ]),
    dayMetrics: dayBalance.metrics,
    candidateUsage: candidateUsage.usage,
    groupInsights: buildGroupPreferenceInsights(snapshot),
  };
}
