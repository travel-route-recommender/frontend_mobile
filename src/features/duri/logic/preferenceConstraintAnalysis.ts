import type { Place, PreferenceDimension, UserPreferenceResult } from "../../../domain";
import {
  calculateFairPreferenceCompromise,
  deriveKemenyConsensus,
  deriveMobilityConsensus,
  isSupportedPreferenceResult,
  normalizedKendallDistance,
  solveIntervalPreferenceConsensus,
} from "../../../duri/group-preferences";
import { getTripDates, timeStringToMinutes } from "../../../utils/schedule";
import type { DuriAnalysisSnapshot, DuriReportIssue } from "../types";
import { buildScheduledRouteLegs } from "./routeEvidence";
import { findUsableRouteEstimateForLeg } from "./scheduleConstraintAnalysis";
import { findSharedCandidateSignalConflicts, getSharedAxisObservations, getUsableSharedPreferenceEvidence } from "./sharedPreferenceEvidence";

const dimensionLabels: Record<PreferenceDimension, string> = {
  pace: "일정 밀도",
  budget: "예산 사용",
  mobility: "이동 부담",
  activity: "활동 강도",
  mealStyle: "식사 방식",
  planningStyle: "계획 방식",
};

const dimensionValueLabels: Record<PreferenceDimension, readonly [string, string, string]> = {
  pace: ["여유 있게", "균형 있게", "알차게"],
  budget: ["절약 우선", "균형 지출", "경험 우선"],
  mobility: ["이동 부담 최소", "적당한 이동", "넓은 이동 허용"],
  activity: ["낮은 활동 강도", "관광·휴식 균형", "활동적인 일정"],
  mealStyle: ["대기 최소", "상황에 맞춘 식사", "맛집 우선"],
  planningStyle: ["확정 일정 선호", "기본 계획 후 조정", "자유로운 변경 선호"],
};

const mobilityModeLabels: Record<string, string> = {
  ownCar: "자차",
  rentalCar: "렌터카",
  taxi: "택시",
  bus: "버스",
  subway: "지하철",
  train: "기차",
  walk: "도보",
};

const mobilityConstraintLabels: Record<string, string> = {
  STAIRS: "계단 이동이 어려움",
  STEEP_SLOPE: "급경사 이동이 어려움",
  LONG_WALK: "긴 도보 이동이 어려움",
};

const budgetLabels: Record<string, string> = {
  food: "식사",
  stay: "숙소",
  activity: "체험·관광",
  mobility: "이동",
  shopping: "쇼핑",
};

function labelFor(dictionary: Record<string, string>, value: string) {
  return dictionary[value] ?? value;
}

const categoryKeywords = {
  restaurant: ["음식", "식당", "맛집", "레스토랑", "한식", "양식", "일식", "중식"],
  cafe: ["카페", "커피", "디저트", "베이커리"],
  shopping: ["쇼핑", "시장", "백화점", "상점", "기념품"],
  attraction: ["명소", "관광", "박물관", "미술관", "전망", "랜드마크"],
  local: ["로컬", "전통", "시장", "골목", "마을"],
  experience: ["체험", "액티비티", "공방", "투어", "레포츠"],
  nature: ["자연", "공원", "산", "바다", "해변", "숲", "수목원"],
} as const satisfies Record<string, readonly string[]>;

const categoryLabels: Record<keyof typeof categoryKeywords, string> = {
  restaurant: "식당",
  cafe: "카페",
  shopping: "쇼핑",
  attraction: "관광·명소",
  local: "로컬·전통",
  experience: "체험",
  nature: "자연",
};

type SupportedCategory = keyof typeof categoryKeywords;

function isSupportedCategory(value: string): value is SupportedCategory {
  return Object.prototype.hasOwnProperty.call(categoryKeywords, value);
}

function normalizedPlaceText(place: Place) {
  return [place.name, place.category, ...place.tags].join(" ").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function matchesCategory(place: Place, category: SupportedCategory) {
  const text = normalizedPlaceText(place);
  return (categoryKeywords[category] ?? []).some((keyword) => text.includes(keyword.replace(/\s+/g, "")));
}

function memberName(snapshot: DuriAnalysisSnapshot, userId: string) {
  return snapshot.members.find((member) => member.id === userId)?.name ?? "참여자";
}

function tripMemberIds(snapshot: DuriAnalysisSnapshot) {
  return [...new Set(snapshot.trip.members.map((member) => member.userId).filter(Boolean))];
}

function observationConfidence(observedCount: number, totalCount: number): "medium" | "low" {
  return observedCount === totalCount ? "medium" : "low";
}

function detailedResults(snapshot: DuriAnalysisSnapshot) {
  return Object.values(snapshot.preferenceResults)
    .filter((result): result is UserPreferenceResult & { detailedSignals: NonNullable<UserPreferenceResult["detailedSignals"]> } => (
      Boolean(result.detailedSignals)
      && isSupportedPreferenceResult(result, result.userId)
      && result.detailedSignals?.surveyVersion === 9
      && (result.detailedSignals?.algorithmVersion === 7
        || result.detailedSignals?.algorithmVersion === 8
        || result.detailedSignals?.algorithmVersion === 9)
    ));
}

type DetailedPreferenceResult = ReturnType<typeof detailedResults>[number];

function dailyPreferenceResolution(result: DetailedPreferenceResult) {
  return result.detailedSignals.algorithmVersion >= 8
    ? result.detailedSignals.preferredDailyScheduledResolutionMinutes
    : result.detailedSignals.schedulePreferenceResolutionMinutes;
}

function averageActivityBlockPreference(result: DetailedPreferenceResult) {
  const signals = result.detailedSignals;
  if (signals.algorithmVersion >= 8 && signals.preferredAverageActivityBlockMinutes !== undefined) {
    return {
      value: signals.preferredAverageActivityBlockMinutes,
      resolution: signals.preferredAverageActivityBlockResolutionMinutes,
    };
  }
  return signals.algorithmVersion === 7
    ? { value: signals.preferredAverageStayMinutes, resolution: signals.schedulePreferenceResolutionMinutes }
    : { value: undefined, resolution: undefined };
}

function analyzeExplicitPreferenceDifferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  return (Object.keys(dimensionLabels) as PreferenceDimension[]).flatMap((dimension) => {
    const diagnosis = snapshot.groupPreferenceDiagnosis.dimensions[dimension];
    if (diagnosis.spread !== 2) return [];
    const low = diagnosis.responses.filter((entry) => entry.score === 0).map((entry) => entry.userId);
    const high = diagnosis.responses.filter((entry) => entry.score === 2).map((entry) => entry.userId);
    const compromise = calculateFairPreferenceCompromise(diagnosis.responses);
    const compromiseLabel = compromise.recommendedScore === undefined
      ? "동행자 확인 필요"
      : dimensionValueLabels[dimension][compromise.recommendedScore];
    return [{
      id: `preference-coordination-${dimension}`,
      category: "preference" as const,
      severity: "medium" as const,
      title: `${dimensionLabels[dimension]} 선호 차이가 커요`,
      summary: `${low.map((id) => memberName(snapshot, id)).join(", ")}님과 ${high.map((id) => memberName(snapshot, id)).join(", ")}님의 직접 응답이 양 끝으로 달라요. Pareto 효율 대안 중 최저 만족도와 Nash 후생을 순서대로 최대화하면 '${compromiseLabel}'가 세 선택지 안의 정확한 공동 조율점이에요. 자동 변경하지는 않아요.`,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: [...low, ...high].sort(),
      evidence: diagnosis.responses.map((response) => ({
        label: memberName(snapshot, response.userId),
        value: `${dimensionValueLabels[dimension][response.score]} · 직접 응답 ${response.score}/2`,
        memberIds: [response.userId],
      })).concat({
        label: "공정 최적 조율안",
        value: `${compromiseLabel} · 최저 만족도 ${(compromise.minimumSatisfaction * 100).toFixed(0)}% · Nash 후생 ${(compromise.nashWelfare * 100).toFixed(0)}%`,
        memberIds: compromise.mostAffectedMemberIds,
      }).concat({
        label: "최적성·계산 가정",
        value: `3개 대안 완전탐색 · Pareto 효율 ${compromise.paretoEfficient ? "충족" : "미확인"} · 응답자 동일 가중치 · 인접 단계 등거리`,
        memberIds: [],
      }),
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: observationConfidence(diagnosis.responses.length, tripMemberIds(snapshot).length),
      source: "mobile-context" as const,
    }];
  });
}

function analyzeMobilityConsensus(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const responses = detailedResults(snapshot)
    .filter((result) => result.detailedSignals.mobilityModes.length > 0)
    .map((result) => ({ userId: result.userId, modes: result.detailedSignals.mobilityModes }));
  if (responses.length < 2) return [];
  const consensus = deriveMobilityConsensus(responses);
  if (consensus.commonModes.length > 0) return [];
  const alternatives = consensus.mostSupportedModes.map((mode) => {
    const supporters = consensus.supportByMode[mode] ?? [];
    return `${labelFor(mobilityModeLabels, mode)} ${supporters.length}/${responses.length}명`;
  });
  return [{
    id: `preference-mobility-no-common-${responses.map((entry) => entry.userId).sort().join("-")}`,
    category: "preference",
    severity: "medium",
    title: "모두가 함께 선택한 이동수단이 없어요",
    summary: `직접 선택한 이동수단의 교집합이 비어 있어 한 가지 수단을 자동 결정하면 누군가의 응답을 무시하게 돼요. 최다 지지 대안(${alternatives.join(" · ")})을 구간별로 나누거나 동행자와 확인해 주세요.`,
    affectedItemIds: [],
    affectedPlaceIds: [],
    affectedMemberIds: responses.map((entry) => entry.userId).sort(),
    evidence: responses.map((response) => ({
      label: memberName(snapshot, response.userId),
      value: response.modes.map((mode) => labelFor(mobilityModeLabels, mode)).join(", "),
      memberIds: [response.userId],
    })),
    suggestionSupported: false,
    constraintType: "soft",
    confidence: observationConfidence(responses.length, tripMemberIds(snapshot).length),
    source: "mobile-context",
  }];
}

function analyzeContinuousScheduleConsensus(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const definitions = [
    {
      id: "daily-load",
      title: "동행자별 희망 하루 일정량이 달라요",
      valueLabel: "희망 하루 일정량",
      read: (result: DetailedPreferenceResult) => ({
        value: result.detailedSignals.preferredDailyScheduledMinutes,
        resolution: dailyPreferenceResolution(result),
      }),
    },
    {
      id: "activity-block",
      title: "동행자별 희망 활동 블록 길이가 달라요",
      valueLabel: "희망 비휴식 활동 블록",
      read: averageActivityBlockPreference,
    },
  ] as const;
  return definitions.flatMap((definition) => {
    const observations = detailedResults(snapshot).flatMap((result) => {
      const { value, resolution } = definition.read(result);
      return value !== undefined && value > 0 && resolution !== undefined
        ? [{ userId: result.userId, value, resolution, minimum: 0 }]
        : [];
    });
    if (observations.length < 2) return [];
    const consensus = solveIntervalPreferenceConsensus(observations);
    if (!consensus.measurableConflict || consensus.recommendedValue === undefined) return [];
    const totalMemberCount = tripMemberIds(snapshot).length;
    return [{
      id: `preference-continuous-${definition.id}-${observations.map((entry) => entry.userId).sort().join("-")}`,
      category: "preference" as const,
      severity: "low" as const,
      title: definition.title,
      summary: `응답한 참여자 ${observations.length}/${totalMemberCount}명의 설문값 시간칸 구간이 서로 겹치지 않아요. 응답한 구간까지의 최대 거리를 최소화하는 조율점은 ${consensus.recommendedValue.toFixed(1)}분이고, 가장 불리한 사람의 구간 밖 차이는 ${consensus.maximumIntervalRegret.toFixed(1)}분이에요. 시간칸을 잠재 선호 구간으로 보는 모델이므로 자동 변경하지 않아요.`,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: observations.map((entry) => entry.userId).sort(),
      evidence: [
        ...consensus.observations.map((entry) => ({
          label: memberName(snapshot, entry.userId),
          value: `${definition.valueLabel} ${entry.value}분 · 측정 구간 ${entry.lower.toFixed(1)}~${entry.upper.toFixed(1)}분`,
          memberIds: [entry.userId],
        })),
        {
          label: "폐구간 minimax 조율",
          value: `${consensus.recommendedValue.toFixed(1)}분 · 최대 구간 후회 ${consensus.maximumIntervalRegret.toFixed(1)}분`,
          memberIds: consensus.mostAffectedMemberIds,
        },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: observationConfidence(observations.length, totalMemberCount),
      source: "mobile-context" as const,
    }];
  });
}

function analyzeBudgetPriorityDifferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const rankings = detailedResults(snapshot)
    .filter((result) => result.detailedSignals.budgetRanking.length > 0)
    .map((result) => ({ userId: result.userId, ranking: result.detailedSignals.budgetRanking }));
  if (rankings.length < 2) return [];
  const distances: { left: string; right: string; distance: number }[] = [];
  for (let left = 0; left < rankings.length - 1; left += 1) {
    for (let right = left + 1; right < rankings.length; right += 1) {
      const distance = normalizedKendallDistance(rankings[left].ranking, rankings[right].ranking);
      if (distance !== undefined) distances.push({ left: rankings[left].userId, right: rankings[right].userId, distance });
    }
  }
  const furthest = distances.sort((left, right) => right.distance - left.distance)[0];
  const kemeny = deriveKemenyConsensus(rankings);
  const disagreement = kemeny.normalizedPairwiseDisagreement;
  if (disagreement === undefined || disagreement === 0) return [];
  const consensus = kemeny.ranking.slice(0, 3);
  const exact = kemeny.exact;
  const optimumDescription = kemeny.allOptimalRankingsEnumerated
    ? kemeny.equallyOptimalRankings.length > 1
      ? `${kemeny.equallyOptimalRankings.length}개 정확 공동 최적 순위 중 결정론적으로 고른 한 가지`
      : "전수탐색으로 확인한 유일 최적 순위"
    : exact
      ? "정확한 최소 불일치 순위 한 가지(동률 전체는 열거하지 않음)"
      : "결정론적 국소 탐색으로 찾은 근사 순위";
  const totalMemberCount = tripMemberIds(snapshot).length;
  return [{
    id: `preference-budget-priority-${rankings.map((entry) => entry.userId).sort().join("-")}`,
    category: "preference",
    severity: "low",
    title: "여행비를 우선 쓰고 싶은 항목이 달라요",
    summary: `응답한 참여자 ${rankings.length}/${totalMemberCount}명의 순위에서 Kemeny 불일치를 줄인 결과는 ${consensus.map((item) => labelFor(budgetLabels, item)).join(" → ")} 순서예요. ${optimumDescription}이며, 결제 한도나 실제 가격 데이터가 없어 자동 예산 배분에는 사용하지 않아요.`,
    affectedItemIds: [],
    affectedPlaceIds: [],
    affectedMemberIds: rankings.map((entry) => entry.userId).sort(),
    evidence: [
      ...rankings.map((entry) => ({
        label: memberName(snapshot, entry.userId),
        value: entry.ranking.slice(0, 3).map((value) => labelFor(budgetLabels, value)).join(" → "),
        memberIds: [entry.userId],
      })),
      ...(furthest ? [{
        label: "가장 큰 순위 차이",
        value: `${memberName(snapshot, furthest.left)}님 ↔ ${memberName(snapshot, furthest.right)}님 · 역전 비율 ${(furthest.distance * 100).toFixed(0)}%`,
        memberIds: [furthest.left, furthest.right],
      }] : []),
      {
        label: "Kemeny 합의 품질",
        value: `${optimumDescription} · 전체 비교쌍 불일치 ${(disagreement * 100).toFixed(0)}%`,
        memberIds: rankings.map((entry) => entry.userId),
      },
    ],
    suggestionSupported: false,
    constraintType: "soft",
    confidence: exact ? observationConfidence(rankings.length, totalMemberCount) : "low",
    source: "mobile-context",
  }];
}

function analyzeScheduleRepresentation(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const memberIds = [...new Set(snapshot.trip.members.map((member) => member.userId))];
  if (memberIds.length < 2) return [];
  const explicitItems = snapshot.itinerary.filter((item) => item.preferredByUserIds.some((userId) => memberIds.includes(userId)));
  if (!explicitItems.length) return [];
  const counts = Object.fromEntries(memberIds.map((userId) => [
    userId,
    explicitItems.filter((item) => item.preferredByUserIds.includes(userId)).length,
  ]));
  const unrepresented = memberIds.filter((userId) => counts[userId] === 0);
  const maximum = Math.max(...Object.values(counts));
  if (!unrepresented.length || maximum === 0) return [];
  const candidatePlaceIds = snapshot.candidates
    .filter((candidate) => candidate.addedByUserIds.some((userId) => unrepresented.includes(userId)))
    .map((candidate) => candidate.placeId);
  return [{
    id: `preference-representation-${unrepresented.sort().join("-")}`,
    category: "preference",
    severity: "low",
    title: "일정에 반영된 참여자 선호가 한쪽에 치우쳐 있어요",
    summary: `${unrepresented.map((userId) => memberName(snapshot, userId)).join(", ")}님이 선호 참여자로 표시된 일정은 아직 0개예요. 선호 표시가 방문 필수 조건은 아니므로 자동 재배치하지 않고, 관련 후보를 함께 검토하도록 안내해요.`,
    affectedItemIds: explicitItems.map((item) => item.id),
    affectedPlaceIds: [...new Set(candidatePlaceIds)],
    affectedMemberIds: unrepresented,
    evidence: memberIds.map((userId) => ({
      label: memberName(snapshot, userId),
      value: `선호 표시 일정 ${counts[userId]}개`,
      memberIds: [userId],
    })),
    suggestionSupported: false,
    constraintType: "soft",
    confidence: "high",
    source: "mobile-context",
  }];
}

function analyzeMobilityChoices(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  if (snapshot.localPlanningFactsStatus && snapshot.localPlanningFactsStatus !== "loaded") return [];
  const compatible = snapshot.trip.transport === "car"
    ? new Set(["ownCar", "rentalCar"])
    : new Set(["bus", "subway", "train", "walk"]);
  return detailedResults(snapshot).flatMap((result) => {
    const selected = result.detailedSignals.mobilityModes;
    // Backend planning에는 taxi 모드가 없어서 car/public 중 어느 쪽과도 불일치로
    // 확정하지 않는다. false positive보다 사용자 확인 누락이 안전하다.
    if (!selected.length || selected.includes("taxi") || selected.some((mode) => compatible.has(mode))) return [];
    const name = memberName(snapshot, result.userId);
    return [{
      id: `preference-mobility-mode-${result.userId}-${snapshot.trip.transport}`,
      category: "preference" as const,
      severity: "medium" as const,
      title: `${name}님의 이동수단 응답과 여행방 설정이 달라요`,
      summary: `여행방은 ${snapshot.trip.transport === "car" ? "자동차" : "대중교통·도보"} 기준이지만 ${name}님이 직접 고른 이동수단에는 해당 방식이 없어요. 가능 여부를 함께 확인해 주세요.`,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: [result.userId],
      evidence: [
        { label: "여행방 이동 방식", value: snapshot.trip.transport === "car" ? "자동차" : "대중교통·도보" },
        { label: `${name}님의 선택`, value: selected.map((mode) => labelFor(mobilityModeLabels, mode)).join(", "), memberIds: [result.userId] },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "high" as const,
      source: "mobile-context" as const,
    }];
  });
}

function analyzeSharedMobilityRequirements(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const currentMemberIds = new Set(tripMemberIds(snapshot));
  const members = (getUsableSharedPreferenceEvidence(snapshot)?.members ?? []).flatMap((member) => {
    if (!currentMemberIds.has(member.userId) || member.mobilityConstraints.status !== "present") return [];
    const known = [...new Set(member.mobilityConstraints.values)]
      .filter((value) => mobilityConstraintLabels[value])
      .sort();
    const unknown = [...new Set(member.mobilityConstraints.values)]
      .filter((value) => !mobilityConstraintLabels[value])
      .sort();
    return known.length || unknown.length ? [{ member, known, unknown }] : [];
  });
  if (!members.length) return [];
  return [{
    id: `shared-mobility-requirements-${members.map(({ member }) => member.userId).sort().join("-")}`,
    category: "preference",
    severity: "low",
    title: "동행자의 이동 접근 조건을 확인해 주세요",
    summary: `동행자 ${members.length}명이 이동 불편 조건을 등록했어요. 요구가 있다는 사실은 신뢰할 수 있지만, 현재 장소·경로 데이터에는 계단·경사·개인별 최대 도보 허용치가 없어 위반 여부를 계산하거나 후보를 자동 제외하지 않아요. 방문 전 접근 경로를 확인해 주세요.`,
    affectedItemIds: [],
    affectedPlaceIds: [],
    affectedMemberIds: members.map(({ member }) => member.userId).sort(),
    evidence: members.map(({ member, known, unknown }) => ({
      label: memberName(snapshot, member.userId),
      value: [
        ...known.map((value) => mobilityConstraintLabels[value]),
        ...unknown.map((value) => `지원하지 않는 새 코드 ${value}`),
      ].join(", "),
      memberIds: [member.userId],
    })),
    suggestionSupported: false,
    constraintType: "soft",
    confidence: "high",
    source: "external-evidence",
  }];
}

function committedMinutesByDate(snapshot: DuriAnalysisSnapshot, analyzedAt: string) {
  const intervalsByDate = Object.fromEntries(getTripDates(snapshot.trip.startDate, snapshot.trip.endDate)
    .map((date) => [date, [] as { start: number; end: number }[]]));
  snapshot.itinerary.forEach((item) => {
    const start = timeStringToMinutes(item.startTime);
    if (!Number.isFinite(start) || item.durationMinutes <= 0) return;
    intervalsByDate[item.date]?.push({ start, end: start + item.durationMinutes });
  });
  const canUseTransportFacts = !snapshot.localPlanningFactsStatus || snapshot.localPlanningFactsStatus === "loaded";
  for (const leg of canUseTransportFacts ? buildScheduledRouteLegs(snapshot) : []) {
    const estimate = findUsableRouteEstimateForLeg(snapshot.routeLegEstimates ?? [], leg, snapshot.trip.transport, analyzedAt);
    const start = timeStringToMinutes(leg.departureTime);
    if (estimate && Number.isFinite(start)) intervalsByDate[leg.date]?.push({
      start,
      end: start + Math.ceil(estimate.durationSeconds / 60),
    });
  }
  return Object.fromEntries(Object.entries(intervalsByDate).map(([date, intervals]) => {
    const sorted = intervals.sort((left, right) => left.start - right.start || left.end - right.end);
    let total = 0;
    let currentStart: number | undefined;
    let currentEnd: number | undefined;
    sorted.forEach((interval) => {
      if (currentStart === undefined || currentEnd === undefined) {
        currentStart = interval.start;
        currentEnd = interval.end;
      } else if (interval.start <= currentEnd) {
        currentEnd = Math.max(currentEnd, interval.end);
      } else {
        total += currentEnd - currentStart;
        currentStart = interval.start;
        currentEnd = interval.end;
      }
    });
    if (currentStart !== undefined && currentEnd !== undefined) total += currentEnd - currentStart;
    return [date, total];
  }));
}

export function analyzePreferredDailyLoad(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  const committed = committedMinutesByDate(snapshot, analyzedAt);
  return detailedResults(snapshot).flatMap((result) => {
    const preferred = result.detailedSignals.preferredDailyScheduledMinutes;
    const resolution = dailyPreferenceResolution(result);
    if (preferred === undefined || preferred <= 0 || resolution === undefined) return [];
    const measurementTolerance = resolution / 2;
    const worst = Object.entries(committed)
      .map(([date, minutes]) => ({ date, minutes, excess: minutes - preferred }))
      .filter((entry) => entry.excess > measurementTolerance)
      .sort((left, right) => right.excess - left.excess || left.date.localeCompare(right.date))[0];
    if (!worst) return [];
    const name = memberName(snapshot, result.userId);
    const affected = snapshot.itinerary.filter((item) => item.date === worst.date);
    return [{
      id: `preference-daily-load-${result.userId}-${worst.date}`,
      category: "preference" as const,
      severity: result.detailedSignals.staminaScore === 0 ? "medium" as const : "low" as const,
      title: `${name}님의 희망 일정량보다 긴 날이 있어요`,
      summary: `${name}님이 설문에서 직접 구성한 하루 평균은 ${preferred.toFixed(1)}분이고, ${worst.date} 일정은 조회된 이동시간을 포함해 최소 ${worst.minutes}분이에요. 설문 양자화 오차를 제외해도 최소 ${(worst.excess - measurementTolerance).toFixed(1)}분 긴 Soft 제약이에요.`,
      date: worst.date,
      affectedItemIds: affected.map((item) => item.id),
      affectedPlaceIds: affected.flatMap((item) => item.placeId ? [item.placeId] : []),
      affectedMemberIds: [result.userId],
      evidence: [
        { label: "설문에서 구성한 하루 평균", value: `${preferred.toFixed(1)}분`, memberIds: [result.userId] },
        { label: "현재 일정 최소 점유", value: `${worst.minutes}분 · 조회 실패 이동구간 제외`, itemIds: affected.map((item) => item.id) },
        { label: "설문 시간 해상도", value: `±${measurementTolerance}분 범위 밖일 때만 차이로 판정`, memberIds: [result.userId] },
        { label: "체력 응답 점수", value: `${result.detailedSignals.staminaScore}/100`, memberIds: [result.userId] },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "medium" as const,
      source: "mobile-context" as const,
    }];
  });
}

export function analyzePreferredAverageStay(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const activityItems = snapshot.itinerary.filter((item) => item.itemType === "place" || item.itemType === "meal");
  if (!activityItems.length) return [];
  const actualAverage = activityItems.reduce((total, item) => total + item.durationMinutes, 0) / activityItems.length;
  return detailedResults(snapshot).flatMap((result) => {
    const { value: preferred, resolution } = averageActivityBlockPreference(result);
    if (preferred === undefined || preferred <= 0 || resolution === undefined) return [];
    const tolerance = resolution / 2;
    const difference = actualAverage - preferred;
    if (Math.abs(difference) <= tolerance) return [];
    const name = memberName(snapshot, result.userId);
    return [{
      id: `preference-average-stay-${result.userId}`,
      category: "preference" as const,
      severity: "low" as const,
      title: `${name}님의 활동 블록 길이와 차이가 있어요`,
      summary: `${name}님이 직접 만든 설문의 비휴식 활동 블록 평균은 ${preferred.toFixed(1)}분이고, 현재 방문·식사 일정 평균은 ${actualAverage.toFixed(1)}분이에요. 분류 오차 가능성이 있어 설문 양자화 오차를 제외한 ${Math.max(0, Math.abs(difference) - tolerance).toFixed(1)}분 차이를 참고용으로만 보여줘요.`,
      affectedItemIds: activityItems.map((item) => item.id),
      affectedPlaceIds: activityItems.flatMap((item) => item.placeId ? [item.placeId] : []),
      affectedMemberIds: [result.userId],
      evidence: [
        { label: "설문 비휴식 활동 블록 평균", value: `${preferred.toFixed(1)}분`, memberIds: [result.userId] },
        { label: "현재 방문·식사 일정 평균", value: `${actualAverage.toFixed(1)}분`, itemIds: activityItems.map((item) => item.id) },
        { label: "측정 허용 범위", value: `±${tolerance}분`, memberIds: [result.userId] },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "low" as const,
      source: "mobile-context" as const,
    }];
  });
}

function analyzeDetailedCategoryCoverage(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  return detailedResults(snapshot).flatMap((result) => {
    const explicitLevels = result.detailedSignals.categoryPreferenceLevels;
    const liked = explicitLevels
      ? Object.entries(explicitLevels).flatMap(([category, level]) => (
        isSupportedCategory(category) && level === "like" ? [category] : []
      ))
      : Object.entries(result.detailedSignals.categoryScores)
        .flatMap(([category, score]) => isSupportedCategory(category) && score >= 100 ? [category] : []);
    if (!liked.length) return [];
    const missing = liked.filter((category) => !snapshot.itinerary.some((item) => {
      const place = item.placeId ? snapshot.placesById[item.placeId] : undefined;
      return place ? matchesCategory(place, category) : false;
    }));
    if (!missing.length) return [];
    const candidatePlaceIds = snapshot.candidates.flatMap((candidate) => {
      const place = snapshot.placesById[candidate.placeId];
      return place && missing.some((category) => matchesCategory(place, category)) ? [place.id] : [];
    });
    const name = memberName(snapshot, result.userId);
    const missingLabels = missing.map((category) => categoryLabels[category]);
    return [{
      id: `preference-category-coverage-${result.userId}-${missing.sort().join("-")}`,
      category: "preference" as const,
      severity: "low" as const,
      title: explicitLevels
        ? `${name}님이 좋아한다고 답한 활동이 아직 없어요`
        : `${name}님이 높은 비중을 둔 활동이 아직 없어요`,
      summary: explicitLevels
        ? `직접 ‘좋아요’로 답한 ${missingLabels.join(", ")} 유형을 현재 장소 분류·태그에서 찾지 못했어요. 분류가 부정확할 수 있어 Soft 제약으로만 안내해요.`
        : `이전 설문에서 상대적으로 높은 시간을 배분한 ${missingLabels.join(", ")} 유형을 현재 장소 분류·태그에서 찾지 못했어요. 직접 ‘좋아요’ 응답으로 해석하지 않고 Soft 참고로만 보여줘요.`,
      affectedItemIds: [],
      affectedPlaceIds: [...new Set(candidatePlaceIds)],
      affectedMemberIds: [result.userId],
      evidence: [
        { label: "미반영 선호 유형", value: missingLabels.join(", "), memberIds: [result.userId] },
        { label: "관련 후보", value: `${new Set(candidatePlaceIds).size}곳`, placeIds: [...new Set(candidatePlaceIds)] },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "low" as const,
      source: "mobile-context" as const,
    }];
  });
}

function analyzeSharedCandidateSignalConflicts(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  return findSharedCandidateSignalConflicts(snapshot).map((conflict) => {
    const place = snapshot.placesById[conflict.placeId];
    const mustNames = conflict.mustVisitMemberIds.map((memberId) => memberName(snapshot, memberId));
    const avoidNames = conflict.avoidMemberIds.map((memberId) => memberName(snapshot, memberId));
    const selfConflictNames = conflict.internallyContradictoryMemberIds.map((memberId) => memberName(snapshot, memberId));
    return {
      id: `shared-candidate-signal-conflict-${conflict.placeId}-${conflict.mustVisitMemberIds.join("-")}-${conflict.avoidMemberIds.join("-")}`,
      category: "preference" as const,
      severity: "high" as const,
      title: `${place?.name ?? "후보 장소"}의 필수·제외 의견이 충돌해요`,
      summary: `${mustNames.join(", ")}님은 반드시 방문으로, ${avoidNames.join(", ")}님은 피할 장소로 명시했어요.${selfConflictNames.length ? ` ${selfConflictNames.join(", ")}님에게는 두 신호가 동시에 저장되어 있어 먼저 정정해야 해요.` : ""} 이 충돌은 수치 평균으로 없애지 않고 해당 후보만 자동 초안에서 보류해요. 초안 자체는 충돌 없는 후보로 계속 만들 수 있어요.`,
      affectedItemIds: snapshot.itinerary.filter((item) => item.placeId === conflict.placeId).map((item) => item.id),
      affectedPlaceIds: [conflict.placeId],
      affectedMemberIds: [...new Set([...conflict.mustVisitMemberIds, ...conflict.avoidMemberIds])].sort(),
      evidence: [
        { label: "반드시 방문", value: mustNames.join(", "), memberIds: conflict.mustVisitMemberIds, placeIds: [conflict.placeId] },
        { label: "피하고 싶음", value: avoidNames.join(", "), memberIds: conflict.avoidMemberIds, placeIds: [conflict.placeId] },
        ...(selfConflictNames.length ? [{
          label: "한 사람 안의 모순 신호",
          value: selfConflictNames.join(", "),
          memberIds: conflict.internallyContradictoryMemberIds,
          placeIds: [conflict.placeId],
        }] : []),
        { label: "판정 근거", value: "같은 placeId의 mustVisit=true와 avoid=true가 동시에 존재", placeIds: [conflict.placeId] },
      ],
      suggestionSupported: false,
      constraintType: "hard" as const,
      confidence: "high" as const,
      source: "external-evidence" as const,
    };
  });
}

const sharedAxisDefinitions = [
  { id: "scheduleDensity", label: "일정 밀도 파생 축" },
  { id: "landmarkNecessity", label: "대표 명소 배분 파생 축" },
  { id: "localInterest", label: "로컬 장소 배분 파생 축" },
  { id: "challenging", label: "새롭고 검증이 적은 선택 파생 축" },
] as const;

function analyzeSharedDerivedAxisDifferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const totalMemberCount = tripMemberIds(snapshot).length;
  return sharedAxisDefinitions.flatMap((definition) => {
    const observations = getSharedAxisObservations(snapshot, definition.id).map(({ userId, axis }) => ({
      userId,
      value: axis.value,
      resolution: axis.resolution,
      minimum: axis.range[0],
      maximum: axis.range[1],
      method: axis.method,
    }));
    if (observations.length < 2) return [];
    const consensus = solveIntervalPreferenceConsensus(observations);
    if (!consensus.measurableConflict || consensus.recommendedValue === undefined) return [];
    return [{
      id: `shared-derived-axis-${definition.id}-${observations.map((entry) => entry.userId).sort().join("-")}`,
      category: "preference" as const,
      severity: "low" as const,
      title: `${definition.label}이 서로 달라요`,
      summary: `응답한 ${observations.length}/${totalMemberCount}명의 서버 파생 점수를 미응답자 0점 없이 비교했어요. 각 값의 명시된 해상도 구간이 겹치지 않으며, 구간 밖 최대 차이를 최소화하는 조율점은 ${consensus.recommendedValue.toFixed(1)}점이에요. 원본 응답이 아닌 파생 축이므로 자동 변경 근거 하나로 쓰지는 않아요.`,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: observations.map((entry) => entry.userId).sort(),
      evidence: [
        ...consensus.observations.map((entry) => ({
          label: memberName(snapshot, entry.userId),
          value: `${entry.value}점 · 측정 구간 ${entry.lower.toFixed(1)}~${entry.upper.toFixed(1)} · rule-based-4axis`,
          memberIds: [entry.userId],
        })),
        {
          label: "폐구간 minimax 조율",
          value: `${consensus.recommendedValue.toFixed(1)}점 · 최대 구간 후회 ${consensus.maximumIntervalRegret.toFixed(1)}점`,
          memberIds: consensus.mostAffectedMemberIds,
        },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: observationConfidence(observations.length, totalMemberCount),
      source: "external-evidence" as const,
    }];
  });
}

export function analyzePreferenceConstraints(snapshot: DuriAnalysisSnapshot, _analyzedAt: string): DuriReportIssue[] {
  const hasScheduleOverlay = snapshot.scheduleOverlayStatus !== "unavailable";
  return [
    ...analyzeExplicitPreferenceDifferences(snapshot),
    ...analyzeContinuousScheduleConsensus(snapshot),
    ...analyzeMobilityConsensus(snapshot),
    ...analyzeSharedMobilityRequirements(snapshot),
    ...analyzeBudgetPriorityDifferences(snapshot),
    ...analyzeMobilityChoices(snapshot),
    // 하루 일정량과 연속 활동은 robustDensityAnalyzer가 같은 설문 해상도 구간,
    // 일정 겹침 제거, 조회 성공 이동시간을 한 번에 계산한다. 중복 경고를 만들지 않는다.
    ...analyzeDetailedCategoryCoverage(snapshot),
    ...analyzeSharedCandidateSignalConflicts(snapshot),
    ...analyzeSharedDerivedAxisDifferences(snapshot),
    ...(hasScheduleOverlay ? analyzeScheduleRepresentation(snapshot) : []),
  ];
}
