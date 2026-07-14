import type { AnalysisStatus, CategoryAnalysisResult } from "./types";

export function createOverallMessage(status: AnalysisStatus, categories: CategoryAnalysisResult[]) {
  if (status === "warning") return "일정 밀도나 이동 흐름에서 먼저 확인할 부분이 있어요.";
  if (status === "attention") return "몇 가지 조율 포인트를 확인하면 일정이 더 편안해져요.";
  if (status === "insufficient-data") return "일정을 조금 더 채우면 두리가 동선과 균형을 자세히 분석할 수 있어요.";
  const evidenceCount = categories.reduce((count, category) => count + category.issues.length, 0);
  return evidenceCount ? "현재 일정은 큰 경고 없이 균형 있게 구성되어 있어요." : "현재 일정에서 특별한 조율 포인트가 감지되지 않았어요.";
}
