import type { ItineraryItem } from "../../../domain";
import type { AnalysisIssue } from "../../../duri/duri-analysis";
import { findTimeConflictsForDate } from "../../workspace/logic/workspaceDateTime";
import { getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";
import { DURI_MOBILE_CONTEXT_CONFIG } from "../constants";
import { analyzeTripEndCondition } from "../../workspace/logic/tripEndCondition";
import type {
  DuriAnalysisCoverage,
  DuriAnalysisSnapshot,
  DuriCandidateUsage,
  DuriDayMetric,
  DuriGroupInsight,
  DuriReportIssue,
} from "../types";
import { isUsableConfirmedScheduleConstraint } from "./confirmedScheduleConstraint";
import { buildScheduledRouteLegs } from "./routeEvidence";
import { findUsableRouteEstimateForLeg } from "./scheduleConstraintAnalysis";

function uniqueConflictPairs(items: readonly ItineraryItem[], date: string) {
  const pairs = new Set<string>();
  for (const conflict of findTimeConflictsForDate(items, date)) {
    for (const otherId of conflict.conflictingItemIds) {
      pairs.add([conflict.itemId, otherId].sort().join("::"));
    }
  }
  return [...pairs].sort().map((pair) => pair.split("::") as [string, string]);
}

export function analyzeTimeConflicts(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const validItems = snapshot.itinerary.filter(isValidScheduleRange);
  return getTripDates(snapshot.trip.startDate, snapshot.trip.endDate).flatMap((date) =>
    uniqueConflictPairs(validItems, date).map(([leftId, rightId]) => {
      const pair = [leftId, rightId].map((id) => validItems.find((item) => item.id === id)).filter((item): item is ItineraryItem => Boolean(item));
      const placeIds = pair.flatMap((item) => item.placeId ? [item.placeId] : []);
      const timeRanges = pair.map((item) => `${item.startTime}~${minutesToLabel(timeStringToMinutes(item.startTime) + item.durationMinutes)}`);
      return {
        id: `time-conflict-${date}-${[leftId, rightId].sort().join("-")}`,
        category: "time-conflict" as const,
        severity: "high" as const,
        title: "같은 시간에 겹치는 일정이 있어요",
        summary: `${date}의 ${timeRanges.join(" · ")} 일정이 겹쳐요. 적용 가능한 빈 시간을 제안할 수 있어요.`,
        date,
        affectedItemIds: [leftId, rightId].sort(),
        affectedPlaceIds: [...new Set(placeIds)].sort(),
        affectedMemberIds: [],
        evidence: [{ label: "겹치는 시간 범위", value: timeRanges.join(" / "), itemIds: [leftId, rightId].sort(), placeIds }],
        suggestionSupported: true,
        constraintType: "hard" as const,
        confidence: "high" as const,
        source: "mobile-context" as const,
      };
    }),
  );
}

export function analyzeEndCondition(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const condition = snapshot.trip.endCondition;
  if (!condition) return [];
  const assessment = analyzeTripEndCondition(snapshot.trip, snapshot.itinerary);
  const affectedPlaceIds = assessment.affectedItemIds.flatMap((itemId) => {
    const placeId = snapshot.itinerary.find((item) => item.id === itemId)?.placeId;
    return placeId ? [placeId] : [];
  });
  const evidence = [
    { label: "종료 지점", value: condition.location.name },
    { label: "도착·반납 마감", value: condition.deadline },
    { label: "입력한 예상 이동시간", value: condition.travelMinutes + "분" },
    { label: "승차 준비·반납 확보시간", value: condition.serviceBufferMinutes + "분" },
  ];
  if (assessment.cutoffMinutes !== undefined && assessment.cutoffMinutes >= 0) {
    evidence.push({ label: "마지막 일정 종료 한계", value: minutesToLabel(assessment.cutoffMinutes) });
  }
  if (assessment.latestEndMinutes !== undefined) {
    evidence.push({ label: "현재 마지막 일정 종료", value: minutesToLabel(assessment.latestEndMinutes) });
  }

  if (assessment.status === "feasible") {
    return [{
      id: "end-condition-feasible-" + snapshot.trip.endDate,
      category: "end-condition",
      severity: "info",
      title: "현재 일정은 여행 종료 조건을 지킬 수 있어요",
      summary: "사용자가 입력한 이동시간과 준비시간을 기준으로 마지막 일정 이후 여유를 확인했어요.",
      date: snapshot.trip.endDate ?? undefined,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: [],
      evidence,
      suggestionSupported: false,
      constraintType: "informational",
      confidence: "medium",
      source: "mobile-context",
    }];
  }
  if (assessment.status === "insufficient-data") {
    return [{
      id: "end-condition-insufficient-" + snapshot.trip.endDate,
      category: "end-condition",
      severity: "low",
      title: "마지막 날 일정이 추가되면 종료 조건을 다시 확인해요",
      summary: "종료 조건은 저장했지만 마지막 날 일정이 없어 현재는 이동 가능성을 확정하지 않았어요.",
      date: snapshot.trip.endDate ?? undefined,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: [],
      evidence,
      suggestionSupported: false,
      constraintType: "informational",
      confidence: "high",
      source: "mobile-context",
    }];
  }
  if (assessment.status === "cross-midnight") {
    return [{
      id: "end-condition-cross-midnight-" + snapshot.trip.id,
      category: "end-condition",
      severity: "medium",
      title: "복귀 이동이 자정 경계를 넘을 수 있어요",
      summary: assessment.message + " 여행 날짜의 의미와 실제 출발일을 사용자가 확인해 주세요.",
      date: snapshot.trip.endDate ?? undefined,
      affectedItemIds: assessment.affectedItemIds,
      affectedPlaceIds,
      affectedMemberIds: [],
      evidence,
      suggestionSupported: false,
      constraintType: "soft",
      confidence: "high",
      source: "mobile-context",
    }];
  }
  if (assessment.status === "invalid") {
    return [{
      id: "end-condition-invalid-" + snapshot.trip.id,
      category: "end-condition",
      severity: "high",
      title: "여행 종료 조건을 확인해 주세요",
      summary: assessment.message,
      date: snapshot.trip.endDate ?? undefined,
      affectedItemIds: assessment.affectedItemIds,
      affectedPlaceIds,
      affectedMemberIds: [],
      evidence,
      suggestionSupported: false,
      constraintType: "hard",
      confidence: "high",
      source: "mobile-context",
    }];
  }
  if (assessment.status !== "infeasible") return [];
  return [{
    id: "end-condition-infeasible-" + snapshot.trip.endDate + "-" + assessment.affectedItemIds.join("-"),
    category: "end-condition",
    severity: "high",
    title: "마지막 일정 뒤 종료 지점에 제시간에 도착하기 어려워요",
    summary: assessment.message + " 실제 경로 API가 아니라 사용자가 입력한 예상 이동시간을 기준으로 계산했어요.",
    date: snapshot.trip.endDate ?? undefined,
    affectedItemIds: assessment.affectedItemIds,
    affectedPlaceIds,
    affectedMemberIds: [],
    evidence,
    suggestionSupported: true,
    constraintType: "hard",
    confidence: "medium",
    source: "mobile-context",
  }];
}

function minutesToLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const ADULT_SLEEP_REFERENCE_MINUTES = 7 * 60;

/**
 * 날짜 경계의 빈 시간을 수면으로 단정하지 않는다. 다만 AASM/SRS 성인 권고의
 * 7시간보다 짧으면 야간 이동이 의도인지 확인하도록 낮은 신뢰도의 Soft 항목으로만 알린다.
 */
export function analyzeOvernightRecovery(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const dates = getTripDates(snapshot.trip.startDate, snapshot.trip.endDate);
  return dates.slice(0, -1).flatMap((date, index) => {
    const nextDate = dates[index + 1];
    const currentItems = sortItineraryItemsByDateAndTime(snapshot.itinerary.filter((item) => item.date === date && isValidScheduleRange(item)));
    const nextItems = sortItineraryItemsByDateAndTime(snapshot.itinerary.filter((item) => item.date === nextDate && isValidScheduleRange(item)));
    if (!currentItems.length || !nextItems.length) return [];
    const last = currentItems[currentItems.length - 1];
    const first = nextItems[0];
    const lastEnd = timeStringToMinutes(last.startTime) + last.durationMinutes;
    const firstStart = timeStringToMinutes(first.startTime);
    const recoveryMinutes = (24 * 60 - lastEnd) + firstStart;
    if (!Number.isFinite(recoveryMinutes) || recoveryMinutes >= ADULT_SLEEP_REFERENCE_MINUTES) return [];
    const affectedPlaceIds = [last.placeId, first.placeId].filter((placeId): placeId is string => Boolean(placeId));
    return [{
      id: `overnight-recovery-${date}-${nextDate}-${last.id}-${first.id}`,
      category: "overnight-recovery" as const,
      severity: "low" as const,
      title: "다음 날 첫 일정까지 회복 시간이 짧을 수 있어요",
      summary: `${date} 마지막 일정 종료부터 ${nextDate} 첫 일정 시작까지 ${Math.floor(recoveryMinutes / 60)}시간 ${recoveryMinutes % 60}분이에요. 심야 이동·축제처럼 의도한 일정일 수 있어 삭제하거나 시간을 바꾸지 않아요.`,
      date: nextDate,
      affectedItemIds: [last.id, first.id],
      affectedPlaceIds,
      affectedMemberIds: [],
      evidence: [
        { label: "일정 사이 시간", value: `${recoveryMinutes}분`, itemIds: [last.id, first.id], placeIds: affectedPlaceIds },
        { label: "성인 수면 참고", value: "규칙적으로 7시간 이상 권고", source: "AASM/SRS 성인 수면시간 합의문" },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "low" as const,
      source: "external-evidence" as const,
    }];
  });
}

export function analyzeDayBalance(snapshot: DuriAnalysisSnapshot, analyzedAt = new Date().toISOString()): { metrics: DuriDayMetric[]; issues: DuriReportIssue[] } {
  const dates = getTripDates(snapshot.trip.startDate, snapshot.trip.endDate);
  const routeLegs = buildScheduledRouteLegs(snapshot);
  const metrics = dates.map((date) => {
    const items = sortItineraryItemsByDateAndTime(snapshot.itinerary.filter((item) => item.date === date && isValidScheduleRange(item)));
    const dayLegs = routeLegs.filter((leg) => leg.date === date);
    const analyzedLegs = dayLegs.flatMap((leg) => {
      const estimate = findUsableRouteEstimateForLeg(snapshot.routeLegEstimates ?? [], leg, snapshot.trip.transport, analyzedAt);
      return estimate ? [{ leg, estimate }] : [];
    });
    // 경로를 조회하지 못한 구간을 0분 이동으로 가정하지 않는다. 확인된 구간만
    // `사용 가능 공백 - 실제 이동시간`으로 계산해 긴 이동을 공백으로 오인하지 않는다.
    const routeAdjustedIdleMinutes = Math.round(analyzedLegs.reduce((total, { leg, estimate }) =>
      total + Math.max(0, leg.availableSeconds - estimate.durationSeconds), 0) / 60);
    return {
      date,
      itemCount: items.length,
      scheduledMinutes: items.reduce((total, item) => total + item.durationMinutes, 0),
      conflictCount: uniqueConflictPairs(items, date).length,
      routeAdjustedIdleMinutes,
      analyzedRouteLegCount: analyzedLegs.length,
      requiredRouteLegCount: dayLegs.length,
    };
  });
  if (metrics.length < 2) return { metrics, issues: [] };
  const sorted = [...metrics].sort((left, right) => right.itemCount - left.itemCount || left.date.localeCompare(right.date));
  const busiest = sorted[0];
  const lightest = [...metrics].sort((left, right) => left.itemCount - right.itemCount || left.date.localeCompare(right.date))[0];
  const difference = busiest.itemCount - lightest.itemCount;
  if (difference < DURI_MOBILE_CONTEXT_CONFIG.dayBalanceItemDifference) return { metrics, issues: [] };
  return {
    metrics,
    issues: [{
      id: `day-balance-${busiest.date}-${lightest.date}`,
      category: "day-balance",
      severity: "medium",
      title: "한 날짜에 일정이 집중되어 있어요",
      summary: `${busiest.date} ${busiest.itemCount}개와 ${lightest.date} ${lightest.itemCount}개로 ${difference}개 차이가 있어요. 첫날·마지막 날의 이동 조건은 임의로 가정하지 않았어요.`,
      date: busiest.date,
      affectedItemIds: snapshot.itinerary.filter((item) => item.date === busiest.date).map((item) => item.id).sort(),
      affectedPlaceIds: snapshot.itinerary.filter((item) => item.date === busiest.date).flatMap((item) => item.placeId ? [item.placeId] : []).sort(),
      affectedMemberIds: [],
      evidence: [
        { label: busiest.date, value: `${busiest.itemCount}개 · ${busiest.scheduledMinutes}분` },
        { label: lightest.date, value: `${lightest.itemCount}개 · ${lightest.scheduledMinutes}분` },
      ],
      suggestionSupported: true,
      constraintType: "soft",
      confidence: "low",
      source: "mobile-context",
    }],
  };
}

export function analyzeCandidateUsage(snapshot: DuriAnalysisSnapshot): { usage: DuriCandidateUsage; issues: DuriReportIssue[] } {
  const scheduledPlaceIds = new Set(snapshot.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const memberIds = new Set(snapshot.trip.members.map((member) => member.userId));
  const unscheduled = snapshot.candidates.filter((candidate) => !scheduledPlaceIds.has(candidate.placeId));
  const shared = unscheduled.filter((candidate) => {
    const contributors = [...new Set(candidate.addedByUserIds)].filter((id) => memberIds.has(id));
    return contributors.length >= 2;
  }).map((candidate) => candidate.placeId).sort();
  const usage: DuriCandidateUsage = {
    candidateCount: snapshot.candidates.length,
    scheduledCandidateCount: snapshot.candidates.filter((candidate) => scheduledPlaceIds.has(candidate.placeId)).length,
    unscheduledCandidateCount: unscheduled.length,
    unscheduledSharedCandidateIds: shared,
  };
  const issues: DuriReportIssue[] = shared.length ? [{
    id: `candidate-usage-shared-${shared.join("-")}`,
    category: "candidate-usage",
    severity: "info",
    title: "여러 동행자가 담은 미배치 후보가 있어요",
    summary: `${shared.length}개 후보가 아직 일정에 없어요. 반드시 넣어야 한다는 뜻은 아니며, 빈 시간에 활용할 수 있는 선택지예요.`,
    affectedItemIds: [],
    affectedPlaceIds: shared,
    affectedMemberIds: [],
    evidence: [{ label: "미배치 공동 후보", value: `${shared.length}개`, placeIds: shared }],
    suggestionSupported: false,
    constraintType: "informational",
    confidence: "high",
    source: "mobile-context",
  }] : [];
  return { usage, issues };
}

export function buildGroupPreferenceInsights(snapshot: DuriAnalysisSnapshot): DuriGroupInsight[] {
  const diagnosis = snapshot.groupPreferenceDiagnosis;
  if (diagnosis.coverage === "insufficient") {
    return [{
      id: "group-coverage-insufficient",
      kind: "coverage",
      title: "그룹 성향 근거가 더 필요해요",
      description: `${diagnosis.completedMemberCount}/${diagnosis.totalMemberCount}명 응답이라 일정 구조만 분석하고 개인 응답을 그룹 성향처럼 사용하지 않았어요.`,
    }];
  }
  const coverage: DuriGroupInsight = {
    id: `group-coverage-${diagnosis.coverage}`,
    kind: "coverage",
    title: diagnosis.coverage === "complete" ? "모든 동행자 응답을 반영했어요" : "현재 응답한 동행자 기준이에요",
    description: `${diagnosis.completedMemberCount}/${diagnosis.totalMemberCount}명 응답${diagnosis.coverage === "partial" ? "이며, 추가 응답에 따라 결과가 달라질 수 있어요." : "을 그룹 계획 성향에 반영했어요."}`,
  };
  return [
    coverage,
    ...diagnosis.commonPreferences.map((label) => ({ id: `group-common-${label}`, kind: "common" as const, title: `함께 맞는 성향 · ${label}`, description: "응답자 사이에서 비교적 비슷하게 나타난 계획 성향이에요." })),
    ...diagnosis.moderateDifferences.map((label) => ({ id: `group-difference-${label}`, kind: "difference" as const, title: `차이를 참고할 성향 · ${label}`, description: "일정을 확정하기 전에 선택지를 함께 확인해보면 좋아요." })),
    ...diagnosis.needsCoordination.map((label) => ({ id: `group-coordination-${label}`, kind: "coordination" as const, title: `조율이 필요한 성향 · ${label}`, description: "자동 삭제의 근거로 쓰지 않고 제안 이유와 선택지에만 반영해요." })),
  ];
}

export function calculateAnalysisCoverage(snapshot: DuriAnalysisSnapshot): DuriAnalysisCoverage {
  const routeCollection = snapshot.evidenceCollection?.route;
  const routeData = routeCollection && routeCollection.requiredLegCount > 0
    ? routeCollection.analyzedLegCount === routeCollection.requiredLegCount
      ? "available"
      : routeCollection.analyzedLegCount > 0
        ? "partial"
        : "unavailable"
    : "unavailable";
  const placeCollection = snapshot.evidenceCollection?.placeDetails;
  const operatingFactPlaceCount = placeCollection?.operatingFactPlaceCount ?? 0;
  const durationFactPlaceCount = placeCollection?.durationFactPlaceCount ?? 0;
  const scheduledPlaceCount = placeCollection?.scheduledPlaceCount ?? 0;
  const operatingData = placeCollection && scheduledPlaceCount > 0
    ? operatingFactPlaceCount === scheduledPlaceCount
      ? "available"
      : operatingFactPlaceCount > 0
        ? "partial"
        : "unavailable"
    : "unavailable";
  const congestionCollection = snapshot.evidenceCollection?.congestion;
  const scheduledCongestionPlaceDateCount = congestionCollection?.scheduledPlaceDateCount ?? 0;
  const matchedCongestionPlaceDateCount = congestionCollection?.matchedPlaceDateCount ?? 0;
  const congestionData = congestionCollection && scheduledCongestionPlaceDateCount > 0
    ? matchedCongestionPlaceDateCount === scheduledCongestionPlaceDateCount
      ? "available"
      : matchedCongestionPlaceDateCount > 0
        ? "partial"
        : "unavailable"
    : "unavailable";
  const confirmedCount = (snapshot.confirmedScheduleConstraints ?? [])
    .filter((constraint) => isUsableConfirmedScheduleConstraint(constraint, snapshot.trip)).length;
  const documentCount = snapshot.documentReferences?.length ?? 0;
  const documentReviewCount = snapshot.documentReferences?.filter((reference) => reference.extractionStatus === "needs-review").length ?? 0;
  const documentUnavailableCount = snapshot.documentReferences?.filter((reference) => reference.extractionStatus === "failed" || reference.extractionStatus === "unsupported").length ?? 0;
  const resolvedDocumentCount = snapshot.documentReferences?.filter((reference) =>
    reference.extractionStatus === "confirmed" && (reference.confirmedFactIds?.length ?? 0) > 0).length ?? 0;
  const unresolvedDocumentCount = documentCount - resolvedDocumentCount;
  const documentData = confirmedCount > 0 && unresolvedDocumentCount === 0
    ? "available"
    : confirmedCount > 0 || documentCount > 0
      ? "partial"
      : "unavailable";
  const routeMessage = routeCollection?.mode === "car" && routeData !== "unavailable"
    ? `Kakao Mobility 실제 도로 경로로 ${routeCollection.analyzedLegCount}/${routeCollection.requiredLegCount}개 구간을 초 단위 비교했어요. 현재 교통 기준이며 여행 날짜의 미래 교통은 아니에요.${routeCollection.unavailableReason ? ` ${routeCollection.unavailableReason}` : ""}`
    : routeCollection?.mode === "public"
      ? routeCollection.unavailableReason ?? "대중교통 경로 근거를 조회하지 못했어요."
      : routeCollection?.requiredLegCount === 0
        ? "같은 날짜에 연속된 장소 일정이 없어 실제 이동시간 비교 대상이 없어요."
        : routeCollection?.unavailableReason ?? "실제 경로 근거가 없어 직선거리를 이동시간처럼 사용하지 않았어요.";
  const operatingMessage = operatingData === "available"
    ? `일정의 ${scheduledPlaceCount}개 장소 모두에서 TourAPI 운영시간·휴무일·행사기간 중 하나 이상을 확인했어요. 권장 소요시간 근거는 ${durationFactPlaceCount}개 장소에 있어요.${placeCollection?.unavailableReason ? ` ${placeCollection.unavailableReason}` : ""}`
    : operatingData === "partial"
      ? `일정의 ${scheduledPlaceCount}개 중 ${operatingFactPlaceCount}개 장소에서 TourAPI 운영시간·휴무일·행사기간 중 하나 이상을 확인했어요. 권장 소요시간 근거는 ${durationFactPlaceCount}개 장소에 있어요. ${placeCollection?.unavailableReason ?? "원문을 해석할 수 없는 장소는 판단하지 않았어요."}`
      : `${placeCollection?.unavailableReason ?? "파싱 가능한 TourAPI 운영정보가 없어 운영시간을 판단하지 않았어요."}${durationFactPlaceCount ? ` 권장 소요시간 근거는 ${durationFactPlaceCount}개 장소에만 있어요.` : ""}`;
  const congestionMessage = congestionData === "available"
    ? `일정의 장소·방문일 ${scheduledCongestionPlaceDateCount}건 모두에서 한국관광공사 향후 집중률 예측과 날짜가 정확히 일치했어요. 절대 방문자 수나 대기시간으로 해석하지 않아요.${congestionCollection?.unavailableReason ? ` ${congestionCollection.unavailableReason}` : ""}`
    : congestionData === "partial"
      ? `일정의 장소·방문일 ${scheduledCongestionPlaceDateCount}건 중 ${matchedCongestionPlaceDateCount}건에서만 향후 집중률 예측 날짜가 일치했어요. ${congestionCollection?.unavailableReason ?? "나머지 일정에는 예측값을 적용하지 않았어요."}`
      : congestionCollection?.unavailableReason ?? "일정 날짜와 정확히 일치하는 한국관광공사 집중률 예측값이 없어 혼잡도를 판단하지 않았어요.";
  const documentMessage = documentData === "available"
    ? `${confirmedCount}개의 사용자 확인 예약·필수 일정만 하드 제약으로 검사했어요.`
    : documentData === "partial"
      ? `첨부 문서 ${documentCount}개 중 확인 완료 ${resolvedDocumentCount}개, 미확정·처리 불가 ${unresolvedDocumentCount}개이며 현재 검증 가능한 사용자 확인 사실은 ${confirmedCount}개예요.${documentReviewCount ? ` 추출 결과 확인 필요 ${documentReviewCount}개.` : ""}${documentUnavailableCount ? ` OCR 미지원·실패 ${documentUnavailableCount}개.` : ""} 직접 확인한 날짜·시각·대상만 하드 제약으로 승격해요.`
      : "사용자가 확인한 예약·교통편 구조화 정보가 없어 누락·지각 여부를 판단하지 않았어요.";
  return {
    itinerary: snapshot.itinerary.length === 0 ? "insufficient" : snapshot.itinerary.length === 1 ? "partial" : "complete",
    preferences: snapshot.groupPreferenceDiagnosis.coverage,
    routeData,
    operatingData,
    congestionData,
    documentData,
    routeMessage,
    operatingMessage,
    congestionMessage,
    documentMessage,
    limitations: [
      "현재 Backend는 미래 출발시각 자동차 경로를 제공하지 않아 분석 시점 교통만 사용해요.",
      "대중교통 막차·마지막 환승 시각은 Kakao 경로 응답에 없어 검증하지 않아요.",
      "TourAPI에는 마지막 입장·라스트 오더 필드가 없어 운영 종료시각으로 대신 추정하지 않아요.",
      "관광지 집중률은 각 관광지의 역대 최고 수준을 100으로 둔 날짜 단위 예측이라 장소 간 비교가 불가능하고 실제 방문자 수·시간대별 대기시간·수용 한계를 판단하지 않아요.",
      "숙소·공항·역의 날짜별 출발·종료 좌표와 출발 마감이 없어 하루 첫·마지막 연결은 검증하지 않아요.",
    ],
  };
}

export function mapCoreIssues(issues: AnalysisIssue[]): DuriReportIssue[] {
  return issues.map((issue) => ({
    id: issue.id,
    category: issue.category,
    severity: issue.severity === "high" ? "medium" : issue.severity,
    title: issue.title,
    summary: issue.summary,
    date: issue.date,
    affectedItemIds: [...issue.affectedItemIds],
    affectedPlaceIds: [...issue.affectedPlaceIds],
    affectedMemberIds: [...issue.affectedMemberIds],
    evidence: issue.evidence.map((entry) => ({ ...entry, itemIds: entry.itemIds ? [...entry.itemIds] : undefined, placeIds: entry.placeIds ? [...entry.placeIds] : undefined, memberIds: entry.memberIds ? [...entry.memberIds] : undefined })),
    suggestionSupported: issue.severity !== "info",
    constraintType: issue.severity === "info" ? "informational" : "soft",
    confidence: "low",
    source: "web-engine",
  }));
}

export function sortDuriReportIssues(issues: DuriReportIssue[]) {
  const severityRank = { high: 0, medium: 1, low: 2, info: 3 } as const;
  return [...issues].sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity] ||
    (left.date ?? "9999-99-99").localeCompare(right.date ?? "9999-99-99") ||
    left.category.localeCompare(right.category) ||
    left.id.localeCompare(right.id),
  );
}
