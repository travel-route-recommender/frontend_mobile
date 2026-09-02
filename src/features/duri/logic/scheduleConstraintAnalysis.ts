import type { ItineraryItem } from "../../../domain";
import type { ConfirmedScheduleConstraint, RouteLegEstimate, RouteOrderEvaluation } from "../../../duri/duri-analysis";
import { SLOT_MINUTES } from "../../../data/workspaceSchedule";
import { getTripDates, sortItineraryItemsByDateAndTime } from "../../../utils/schedule";
import type { DuriAnalysisSnapshot, DuriReportIssue } from "../types";
import { isUsableConfirmedScheduleConstraint, itineraryItemCoversConfirmedTime } from "./confirmedScheduleConstraint";
import { buildScheduledRouteLegs, isRouteOptimizationFixedItem, isRouteOptimizationSwapTimeFeasible, type ScheduledRouteLeg } from "./routeEvidence";

const constraintKindLabel: Record<ConfirmedScheduleConstraint["kind"], string> = {
  reservation: "예약 일정",
  train: "기차 일정",
  bus: "버스 일정",
  "rental-car-return": "렌터카 반납",
  "mandatory-place": "필수 방문 장소",
};

function secondsLabel(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}초`;
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${minutes}분`;
}

function distanceLabel(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

function formatConstraintTime(constraint: ConfirmedScheduleConstraint) {
  return `${constraint.date}${constraint.startTime ? ` ${constraint.startTime}${constraint.endTime ? `~${constraint.endTime}` : ""}` : ""}`;
}

function confirmedConstraintIssue({
  constraint,
  item,
  title,
  summary,
}: {
  constraint: ConfirmedScheduleConstraint;
  item?: ItineraryItem;
  title: string;
  summary: string;
}): DuriReportIssue {
  const affectedPlaceIds = [...new Set([constraint.placeId, item?.placeId].filter((id): id is string => Boolean(id)))];
  return {
    id: `confirmed-schedule-${constraint.id}-${item?.id ?? "missing"}`,
    category: "confirmed-schedule",
    severity: "high",
    title,
    summary,
    date: constraint.date || item?.date,
    affectedItemIds: item ? [item.id] : [],
    affectedPlaceIds,
    affectedMemberIds: [],
    evidence: [
      {
        label: "확정 조건",
        value: `${constraintKindLabel[constraint.kind]} · ${formatConstraintTime(constraint)}`,
        source: constraint.source === "user-confirmed" ? "사용자 확인" : "사용자가 확인한 문서 정보",
        observedAt: constraint.confirmedAt,
        placeIds: affectedPlaceIds,
      },
      ...(item ? [{ label: "현재 일정", value: `${item.date} ${item.startTime}`, itemIds: [item.id], placeIds: item.placeId ? [item.placeId] : [] }] : []),
    ],
    suggestionSupported: false,
    constraintType: "hard",
    confidence: "high",
    source: "external-evidence",
  };
}

export function analyzeConfirmedScheduleConstraints(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const tripDates = new Set(getTripDates(snapshot.trip.startDate, snapshot.trip.endDate));
  return (snapshot.confirmedScheduleConstraints ?? []).flatMap((constraint) => {
    if (!isUsableConfirmedScheduleConstraint(constraint, snapshot.trip) || !tripDates.has(constraint.date)) {
      const reviewIssue = confirmedConstraintIssue({
        constraint,
        title: "확정 일정 정보가 올바르지 않아요",
        summary: `${constraint.label || "확정 일정"}의 날짜·시간·연결 대상을 다시 확인해 주세요. 확인되기 전에는 일정 판단에 사용하지 않아요.`,
      });
      // 검증에 사용할 수 없는 입력은 실제 일정 위반이 아니다. 사용자가 다시
      // 확인할 항목으로는 남기되 Hard 제약이나 긴급 TODO로 승격하지 않는다.
      return [{
        ...reviewIssue,
        severity: "low" as const,
        constraintType: "informational" as const,
        confidence: "high" as const,
      }];
    }
    const placeMatches = constraint.placeId
      ? snapshot.itinerary.filter((entry) => entry.placeId === constraint.placeId)
      : [];
    const exactPlaceMatch = placeMatches.find((entry) => entry.date === constraint.date
      && itineraryItemCoversConfirmedTime(entry, constraint));
    const item = constraint.itineraryItemId
      ? snapshot.itinerary.find((entry) => entry.id === constraint.itineraryItemId)
      : exactPlaceMatch
        ?? placeMatches.find((entry) => entry.date === constraint.date)
        ?? placeMatches[0];
    if (!item) {
      return [confirmedConstraintIssue({
        constraint,
        title: "확정한 일정이 일정표에서 누락됐어요",
        summary: `${constraint.label}은 반드시 포함해야 하는 일정으로 확인됐지만 현재 일정표에서 찾을 수 없어요.`,
      })];
    }
    const wrongPlace = Boolean(constraint.placeId && item.placeId !== constraint.placeId);
    const wrongDate = item.date !== constraint.date;
    const wrongTime = Boolean((constraint.startTime || constraint.endTime)
      && !itineraryItemCoversConfirmedTime(item, constraint));
    if (!wrongPlace && !wrongDate && !wrongTime) return [];
    return [confirmedConstraintIssue({
      constraint,
      item,
      title: "확정한 날짜나 시간이 변경됐어요",
      summary: `${constraint.label}은 ${formatConstraintTime(constraint)} 기준으로 확인되어 있어요. 현재 일정을 확정 조건과 다시 맞춰 주세요.`,
    })];
  });
}

/**
 * 같은 날 같은 placeId가 여러 번 등장하는 확정 사실만 찾는다. 재입장이 의도일
 * 수 있으므로 삭제 제안이나 Hard 판정은 하지 않고 사용자 확인용 Soft 제약으로 남긴다.
 */
export function analyzeDuplicateVisits(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const groups = new Map<string, ItineraryItem[]>();
  snapshot.itinerary.forEach((item) => {
    if (!item.placeId) return;
    const key = `${item.date}::${item.placeId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.values()].flatMap((items) => {
    if (items.length < 2) return [];
    const ordered = sortItineraryItemsByDateAndTime(items);
    const placeId = ordered[0].placeId as string;
    const placeName = snapshot.placesById[placeId]?.name ?? "같은 장소";
    return [{
      id: `duplicate-visit-${ordered[0].date}-${placeId}-${ordered.map((item) => item.id).join("-")}`,
      category: "duplicate-visit" as const,
      severity: "low" as const,
      title: `${placeName} 방문이 같은 날 여러 번 있어요`,
      summary: "재입장·숙소 복귀처럼 의도한 일정일 수 있어 자동 삭제하지 않아요. 중복 추가인지 한 번만 확인해 주세요.",
      date: ordered[0].date,
      affectedItemIds: ordered.map((item) => item.id),
      affectedPlaceIds: [placeId],
      affectedMemberIds: [],
      evidence: ordered.map((item) => ({
        label: "방문 일정",
        value: `${item.startTime}부터 ${item.durationMinutes}분${item.lockedForDuri ? " · 두리 잠금" : ""}`,
        itemIds: [item.id],
        placeIds: [placeId],
      })),
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "high" as const,
      source: "mobile-context" as const,
    }];
  });
}

export function findUsableRouteEstimateForLeg(
  estimates: readonly RouteLegEstimate[],
  leg: ScheduledRouteLeg,
  mode: DuriAnalysisSnapshot["trip"]["transport"],
  analyzedAt: string,
) {
  const analysisTime = Date.parse(analyzedAt);
  if (!Number.isFinite(analysisTime)) return undefined;
  return estimates
    .filter((estimate) => {
      const fetchedAt = Date.parse(estimate.fetchedAt);
      return estimate.fromItemId === leg.from.id
        && estimate.toItemId === leg.to.id
        && estimate.date === leg.date
        && estimate.departureTime === leg.departureTime
        && estimate.mode === mode
        && Number.isFinite(estimate.durationSeconds)
        && estimate.durationSeconds >= 0
        && Number.isFinite(estimate.distanceMeters)
        && estimate.distanceMeters >= 0
        && (estimate.tollFareWon === undefined || (Number.isFinite(estimate.tollFareWon) && estimate.tollFareWon >= 0))
        && (estimate.taxiFareWon === undefined || (Number.isFinite(estimate.taxiFareWon) && estimate.taxiFareWon >= 0))
        && (estimate.walkingSeconds === undefined
          || (Number.isFinite(estimate.walkingSeconds) && estimate.walkingSeconds >= 0 && estimate.walkingSeconds <= estimate.durationSeconds))
        && (estimate.transferCount === undefined || (Number.isInteger(estimate.transferCount) && estimate.transferCount >= 0))
        && Number.isFinite(fetchedAt)
        && fetchedAt <= analysisTime;
    })
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
}

function wonLabel(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/**
 * Backend 길찾기가 명시적으로 반환한 비용만 합산한다. 누락된 fare를 0원으로
 * 채우거나 실제 교통수단이 택시라고 가정하지 않는다.
 */
export function analyzeRouteCostEvidence(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  if (snapshot.localPlanningFactsStatus && snapshot.localPlanningFactsStatus !== "loaded") return [];
  if (snapshot.trip.transport !== "car") return [];
  const budgetSensitiveMemberIds = Object.values(snapshot.preferenceResults)
    .filter((result) => result.answers.budget === 0)
    .map((result) => result.userId)
    .sort();
  const byDate = new Map<string, { requiredLegCount: number; estimates: RouteLegEstimate[] }>();
  buildScheduledRouteLegs(snapshot).forEach((leg) => {
    const entry = byDate.get(leg.date) ?? { requiredLegCount: 0, estimates: [] };
    entry.requiredLegCount += 1;
    const estimate = findUsableRouteEstimateForLeg(snapshot.routeLegEstimates ?? [], leg, "car", analyzedAt);
    if (estimate) entry.estimates.push(estimate);
    byDate.set(leg.date, entry);
  });
  return [...byDate.entries()].flatMap(([date, { requiredLegCount, estimates }]) => {
    const tollEvidenceCount = estimates.filter((estimate) => estimate.tollFareWon !== undefined).length;
    const tollFareWon = estimates.reduce((total, estimate) => total + (estimate.tollFareWon ?? 0), 0);
    const hasCompleteTaxiEstimate = estimates.length === requiredLegCount
      && estimates.every((estimate) => estimate.taxiFareWon !== undefined);
    const taxiFareWon = hasCompleteTaxiEstimate
      ? estimates.reduce((total, estimate) => total + (estimate.taxiFareWon ?? 0), 0)
      : undefined;
    if (tollFareWon <= 0 && (!taxiFareWon || taxiFareWon <= 0)) return [];
    const itemIds = [...new Set(estimates.flatMap((estimate) => [estimate.fromItemId, estimate.toItemId]))];
    const placeIds = itemIds.flatMap((itemId) => {
      const placeId = snapshot.itinerary.find((item) => item.id === itemId)?.placeId;
      return placeId ? [placeId] : [];
    });
    return [{
      id: `route-cost-${date}-${itemIds.join("-")}`,
      category: "route" as const,
      severity: budgetSensitiveMemberIds.length ? "low" as const : "info" as const,
      title: budgetSensitiveMemberIds.length ? "절약 선호와 자동차 이동비를 함께 확인해 보세요" : "자동차 경로의 비용 추정치가 있어요",
      summary: `전체 ${requiredLegCount}개 중 조회에 성공한 ${estimates.length}개 구간에서 Backend가 명시적으로 반환한 비용만 합산했어요.${hasCompleteTaxiEstimate ? " 택시비는 전 구간에서 택시를 선택했을 때의 참고 추정치이며 실제 결제액이 아니에요." : " 조회 실패 또는 택시 추정값이 없는 구간이 있어 택시 합계를 만들지 않았어요."}`,
      date,
      affectedItemIds: itemIds,
      affectedPlaceIds: [...new Set(placeIds)],
      affectedMemberIds: budgetSensitiveMemberIds,
      evidence: [
        ...(tollFareWon > 0 ? [{ label: `확인된 ${tollEvidenceCount}/${requiredLegCount}개 구간 통행료 합계`, value: wonLabel(tollFareWon), source: "kakao-mobility", observedAt: estimates[0]?.fetchedAt }] : []),
        ...(taxiFareWon !== undefined && taxiFareWon > 0 ? [{ label: "전 구간 택시 이용 시 추정 합계", value: wonLabel(taxiFareWon), source: "kakao-mobility", observedAt: estimates[0]?.fetchedAt }] : []),
        { label: "비용 근거 구간", value: `${estimates.length}개`, itemIds },
      ],
      suggestionSupported: false,
      constraintType: budgetSensitiveMemberIds.length ? "soft" as const : "informational" as const,
      confidence: "medium" as const,
      source: "external-evidence" as const,
    }];
  });
}

export function analyzeRouteTimeConstraints(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  if (snapshot.localPlanningFactsStatus && snapshot.localPlanningFactsStatus !== "loaded") return [];
  const estimates = snapshot.routeLegEstimates ?? [];
  return buildScheduledRouteLegs(snapshot).flatMap((leg) => {
    const estimate = findUsableRouteEstimateForLeg(estimates, leg, snapshot.trip.transport, analyzedAt);
    if (!estimate || estimate.durationSeconds <= leg.availableSeconds) return [];
    const shortageSeconds = estimate.durationSeconds - leg.availableSeconds;
    const fromPlace = leg.from.placeId ? snapshot.placesById[leg.from.placeId] : undefined;
    const toPlace = leg.to.placeId ? snapshot.placesById[leg.to.placeId] : undefined;
    const affectedPlaceIds = [leg.from.placeId, leg.to.placeId].filter((id): id is string => Boolean(id));
    const timingDescription = estimate.timingBasis === "future-departure"
      ? "예정 출발시각 교통 예측"
      : estimate.timingBasis === "current-traffic"
        ? "분석 시점 자동차 교통"
        : "출발시각을 반영하지 않는 대중교통 경로";
    const isDepartureSpecific = estimate.timingBasis === "future-departure";
    const summary = `${fromPlace?.name ?? "이전 장소"}에서 ${toPlace?.name ?? "다음 장소"}까지 조회된 예상 이동시간은 ${secondsLabel(estimate.durationSeconds)}지만, 연속해서 사용할 수 있는 시간은 ${secondsLabel(leg.availableSeconds)}예요. 약 ${secondsLabel(shortageSeconds)}을 더 확보해 주세요.`;
    return [{
      id: `route-time-${leg.date}-${leg.from.id}-${leg.to.id}`,
      category: "route" as const,
      severity: isDepartureSpecific ? "high" as const : "medium" as const,
      title: "다음 장소까지 이동시간이 부족해요",
      summary,
      date: leg.date,
      affectedItemIds: [leg.from.id, leg.to.id],
      affectedPlaceIds,
      affectedMemberIds: [],
      evidence: [
        { label: "이동 가능 구간 시작", value: leg.departureTime, itemIds: [leg.from.id] },
        { label: "연속 사용 가능 시간", value: secondsLabel(leg.availableSeconds), itemIds: [leg.from.id, leg.to.id] },
        { label: "조회 경로", value: `${distanceLabel(estimate.distanceMeters)} · ${secondsLabel(estimate.durationSeconds)}`, source: estimate.provider, observedAt: estimate.fetchedAt, itemIds: [leg.from.id, leg.to.id], placeIds: affectedPlaceIds },
        { label: "시간 기준", value: timingDescription },
      ],
      suggestionSupported: false,
      constraintType: isDepartureSpecific ? "hard" as const : "soft" as const,
      confidence: isDepartureSpecific ? "high" as const : "medium" as const,
      source: "external-evidence" as const,
      technicalDetails: {
        model: "연속 일정 사이 이동시간 실행 가능성 검사",
        formulaLatex: String.raw`A_{ij}=s_j-e_i,\quad \Delta_{ij}=\max(0,T_{ij}-A_{ij}),\quad feasible_{ij}=\mathbf{1}[\Delta_{ij}=0]`,
        substitutedLatex: String.raw`\Delta_{ij}=\max(0,${estimate.durationSeconds}-${leg.availableSeconds})=${shortageSeconds}\;\mathrm{s}`,
        variables: [
          { symbol: "T_{ij}", label: "경로 공급자가 반환한 예상 이동시간", value: estimate.durationSeconds, formattedValue: secondsLabel(estimate.durationSeconds), unit: "초", source: `${estimate.provider} · ${estimate.fetchedAt}` },
          { symbol: "A_{ij}", label: "앞 일정 종료부터 다음 일정 시작까지 사용 가능한 시간", value: leg.availableSeconds, formattedValue: secondsLabel(leg.availableSeconds), unit: "초", source: "일정표" },
          { symbol: "\\Delta_{ij}", label: "부족한 이동시간", value: shortageSeconds, formattedValue: secondsLabel(shortageSeconds), unit: "초", source: "이동 예상시간과 일정 간격의 차이" },
        ],
        steps: [
          `앞 일정 종료 뒤 다음 일정 전까지 ${secondsLabel(leg.availableSeconds)}을 사용할 수 있습니다.`,
          `${timingDescription}으로 같은 구간의 이동시간 ${secondsLabel(estimate.durationSeconds)}을 확인했습니다.`,
          `예상 이동시간에서 사용 가능 시간을 빼 ${secondsLabel(shortageSeconds)} 부족으로 판정했습니다.`,
        ],
        result: summary,
        complexity: "일정 구간 l개와 수집 경로 e개를 현재 구현에서 대조하므로 최악 O(l·e)",
        caveats: [
          isDepartureSpecific ? "예정 출발시각을 반영한 경로입니다." : "예정 출발시각 자체의 교통 예측이 아니므로 실제 소요시간은 달라질 수 있습니다.",
          "길찾기 API가 반환하지 않은 주차·승강장 이동·대기시간은 임의로 더하지 않았습니다.",
        ],
      },
    }];
  });
}

export function analyzeTransitRouteDetails(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  if (snapshot.localPlanningFactsStatus && snapshot.localPlanningFactsStatus !== "loaded") return [];
  if (snapshot.trip.transport !== "public") return [];
  const estimates = snapshot.routeLegEstimates ?? [];
  return buildScheduledRouteLegs(snapshot).flatMap((leg) => {
    const estimate = findUsableRouteEstimateForLeg(estimates, leg, "public", analyzedAt);
    if (!estimate || (estimate.walkingSeconds === undefined && estimate.transferCount === undefined)) return [];
    const fromPlace = leg.from.placeId ? snapshot.placesById[leg.from.placeId] : undefined;
    const toPlace = leg.to.placeId ? snapshot.placesById[leg.to.placeId] : undefined;
    const affectedPlaceIds = [leg.from.placeId, leg.to.placeId].filter((id): id is string => Boolean(id));
    return [{
      id: `transit-detail-${leg.date}-${leg.from.id}-${leg.to.id}`,
      category: "route" as const,
      severity: "info" as const,
      title: "대중교통 경로의 도보·환승 정보를 확인해 보세요",
      summary: `${fromPlace?.name ?? "이전 장소"}에서 ${toPlace?.name ?? "다음 장소"}까지의 경로에 도보 ${secondsLabel(estimate.walkingSeconds ?? 0)}, 환승 ${estimate.transferCount ?? 0}회가 포함돼요. 짐·날씨에 따른 추가 여유는 임의로 더하지 않았어요.`,
      date: leg.date,
      affectedItemIds: [leg.from.id, leg.to.id],
      affectedPlaceIds,
      affectedMemberIds: [],
      evidence: [{ label: "Kakao 대중교통 경로", value: `총 ${secondsLabel(estimate.durationSeconds)} · 도보 ${secondsLabel(estimate.walkingSeconds ?? 0)} · 환승 ${estimate.transferCount ?? 0}회`, source: estimate.provider, observedAt: estimate.fetchedAt }],
      suggestionSupported: false,
      constraintType: "informational" as const,
      confidence: "medium" as const,
      source: "external-evidence" as const,
    }];
  });
}

function alternativeRouteSlotsRemainFeasible(
  snapshot: DuriAnalysisSnapshot,
  evaluation: RouteOrderEvaluation,
  currentItemIds: readonly string[],
  left: ItineraryItem,
  right: ItineraryItem,
) {
  const leftIndex = currentItemIds.indexOf(left.id);
  if (leftIndex < 0 || currentItemIds[leftIndex + 1] !== right.id) return false;
  const previousId = currentItemIds[leftIndex - 1];
  const nextId = currentItemIds[leftIndex + 2];
  const expectedPairs = [
    ...(previousId ? [[previousId, right.id] as const] : []),
    [right.id, left.id] as const,
    ...(nextId ? [[left.id, nextId] as const] : []),
  ];
  if (evaluation.alternativeLegs.length !== expectedPairs.length) return false;

  const swappedItinerary = snapshot.itinerary.map((item) => item.id === left.id
    ? { ...item, startTime: right.startTime }
    : item.id === right.id
      ? { ...item, startTime: left.startTime }
      : item);
  const scheduledLegs = buildScheduledRouteLegs({ trip: snapshot.trip, itinerary: swappedItinerary });
  return expectedPairs.every(([fromItemId, toItemId]) => {
    const evidence = evaluation.alternativeLegs.find((leg) => leg.fromItemId === fromItemId && leg.toItemId === toItemId);
    const scheduledLeg = scheduledLegs.find((leg) => leg.date === evaluation.date
      && leg.from.id === fromItemId
      && leg.to.id === toItemId);
    return Boolean(evidence
      && scheduledLeg
      && Number.isFinite(evidence.durationSeconds)
      && evidence.durationSeconds >= 0
      && Number.isFinite(evidence.availableSeconds)
      && evidence.availableSeconds === scheduledLeg.availableSeconds
      && evidence.durationSeconds <= evidence.availableSeconds);
  });
}

export function analyzeRouteOptimization(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  if ((snapshot.localPlanningFactsStatus && snapshot.localPlanningFactsStatus !== "loaded")
    || snapshot.scheduleOverlayStatus === "unavailable"
    || snapshot.documentCollectionStatus === "unavailable") return [];
  return (snapshot.routeOrderEvaluations ?? []).flatMap((evaluation) => {
    const currentItemIds = sortItineraryItemsByDateAndTime(snapshot.itinerary
      .filter((item) => item.date === evaluation.date && item.placeId))
      .map((item) => item.id);
    const sameOrder = currentItemIds.length === evaluation.itemIds.length
      && currentItemIds.every((itemId, index) => itemId === evaluation.itemIds[index]);
    const improvement = evaluation.currentDurationSeconds - evaluation.alternativeDurationSeconds;
    if (!sameOrder
      || !Number.isFinite(evaluation.currentDurationSeconds)
      || !Number.isFinite(evaluation.alternativeDurationSeconds)
      || evaluation.currentDurationSeconds < 0
      || evaluation.alternativeDurationSeconds < 0
      || improvement < SLOT_MINUTES * 60) return [];
    const [leftId, rightId] = evaluation.swappedItemIds;
    const leftOrder = currentItemIds.indexOf(leftId);
    if (leftOrder < 0 || currentItemIds[leftOrder + 1] !== rightId) return [];
    const left = snapshot.itinerary.find((item) => item.id === leftId);
    const right = snapshot.itinerary.find((item) => item.id === rightId);
    if (!left || !right) return [];
    if (!isRouteOptimizationSwapTimeFeasible(snapshot, evaluation.date, left, right)) return [];
    if (!alternativeRouteSlotsRemainFeasible(snapshot, evaluation, currentItemIds, left, right)) return [];
    const terminalItemId = currentItemIds.at(-1);
    const changesTerminalPlace = Boolean(
      snapshot.trip.endCondition
      && evaluation.date === snapshot.trip.endDate
      && terminalItemId
      && evaluation.swappedItemIds.includes(terminalItemId),
    );
    if (isRouteOptimizationFixedItem(snapshot, left)
      || isRouteOptimizationFixedItem(snapshot, right)
      || changesTerminalPlace) return [];
    const leftName = left.placeId ? snapshot.placesById[left.placeId]?.name : undefined;
    const rightName = right.placeId ? snapshot.placesById[right.placeId]?.name : undefined;
    const summary = `현재 확인된 잠금·예약·종료조건을 건드리지 않는 인접 교환에서, 조회된 경로 합계가 분석 시점 기준 ${secondsLabel(improvement)} 짧았어요. 두 장소의 운영시간 충족은 확인하지 못했으므로 경로 전용 후보로만 보여주고 자동 적용하지 않아요.`;
    return [{
      id: `route-optimization-${evaluation.date}-${leftId}-${rightId}`,
      category: "route-optimization" as const,
      severity: "medium" as const,
      title: `경로만 보면 ${leftName ?? "앞 일정"}과 ${rightName ?? "뒤 일정"} 순서를 검토할 수 있어요`,
      summary,
      date: evaluation.date,
      affectedItemIds: [leftId, rightId],
      affectedPlaceIds: [left.placeId, right.placeId].filter((id): id is string => Boolean(id)),
      affectedMemberIds: [],
      evidence: [
        { label: "현재 순서 이동시간", value: secondsLabel(evaluation.currentDurationSeconds), source: evaluation.provider, observedAt: evaluation.fetchedAt },
        { label: "인접 교환 후 이동시간", value: secondsLabel(evaluation.alternativeDurationSeconds), source: evaluation.provider, observedAt: evaluation.fetchedAt },
        { label: "운영시간 검증", value: "미완료 · 순서 변경 전 별도 확인 필요" },
        { label: "탐색 방식", value: "모든 인접 교환을 O(n)개 비교하고 변경된 방향 간선만 조회" },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      // 이동시간 자체가 출발시각 기준이어도 운영시간까지 확인된 일정 변경안은 아니다.
      confidence: "low" as const,
      source: "external-evidence" as const,
      technicalDetails: {
        model: "보호 제약을 보존하는 최적 인접 교환 탐색",
        formulaLatex: String.raw`\Delta_k=C(\pi)-C(\pi\circ(k\;k{+}1)),\quad k^*=\arg\max_{k\in F}\Delta_k`,
        substitutedLatex: String.raw`\Delta_{k^*}=${evaluation.currentDurationSeconds}-${evaluation.alternativeDurationSeconds}=${improvement}\;\mathrm{s}`,
        variables: [
          { symbol: "C(\\pi)", label: "현재 순서의 확인된 이동시간 합", value: evaluation.currentDurationSeconds, formattedValue: secondsLabel(evaluation.currentDurationSeconds), unit: "초", source: `${evaluation.provider} · ${evaluation.fetchedAt}` },
          { symbol: "C(\\pi')", label: "인접 두 일정을 바꾼 순서의 이동시간 합", value: evaluation.alternativeDurationSeconds, formattedValue: secondsLabel(evaluation.alternativeDurationSeconds), unit: "초", source: `${evaluation.provider} · ${evaluation.fetchedAt}` },
          { symbol: "\\Delta_{k^*}", label: "가장 큰 확인 절감시간", value: improvement, formattedValue: secondsLabel(improvement), unit: "초", source: "실행 가능한 인접 교환 비교" },
          { symbol: "F", label: "잠금·확정 예약·티켓·종료조건·시간충돌을 통과한 교환", value: `${leftName ?? leftId} ↔ ${rightName ?? rightId}`, formattedValue: `${leftName ?? leftId} ↔ ${rightName ?? rightId}`, source: "일정 보호 규칙" },
        ],
        steps: [
          "현재 순서에서 인접한 두 장소를 바꾸는 후보만 만들었습니다.",
          "두리 잠금, 확정 예약, 티켓 연결, 마지막 날 종료 지점, 변경 후 시간 충돌을 하나라도 위반한 후보는 제외했습니다.",
          `남은 후보의 바뀐 방향 간선을 다시 조회해 현재 ${secondsLabel(evaluation.currentDurationSeconds)}, 대안 ${secondsLabel(evaluation.alternativeDurationSeconds)}을 비교했습니다.`,
        ],
        result: summary,
        complexity: "하루 장소 n개에 대해 인접 후보 O(n), 변경 간선은 후보당 최대 3개; 경로 조회도 O(n)",
        caveats: ["이 증명은 인접 교환 이웃 안의 최선이며 전체 순열의 전역 최적해를 보장하지 않습니다.", "대안 장소의 운영시간이 확인되지 않아 실제 적용 후보로 승격하지 않았습니다."],
      },
    }];
  });
}

export function analyzeDocumentReferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const references = snapshot.documentReferences ?? [];
  if (!references.length) return [];
  const structuredIds = new Set((snapshot.confirmedScheduleConstraints ?? []).flatMap((constraint) => constraint.sourceDocumentId ? [constraint.sourceDocumentId] : []));
  // 한 파일에 확정 fact와 미확정 fact가 함께 있을 수 있다. 문서 ID 하나가
  // structured라는 이유로 남은 OCR 후보를 숨기지 않는다.
  const unresolved = references.filter((reference) =>
    !structuredIds.has(reference.id) || (reference.pendingReviewFactIds?.length ?? 0) > 0);
  if (!unresolved.length) return [];
  const linkedItemIds = [...new Set(unresolved.flatMap((reference) => reference.itineraryItemIds))].sort();
  const linkedPlaceIds = [...new Set(linkedItemIds.flatMap((itemId) => {
    const placeId = snapshot.itinerary.find((item) => item.id === itemId)?.placeId;
    return placeId ? [placeId] : [];
  }))].sort();
  const needsReviewCount = unresolved.filter((reference) => reference.extractionStatus === "needs-review" || (reference.pendingReviewFactIds?.length ?? 0) > 0).length;
  const unavailableCount = unresolved.filter((reference) => reference.extractionStatus === "failed" || reference.extractionStatus === "unsupported").length;
  const confirmedButUnusableCount = unresolved.filter((reference) => reference.extractionStatus === "confirmed" && !structuredIds.has(reference.id)).length;
  const statusSummary = [
    needsReviewCount ? `추출 결과 확인 필요 ${needsReviewCount}개` : "",
    unavailableCount ? `OCR 미지원·실패 ${unavailableCount}개` : "",
    confirmedButUnusableCount ? `확정했지만 날짜·대상 연결 부족 ${confirmedButUnusableCount}개` : "",
  ].filter(Boolean).join(" · ");
  return [{
    id: `document-check-${unresolved.map((reference) => reference.id).sort().join("-")}`,
    category: "document-check",
    severity: "low",
    title: "첨부 문서에서 확인할 예약 정보가 남아 있어요",
    summary: `${unresolved.length}개 문서에는 아직 확인이 필요한 예약 정보가 있어요.${statusSummary ? ` ${statusSummary}.` : ""} OCR 추정값만으로 예약 누락이나 지각 여부를 하드 제약으로 단정하지 않았어요.`,
    affectedItemIds: linkedItemIds,
    affectedPlaceIds: linkedPlaceIds,
    affectedMemberIds: [],
    evidence: [
      { label: "미확정·미연결 문서", value: `${unresolved.length}개 · 일정 연결 ${linkedItemIds.length}개` },
      ...(statusSummary ? [{ label: "추출 상태", value: statusSummary }] : []),
    ],
    suggestionSupported: false,
    constraintType: "informational",
    confidence: "high",
    source: "mobile-context",
  }];
}
