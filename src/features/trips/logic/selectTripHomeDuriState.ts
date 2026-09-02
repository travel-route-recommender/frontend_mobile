import type { AnalysisSeverity } from "../../../duri/duri-analysis";

export type TripHomeDuriState =
  | { kind: "no-itinerary" }
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "existing"; issueCount: number }
  | { kind: "stale" }
  | { kind: "unavailable"; message?: string };

type AnalysisSessionSummary = {
  inputFingerprint: string;
  issues: readonly { severity: AnalysisSeverity }[];
};

/**
 * 여행방 홈의 분석 카드는 mock/API 여부가 아니라 현재 분석 입력과 저장된
 * session의 일치 여부만으로 상태를 결정한다. 이렇게 해야 여행 탭과
 * Workspace에서 이미 쓸 수 있는 API 분석을 홈 카드가 별도로 막지 않는다.
 */
export function selectTripHomeDuriState(input: {
  itineraryCount: number;
  analysisAvailable: boolean;
  unavailableMessage?: string;
  analysisStatus: "idle" | "loading" | "error";
  currentFingerprint: string;
  session?: AnalysisSessionSummary;
}): TripHomeDuriState {
  if (input.itineraryCount === 0) return { kind: "no-itinerary" };
  if (!input.analysisAvailable) return { kind: "unavailable", ...(input.unavailableMessage ? { message: input.unavailableMessage } : {}) };
  if (input.analysisStatus === "loading") return { kind: "loading" };
  if (input.session && input.session.inputFingerprint !== input.currentFingerprint) return { kind: "stale" };
  if (input.session) {
    return {
      kind: "existing",
      issueCount: input.session.issues.filter((issue) => issue.severity !== "info").length,
    };
  }
  return { kind: "ready" };
}
