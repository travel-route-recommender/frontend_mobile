import type { EntityId, UserPreferenceResult } from "../../domain";
import { timeStringToMinutes } from "../../utils/schedule";
import { isSupportedPreferenceResult } from "../group-preferences";
import { categoryStatusFromIssues, getItemEndMinutes, groupItineraryByDate, insufficientCategory } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";

type MinuteInterval = { start: number; end: number };

type PreferenceInterval = {
  memberId: EntityId;
  memberName: string;
  value: number;
  resolution: number;
  lower: number;
  upper: number;
};

type IntervalDeviation = PreferenceInterval & {
  direction: "below" | "inside" | "above";
  distanceMinutes: number;
  normalizedDistance: number;
};

function mergeIntervals(intervals: readonly MinuteInterval[]) {
  const sorted = intervals
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: MinuteInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function unionMinutes(intervals: readonly MinuteInterval[]) {
  return mergeIntervals(intervals).reduce((total, interval) => total + interval.end - interval.start, 0);
}

function maxContinuousMinutes(intervals: readonly MinuteInterval[]) {
  return mergeIntervals(intervals).reduce((maximum, interval) => Math.max(maximum, interval.end - interval.start), 0);
}

function newestRouteMinutes(
  input: Pick<DuriAnalysisInput, "trip" | "routeLegEstimates" | "localPlanningFactsStatus">,
  fromItemId: string,
  toItemId: string,
  date: string,
) {
  if (input.localPlanningFactsStatus && input.localPlanningFactsStatus !== "loaded") return undefined;
  const estimate = (input.routeLegEstimates ?? [])
    .filter((entry) => entry.fromItemId === fromItemId
      && entry.toItemId === toItemId
      && entry.date === date
      && entry.mode === input.trip.transport
      && Number.isFinite(entry.durationSeconds)
      && entry.durationSeconds >= 0
      && Number.isFinite(Date.parse(entry.fetchedAt)))
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
  return estimate ? Math.ceil(estimate.durationSeconds / 60) : undefined;
}

function isDetailedPreferenceResult(
  result: UserPreferenceResult,
): result is UserPreferenceResult & { detailedSignals: NonNullable<UserPreferenceResult["detailedSignals"]> } {
  return Boolean(result.detailedSignals)
    && isSupportedPreferenceResult(result, result.userId)
    && result.detailedSignals?.surveyVersion === 9
    && [7, 8, 9].includes(result.detailedSignals?.algorithmVersion ?? -1);
}

function memberName(input: DuriAnalysisInput, memberId: EntityId) {
  return input.members.find((member) => member.id === memberId)?.name ?? "참여자";
}

function preferenceInterval(
  input: DuriAnalysisInput,
  result: UserPreferenceResult & { detailedSignals: NonNullable<UserPreferenceResult["detailedSignals"]> },
  kind: "daily" | "activity-block",
): PreferenceInterval | undefined {
  const signals = result.detailedSignals;
  const value = kind === "daily"
    ? signals.preferredDailyScheduledMinutes
    : signals.algorithmVersion >= 8
      ? signals.preferredAverageActivityBlockMinutes
      : signals.preferredAverageStayMinutes;
  const resolution = kind === "daily"
    ? signals.algorithmVersion >= 8
      ? signals.preferredDailyScheduledResolutionMinutes
      : signals.schedulePreferenceResolutionMinutes
    : signals.algorithmVersion >= 8
      ? signals.preferredAverageActivityBlockResolutionMinutes
      : signals.schedulePreferenceResolutionMinutes;
  if (!Number.isFinite(value) || !Number.isFinite(resolution) || (value ?? 0) <= 0 || (resolution ?? 0) <= 0) return undefined;
  const numericValue = value as number;
  const numericResolution = resolution as number;
  return {
    memberId: result.userId,
    memberName: memberName(input, result.userId),
    value: numericValue,
    resolution: numericResolution,
    lower: Math.max(0, numericValue - numericResolution / 2),
    upper: numericValue + numericResolution / 2,
  };
}

function preferenceIntervals(input: DuriAnalysisInput, kind: "daily" | "activity-block") {
  const tripMemberIds = new Set(input.trip.members.map((member) => member.userId));
  return Object.values(input.preferenceResults)
    .filter(isDetailedPreferenceResult)
    .filter((result) => tripMemberIds.has(result.userId))
    .flatMap((result) => {
      const interval = preferenceInterval(input, result, kind);
      return interval ? [interval] : [];
    })
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
}

function intervalDeviation(actual: number, preference: PreferenceInterval): IntervalDeviation {
  const direction = actual < preference.lower ? "below" : actual > preference.upper ? "above" : "inside";
  const distanceMinutes = direction === "below"
    ? preference.lower - actual
    : direction === "above"
      ? actual - preference.upper
      : 0;
  return {
    ...preference,
    direction,
    distanceMinutes,
    normalizedDistance: distanceMinutes / preference.resolution,
  };
}

function clockLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function numberLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * 일정 밀도는 임의의 장소 개수나 고정 휴식시간으로 판정하지 않는다.
 * 사용자가 직접 만든 설문 시간표를 폐구간으로 보고, 현재 일정의 관측 하한이
 * 그 구간에서 얼마나 떨어졌는지 계산한다. 경로를 못 구한 시간은 0분 이동으로
 * 간주하지 않기 때문에 `committedMinutes`는 보수적인 하한이다.
 */
export function analyzeDensity(input: DuriAnalysisInput): CategoryAnalysisResult {
  if (input.itinerary.length < 2) return insufficientCategory("density", "일정이 더 모이면 참여자별 희망 일정량과 비교할 수 있어요.");

  const dailyPreferences = preferenceIntervals(input, "daily");
  const activityBlockPreferences = preferenceIntervals(input, "activity-block");
  const tripMemberCount = new Set(input.trip.members.map((member) => member.userId)).size;
  const issues: AnalysisIssue[] = [];
  let analyzableDayCount = 0;
  let analyzableItemCount = 0;

  for (const [date, dayItems] of groupItineraryByDate(input.itinerary)) {
    const items = dayItems.filter((item) => Number.isFinite(timeStringToMinutes(item.startTime)) && item.durationMinutes > 0);
    if (!items.length) continue;
    analyzableDayCount += 1;
    analyzableItemCount += items.length;

    const scheduleIntervals = items.map((item) => ({ start: timeStringToMinutes(item.startTime), end: getItemEndMinutes(item) }));
    const activityIntervals = items
      .filter((item) => item.itemType !== "rest")
      .map((item) => ({ start: timeStringToMinutes(item.startTime), end: getItemEndMinutes(item) }));
    const explicitRestIntervals = items
      .filter((item) => item.itemType === "rest")
      .map((item) => ({ start: timeStringToMinutes(item.startTime), end: getItemEndMinutes(item) }));

    const routeIntervals: MinuteInterval[] = [];
    const routeIdleMargins: number[] = [];
    let requiredPlaceLegCount = 0;
    let analyzedPlaceLegCount = 0;
    let unknownPositiveGapCount = 0;
    items.slice(1).forEach((item, index) => {
      const previous = items[index];
      if (!previous.placeId || !item.placeId) return;
      requiredPlaceLegCount += 1;
      const previousEnd = getItemEndMinutes(previous);
      const nextStart = timeStringToMinutes(item.startTime);
      const routeMinutes = newestRouteMinutes(input, previous.id, item.id, date);
      if (routeMinutes === undefined) {
        if (nextStart > previousEnd) unknownPositiveGapCount += 1;
        return;
      }
      analyzedPlaceLegCount += 1;
      routeIntervals.push({ start: previousEnd, end: previousEnd + routeMinutes });
      routeIdleMargins.push(Math.max(0, nextStart - previousEnd - routeMinutes));
    });

    const committedMinutes = unionMinutes([...scheduleIntervals, ...routeIntervals]);
    const maximumContinuousMinutes = maxContinuousMinutes([...activityIntervals, ...routeIntervals]);
    const explicitRestMinutes = unionMinutes(explicitRestIntervals);
    const verifiedIdleMinutes = routeIdleMargins.reduce((total, minutes) => total + minutes, 0);
    const firstStart = Math.min(...scheduleIntervals.map((interval) => interval.start));
    const lastEnd = Math.max(...scheduleIntervals.map((interval) => interval.end));

    const dailyDeviations = dailyPreferences.map((preference) => intervalDeviation(committedMinutes, preference));
    // 평균 활동 블록 응답은 짧은 개별 방문의 최솟값이 아니다. 따라서 짧은 일정은
    // 판정하지 않고, 확인된 연속 활동이 응답 상한을 넘는 경우만 보수적으로 사용한다.
    const blockDeviations = activityBlockPreferences
      .map((preference) => intervalDeviation(maximumContinuousMinutes, preference))
      .map((deviation) => deviation.direction === "below" ? { ...deviation, direction: "inside" as const, distanceMinutes: 0, normalizedDistance: 0 } : deviation);
    const dailyAbove = dailyDeviations.filter((entry) => entry.direction === "above");
    const dailyBelow = dailyDeviations.filter((entry) => entry.direction === "below");
    const blockAbove = blockDeviations.filter((entry) => entry.direction === "above");
    const deviating = [...dailyAbove, ...dailyBelow, ...blockAbove];
    const affectedMemberIds = [...new Set(deviating.map((entry) => entry.memberId))].sort();
    const observedMemberIds = [...new Set([...dailyPreferences, ...activityBlockPreferences].map((entry) => entry.memberId))].sort();
    const worst = [...deviating].sort((left, right) => right.normalizedDistance - left.normalizedDistance || left.memberId.localeCompare(right.memberId))[0];
    const allMembersObserved = observedMemberIds.length === tripMemberCount;
    const allObservedAffected = observedMemberIds.length > 0 && affectedMemberIds.length === observedMemberIds.length;
    const mixedDirections = dailyAbove.length > 0 && dailyBelow.length > 0;
    const needsAttention = deviating.length > 0;
    const severity = needsAttention && (mixedDirections || (allMembersObserved && allObservedAffected && dailyAbove.length > 0)) ? "medium" : needsAttention ? "low" : "info";

    const title = mixedDirections
      ? "동행자마다 원하는 하루 일정량이 달라요"
      : dailyAbove.length
        ? allObservedAffected ? "현재 일정이 동행자들의 희망 범위를 넘어요" : "일부 동행자에게 현재 일정이 길 수 있어요"
        : blockAbove.length
          ? "쉬지 않고 이어지는 활동이 길 수 있어요"
          : dailyBelow.length
            ? "자동으로 더 채울 수 있는 일정 여유가 있어요"
            : observedMemberIds.length
              ? "현재 일정량이 응답한 동행자의 범위 안에 있어요"
              : "희망 일정량 응답이 없어 밀도 판정을 보류했어요";
    const summary = mixedDirections
      ? `${date} 일정은 확인된 이동을 포함해 최소 ${committedMinutes}분이에요. 같은 일정이 누군가에게는 길고 다른 사람에게는 짧아, 평균 하나로 맞추지 않고 각자의 허용 범위를 함께 보여드려요.`
      : dailyAbove.length
        ? `${date} 일정은 확인된 이동을 포함해 최소 ${committedMinutes}분이며, ${dailyAbove.map((entry) => entry.memberName).join(", ")}님의 직접 응답 상한을 넘어요.`
        : blockAbove.length
          ? `${date}에 확인된 연속 활동은 최대 ${maximumContinuousMinutes}분이며, ${blockAbove.map((entry) => entry.memberName).join(", ")}님의 직접 응답 상한을 넘어요.`
          : dailyBelow.length
            ? `${date} 일정은 최소 ${committedMinutes}분으로, ${dailyBelow.map((entry) => entry.memberName).join(", ")}님의 희망 범위보다 짧아요. 빈 시간 자동 채우기 후보로 활용할 수 있어요.`
            : observedMemberIds.length
              ? `${date}의 최소 일정 점유 ${committedMinutes}분과 최대 연속 활동 ${maximumContinuousMinutes}분이 현재 확인 가능한 선호 구간 안에 있어요.`
              : `${date}에는 ${items.length}개 일정이 있지만, 직접 구성한 희망 시간표가 없어 많고 적음을 임의 기준으로 판정하지 않았어요.`;

    const preferenceEvidence = [...dailyDeviations.map((entry) => ({
      label: `${entry.memberName}님의 하루 희망 구간`,
      value: `${numberLabel(entry.lower)}~${numberLabel(entry.upper)}분 · 현재 하한과 ${entry.direction === "inside" ? "구간 안" : `${numberLabel(entry.distanceMinutes)}분 ${entry.direction === "above" ? "초과" : "부족"}`}`,
      memberIds: [entry.memberId],
    })), ...blockDeviations.map((entry) => ({
      label: `${entry.memberName}님의 활동 블록 구간`,
      value: `${numberLabel(entry.lower)}~${numberLabel(entry.upper)}분 · 확인된 연속 활동과 ${entry.direction === "inside" ? "상한 안" : `${numberLabel(entry.distanceMinutes)}분 초과`}`,
      memberIds: [entry.memberId],
    }))];

    issues.push({
      id: `density-robust-${date}`,
      category: "density",
      status: needsAttention ? "attention" : "good",
      severity,
      title,
      summary,
      date,
      affectedItemIds: items.map((item) => item.id),
      affectedPlaceIds: items.flatMap((item) => item.placeId ? [item.placeId] : []),
      affectedMemberIds,
      evidence: [
        { label: "일정 점유 하한", value: `${committedMinutes}분 · 겹치는 시간은 한 번만 계산`, itemIds: items.map((item) => item.id) },
        { label: "확인된 최대 연속 활동", value: `${maximumContinuousMinutes}분 · 명시적 휴식 ${explicitRestMinutes}분` },
        { label: "실제 경로 반영", value: `${analyzedPlaceLegCount}/${requiredPlaceLegCount}구간 · 이동 후 확인된 빈 시간 ${verifiedIdleMinutes}분${unknownPositiveGapCount ? ` · 경로 미확인 공백 ${unknownPositiveGapCount}회는 휴식 판정 보류` : ""}` },
        { label: "일정 범위", value: `${clockLabel(firstStart)}–${clockLabel(lastEnd)} · ${items.length}개` },
        ...preferenceEvidence,
      ],
      // 현재 검사는 일정량 차이를 정확히 설명하지만, 무엇을 줄이거나 어느
      // 장소를 옮길지는 후보별 효용·경로·운영시간을 함께 풀어야 한다.
      // 예전의 고정 60분 이동/휴식 제안으로 연결하지 않는다.
      suggestionSupported: false,
      constraintType: needsAttention ? "soft" : "informational",
      confidence: observedMemberIds.length === 0 ? "unknown" : allMembersObserved ? "medium" : "low",
      technicalDetails: {
        model: "측정구간 기반 최소최대 후회 일정량 진단",
        formulaLatex: String.raw`L_d=\mu\!\left(\bigcup_{i\in I_d}[s_i,e_i]\cup\bigcup_{k\in E_d^*}[s_k,s_k+t_k]\right),\quad P_u=\left[p_u-\frac{q_u}{2},p_u+\frac{q_u}{2}\right],\quad R_{u,d}=\frac{\operatorname{dist}(L_d,P_u)}{q_u},\quad R_\infty=\max_u R_{u,d}`,
        substitutedLatex: String.raw`L_d=${committedMinutes},\quad C_{\max}=${maximumContinuousMinutes},\quad R_\infty=${numberLabel(worst?.normalizedDistance ?? 0)}`,
        variables: [
          { symbol: "L_d", label: "겹침을 제거한 일정과 확인된 이동의 점유 하한", value: committedMinutes, formattedValue: `${committedMinutes}분`, unit: "분", source: "일정표와 조회 성공 경로" },
          { symbol: "C_{\\max}", label: "확인된 최대 연속 활동", value: maximumContinuousMinutes, formattedValue: `${maximumContinuousMinutes}분`, unit: "분", source: "비휴식 일정과 조회 성공 경로" },
          { symbol: "P_u", label: "참여자별 희망 시간의 측정 구간", value: dailyPreferences.map((entry) => `${entry.memberName}:${numberLabel(entry.lower)}~${numberLabel(entry.upper)}`).join(", ") || "관측 없음", formattedValue: dailyPreferences.map((entry) => `${entry.memberName} ${numberLabel(entry.lower)}~${numberLabel(entry.upper)}분`).join(" · ") || "관측 없음", source: "참여자가 직접 만든 성향 설문 시간표와 시간칸 해상도" },
          { symbol: "R_{\\infty}", label: "가장 불리한 참여자의 정규화된 구간 밖 거리", value: worst?.normalizedDistance ?? 0, formattedValue: numberLabel(worst?.normalizedDistance ?? 0), source: "현재 일정량과 참여자별 측정구간" },
        ],
        steps: [
          `겹치는 일정을 중복 합산하지 않고 시간 구간의 합집합을 계산해 ${committedMinutes}분을 얻었습니다.`,
          `실제 경로를 조회한 ${analyzedPlaceLegCount}개 구간만 이동시간으로 더하고, 실패한 구간은 0분으로 추정하지 않았습니다.`,
          "각 참여자의 설문값에 시간칸 해상도의 절반을 더하고 빼서 허용 구간을 만들었습니다.",
          worst ? `가장 큰 구간 밖 거리는 ${worst.memberName}님의 ${numberLabel(worst.distanceMinutes)}분, 해상도 단위로 ${numberLabel(worst.normalizedDistance)}였습니다.` : "모든 관측값이 현재 확인 가능한 구간 안에 있었습니다.",
        ],
        result: summary,
        complexity: "일정 n개와 참여자 m명에 대해 O(n log n + m), 메모리 O(n + m)",
        caveats: [
          "경로 조회에 실패한 이동은 합계에서 제외하므로 일정 점유시간은 실제값의 하한입니다.",
          "설문 시간표는 의학적 체력 한계가 아니라 사용자가 직접 표현한 계획 선호입니다.",
          "평균 활동 블록보다 짧은 개별 방문은 곧 불만족이라는 뜻이 아니므로 짧다는 이유만으로 경고하지 않습니다.",
        ],
      },
    });
  }

  if (!analyzableDayCount || analyzableItemCount < 2) return insufficientCategory("density", "유효한 일정 시간 정보가 부족해 일정량을 비교할 수 없어요.");
  const status = categoryStatusFromIssues(issues);
  const hasObservedPreference = dailyPreferences.length > 0 || activityBlockPreferences.length > 0;
  return {
    category: "density",
    status,
    summary: !hasObservedPreference
      ? "고정 기준을 쓰지 않고 참여자별 희망 시간표 응답을 기다리고 있어요."
      : status === "good"
        ? "현재 일정량이 응답한 참여자들의 측정 구간 안에 있어요."
        : "참여자별 희망 일정량과 현재 일정 사이의 차이를 확인해 주세요.",
    issues,
  };
}
