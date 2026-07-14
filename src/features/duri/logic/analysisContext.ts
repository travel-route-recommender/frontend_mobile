import type { ItineraryItem } from "../../../domain";
import type { AnalysisIssue } from "../../../duri/duri-analysis";
import { findTimeConflictsForDate } from "../../workspace/logic/workspaceDateTime";
import { getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";
import { DURI_MOBILE_CONTEXT_CONFIG } from "../constants";
import type {
  DuriAnalysisCoverage,
  DuriAnalysisSnapshot,
  DuriCandidateUsage,
  DuriDayMetric,
  DuriGroupInsight,
  DuriReportIssue,
} from "../types";

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
        source: "mobile-context" as const,
      };
    }),
  );
}

function minutesToLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function analyzeDayBalance(snapshot: DuriAnalysisSnapshot): { metrics: DuriDayMetric[]; issues: DuriReportIssue[] } {
  const dates = getTripDates(snapshot.trip.startDate, snapshot.trip.endDate);
  const metrics = dates.map((date) => {
    const items = sortItineraryItemsByDateAndTime(snapshot.itinerary.filter((item) => item.date === date && isValidScheduleRange(item)));
    const longGapMinutes = items.slice(1).reduce((total, item, index) => {
      const previous = items[index];
      const gap = timeStringToMinutes(item.startTime) - (timeStringToMinutes(previous.startTime) + previous.durationMinutes);
      return total + (gap >= DURI_MOBILE_CONTEXT_CONFIG.longGapMinutes ? gap : 0);
    }, 0);
    return {
      date,
      itemCount: items.length,
      scheduledMinutes: items.reduce((total, item) => total + item.durationMinutes, 0),
      conflictCount: uniqueConflictPairs(items, date).length,
      longGapMinutes,
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
  const placeItems = snapshot.itinerary.filter((item) => item.placeId && snapshot.placesById[item.placeId]);
  const coordinateCount = placeItems.filter((item) => {
    const place = snapshot.placesById[item.placeId as string] as typeof snapshot.placesById[string] & { latitude?: number; longitude?: number };
    return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
  }).length;
  const routeData = coordinateCount >= 2 && coordinateCount === placeItems.length
    ? "available"
    : coordinateCount > 0
      ? "partial"
      : "unavailable";
  return {
    itinerary: snapshot.itinerary.length === 0 ? "insufficient" : snapshot.itinerary.length === 1 ? "partial" : "complete",
    preferences: snapshot.groupPreferenceDiagnosis.coverage,
    routeData,
    routeMessage: routeData === "available"
      ? "모든 관련 장소 좌표로 직선거리 흐름만 계산했어요. 실제 도로 거리나 이동시간은 아니에요."
      : routeData === "partial"
        ? "일부 장소만 좌표가 있어 직선거리 동선 판단은 완료하지 않았어요."
        : "장소 좌표가 없어 직선거리 동선은 분석하지 않았어요. 주소 권역 근거가 있으면 권역 전환만 참고로 보여줘요.",
  };
}

export function mapCoreIssues(issues: AnalysisIssue[]): DuriReportIssue[] {
  return issues.map((issue) => ({
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    summary: issue.summary,
    date: issue.date,
    affectedItemIds: [...issue.affectedItemIds],
    affectedPlaceIds: [...issue.affectedPlaceIds],
    affectedMemberIds: [...issue.affectedMemberIds],
    evidence: issue.evidence.map((entry) => ({ ...entry, itemIds: entry.itemIds ? [...entry.itemIds] : undefined, placeIds: entry.placeIds ? [...entry.placeIds] : undefined, memberIds: entry.memberIds ? [...entry.memberIds] : undefined })),
    suggestionSupported: issue.severity !== "info",
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
