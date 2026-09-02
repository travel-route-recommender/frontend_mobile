import type { AnalysisEvidence } from "../duri-analysis/types";
import type { GroupPlanningDimension, GroupPlanningProfile } from "./types";

const labels: Record<GroupPlanningDimension, { average: string; difference: string; low: string; middle: string; high: string }> = {
  pace: { average: "그룹 일정 밀도 성향", difference: "일정 밀도 선호 차이", low: "여유형", middle: "균형형", high: "알찬형" },
  budget: { average: "그룹 예산 성향", difference: "지출 선호 차이", low: "절약 우선", middle: "균형 지출", high: "경험 중심" },
  mobility: { average: "이동 부담 성향", difference: "이동 범위 선호 차이", low: "가까운 동선 선호", middle: "적당한 이동 선호", high: "넓은 이동도 괜찮음" },
  activity: { average: "그룹 활동 강도", difference: "활동 강도 선호 차이", low: "머무는 활동 선호", middle: "관광과 휴식 균형", high: "활동적인 흐름 선호" },
  mealStyle: { average: "그룹 식사 방식", difference: "맛집 대기 기준", low: "대기 부담 최소화", middle: "상황에 맞춘 식사", high: "후보 맛집 선호" },
  planningStyle: { average: "그룹 계획 방식", difference: "계획 방식 선호 차이", low: "정해진 일정 선호", middle: "기본 계획과 조정", high: "유연한 자유 시간 선호" },
};

export function getGroupDimensionTone(profile: GroupPlanningProfile | undefined, dimension: GroupPlanningDimension) {
  const average = profile?.[dimension].average;
  const spread = profile?.[dimension].spread;
  // 0/1/2는 서열 척도이므로 임의 0.75/1.25 경계로 평균을 재분류하지 않는다.
  // 모든 직접 응답이 같을 때만 그 선택지를 그룹 tone으로 사용한다.
  if (average === undefined || spread !== 0) return undefined;
  if (average === 0) return "low" as const;
  if (average === 2) return "high" as const;
  return average === 1 ? "middle" as const : undefined;
}

export function canAdjustGroupThreshold(profile: GroupPlanningProfile | undefined, dimension: GroupPlanningDimension) {
  return profile?.dataStatus === "complete" && profile[dimension].spread === 0 && getGroupDimensionTone(profile, dimension) !== undefined;
}

export function buildGroupProfileEvidence(
  profile: GroupPlanningProfile | undefined,
  dimension: GroupPlanningDimension,
): AnalysisEvidence[] {
  if (!profile || profile.dataStatus === "insufficient" || profile[dimension].average === undefined) return [];
  const meta = labels[dimension];
  const tone = getGroupDimensionTone(profile, dimension);
  const evidence: AnalysisEvidence[] = [{
    label: meta.average,
    value: tone ? meta[tone] : "응답이 달라 단일 그룹 성향으로 축약하지 않음",
  }];
  if ((profile[dimension].spread ?? 0) > 0) evidence.push({ label: meta.difference, value: "직접 응답 차이 · 조율 필요" });
  if (profile.dataStatus === "partial") {
    evidence.push({ label: "성향 응답 기준", value: `${profile.completedMemberCount}/${profile.totalMemberCount}명 완료 기준` });
  }
  return evidence;
}
