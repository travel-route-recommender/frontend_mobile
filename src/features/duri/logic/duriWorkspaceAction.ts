export type DuriWorkspaceActionKind =
  | "create_schedule"
  | "run_analysis"
  | "view_analysis"
  | "reanalyze";

export type DuriWorkspaceAction = {
  kind: DuriWorkspaceActionKind;
  label: "일정 먼저 만들기" | "DURI 분석하기" | "분석 결과 보기" | "다시 분석하기";
  destination: "schedule-add-flow" | "analysis-route";
  enabled: boolean;
};

export function resolveDuriWorkspaceAction({
  itineraryCount,
  hasAnalysis,
  stale,
  canCreateSchedule,
  canUseAnalysis,
}: {
  itineraryCount: number;
  hasAnalysis: boolean;
  stale: boolean;
  canCreateSchedule: boolean;
  canUseAnalysis: boolean;
}): DuriWorkspaceAction {
  if (itineraryCount === 0) {
    return {
      kind: "create_schedule",
      label: "일정 먼저 만들기",
      destination: "schedule-add-flow",
      enabled: canCreateSchedule,
    };
  }
  if (hasAnalysis && stale) {
    return {
      kind: "reanalyze",
      label: "다시 분석하기",
      destination: "analysis-route",
      enabled: canUseAnalysis,
    };
  }
  if (hasAnalysis) {
    return {
      kind: "view_analysis",
      label: "분석 결과 보기",
      destination: "analysis-route",
      enabled: true,
    };
  }
  return {
    kind: "run_analysis",
    label: "DURI 분석하기",
    destination: "analysis-route",
    enabled: canUseAnalysis,
  };
}
