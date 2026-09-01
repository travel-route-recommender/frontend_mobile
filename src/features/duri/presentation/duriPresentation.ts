import type { DuriAnalysisSession, DuriReportIssue, DuriSuggestionPreview } from "../types";

export type DuriPresentationStrength = {
  id: string;
  title: string;
  detail: string;
};

export type DuriPresentationMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "lavender" | "mint" | "peach";
};

const statusLabel = {
  good: "전체적으로 잘 맞아요",
  attention: "조금 조정하면 더 좋아요",
  warning: "먼저 확인할 점이 있어요",
  "insufficient-data": "조금 더 정보가 필요해요",
} as const;

export function buildDuriAnalysisPresentation(session: DuriAnalysisSession) {
  const actionableIssues = session.issues.filter((issue) => issue.constraintType !== "informational");
  const informationalIssues = session.issues.filter((issue) => issue.constraintType === "informational");
  const hardCount = session.issues.filter((issue) => issue.constraintType === "hard").length;
  const conflictCount = session.dayMetrics.reduce((total, metric) => total + metric.conflictCount, 0);
  const analyzedRouteLegCount = session.dayMetrics.reduce((total, metric) => total + metric.analyzedRouteLegCount, 0);
  const requiredRouteLegCount = session.dayMetrics.reduce((total, metric) => total + metric.requiredRouteLegCount, 0);
  const strengths: DuriPresentationStrength[] = [];

  if (conflictCount === 0) {
    strengths.push({ id: "no-conflict", title: "서로 겹치는 일정이 없어요", detail: `배치된 일정 ${session.result.analyzedItemCount}개에서 시간 충돌이 확인되지 않았어요.` });
  }
  if (session.candidateUsage.scheduledCandidateCount > 0) {
    strengths.push({
      id: "candidate-use",
      title: "모아둔 후보가 일정에 반영돼 있어요",
      detail: `후보 ${session.candidateUsage.candidateCount}개 중 ${session.candidateUsage.scheduledCandidateCount}개를 일정에 배치했어요.`,
    });
  }
  if (requiredRouteLegCount > 0 && analyzedRouteLegCount === requiredRouteLegCount) {
    strengths.push({ id: "route-covered", title: "필요한 이동 구간을 모두 확인했어요", detail: `실제 경로 ${analyzedRouteLegCount}개 구간을 분석에 반영했어요.` });
  }

  const metrics: DuriPresentationMetric[] = [
    { id: "itinerary", label: "배치 일정", value: `${session.result.analyzedItemCount}개`, detail: `${session.dayMetrics.length}일 일정`, tone: "lavender" },
    { id: "conflicts", label: "시간 충돌", value: `${conflictCount}건`, detail: "겹치는 일정", tone: conflictCount ? "peach" : "mint" },
    { id: "candidate", label: "후보 활용", value: `${session.candidateUsage.scheduledCandidateCount}/${session.candidateUsage.candidateCount}`, detail: "일정에 배치", tone: "blue" },
    { id: "route", label: "실제 경로", value: `${analyzedRouteLegCount}/${requiredRouteLegCount}`, detail: "확인한 구간", tone: requiredRouteLegCount > 0 && analyzedRouteLegCount < requiredRouteLegCount ? "peach" : "mint" },
  ];

  return {
    headline: statusLabel[session.overallStatus],
    summary: session.overallMessage,
    leadingIssue: actionableIssues[0],
    actionableIssues,
    informationalIssues,
    strengths,
    metrics,
    stats: [
      { id: "items", value: session.result.analyzedItemCount, label: "배치된 일정", tone: "lavender" as const },
      { id: "strengths", value: strengths.length, label: "잘 맞는 점", tone: "mint" as const },
      { id: "adjustments", value: actionableIssues.length, label: "조정할 점", tone: "peach" as const },
      { id: "reference", value: informationalIssues.length, label: "참고할 점", tone: "blue" as const },
    ],
    hardCount,
  };
}

export function getSuggestionIssueTitles(session: DuriAnalysisSession, sourceIssueIds: readonly string[]) {
  return sourceIssueIds.flatMap((issueId) => session.issues.find((issue) => issue.id === issueId)?.title ?? []);
}

export function getChangedSuggestionItems(preview: DuriSuggestionPreview) {
  return preview.diff.filter((item) => item.kind !== "unchanged");
}

export function issuePreviewText(issue: DuriReportIssue) {
  return issue.summary || issue.title;
}
