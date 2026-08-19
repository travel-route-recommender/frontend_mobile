import type { Place, PreferenceDimension, UserPreferenceResult } from "../../../domain";
import {
  calculateMinimaxPreferenceCompromise,
  deriveConsensusRanking,
  deriveMobilityConsensus,
  normalizedKendallDistance,
} from "../../../duri/group-preferences";
import { getTripDates } from "../../../utils/schedule";
import type { DuriAnalysisSnapshot, DuriReportIssue } from "../types";
import { buildScheduledRouteLegs } from "./routeEvidence";
import { findUsableRouteEstimateForLeg } from "./scheduleConstraintAnalysis";

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

function detailedResults(snapshot: DuriAnalysisSnapshot) {
  return Object.values(snapshot.preferenceResults)
    .filter((result): result is UserPreferenceResult & { detailedSignals: NonNullable<UserPreferenceResult["detailedSignals"]> } => Boolean(result.detailedSignals));
}

function analyzeExplicitPreferenceDifferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  return (Object.keys(dimensionLabels) as PreferenceDimension[]).flatMap((dimension) => {
    const diagnosis = snapshot.groupPreferenceDiagnosis.dimensions[dimension];
    if (diagnosis.spread !== 2) return [];
    const low = diagnosis.responses.filter((entry) => entry.score === 0).map((entry) => entry.userId);
    const high = diagnosis.responses.filter((entry) => entry.score === 2).map((entry) => entry.userId);
    const compromise = calculateMinimaxPreferenceCompromise(diagnosis.responses);
    const compromiseLabel = compromise.recommendedScore === undefined
      ? "동행자 확인 필요"
      : dimensionValueLabels[dimension][compromise.recommendedScore];
    return [{
      id: `preference-coordination-${dimension}`,
      category: "preference" as const,
      severity: "medium" as const,
      title: `${dimensionLabels[dimension]} 선호 차이가 커요`,
      summary: `${low.map((id) => memberName(snapshot, id)).join(", ")}님과 ${high.map((id) => memberName(snapshot, id)).join(", ")}님의 직접 응답이 양 끝으로 달라요. 최소최대 후회 기준에서는 '${compromiseLabel}'가 조율 출발점이에요. 이 계산은 모든 응답자의 가중치와 0·1·2 단계 사이의 거리를 같다고 가정하며 자동 변경하지 않아요.`,
      affectedItemIds: [],
      affectedPlaceIds: [],
      affectedMemberIds: [...low, ...high].sort(),
      evidence: diagnosis.responses.map((response) => ({
        label: memberName(snapshot, response.userId),
        value: `${dimensionValueLabels[dimension][response.score]} · 직접 응답 ${response.score}/2`,
        memberIds: [response.userId],
      })).concat({
        label: "최소최대 후회 조율안",
        value: `${compromiseLabel} · 가장 불리한 참여자의 정규화 후회 ${(compromise.maximumRegret * 100).toFixed(0)}%`,
        memberIds: compromise.mostAffectedMemberIds,
      }).concat({
        label: "계산 가정",
        value: "응답자 동일 가중치 · 인접 선택지 간 거리 동일",
        memberIds: [],
      }),
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: snapshot.groupPreferenceDiagnosis.coverage === "complete" ? "high" as const : "medium" as const,
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
    confidence: snapshot.groupPreferenceDiagnosis.coverage === "complete" ? "high" : "medium",
    source: "mobile-context",
  }];
}

function analyzeBudgetPriorityDifferences(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  const rankings = detailedResults(snapshot)
    .filter((result) => result.detailedSignals.budgetRanking.length > 0)
    .map((result) => ({ userId: result.userId, ranking: result.detailedSignals.budgetRanking }));
  if (rankings.length < 2 || new Set(rankings.map((entry) => entry.ranking[0])).size < 2) return [];
  const distances: { left: string; right: string; distance: number }[] = [];
  for (let left = 0; left < rankings.length - 1; left += 1) {
    for (let right = left + 1; right < rankings.length; right += 1) {
      const distance = normalizedKendallDistance(rankings[left].ranking, rankings[right].ranking);
      if (distance !== undefined) distances.push({ left: rankings[left].userId, right: rankings[right].userId, distance });
    }
  }
  const furthest = distances.sort((left, right) => right.distance - left.distance)[0];
  const consensus = deriveConsensusRanking(rankings).slice(0, 3);
  return [{
    id: `preference-budget-priority-${rankings.map((entry) => entry.userId).sort().join("-")}`,
    category: "preference",
    severity: "low",
    title: "여행비를 우선 쓰고 싶은 항목이 달라요",
    summary: `각자의 직접 순위를 Borda 평균 순위로 합치면 ${consensus.map((entry) => labelFor(budgetLabels, entry.item)).join(" → ")} 순서예요. 결제 한도나 실제 가격 데이터가 없어 자동 예산 배분에는 사용하지 않아요.`,
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
    ],
    suggestionSupported: false,
    constraintType: "soft",
    confidence: snapshot.groupPreferenceDiagnosis.coverage === "complete" ? "high" : "medium",
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
  const compatible = snapshot.trip.transport === "car"
    ? new Set(["ownCar", "rentalCar", "taxi"])
    : new Set(["bus", "subway", "train", "walk"]);
  return detailedResults(snapshot).flatMap((result) => {
    const selected = result.detailedSignals.mobilityModes;
    if (!selected.length || selected.some((mode) => compatible.has(mode))) return [];
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

function committedMinutesByDate(snapshot: DuriAnalysisSnapshot, analyzedAt: string) {
  const scheduled = Object.fromEntries(getTripDates(snapshot.trip.startDate, snapshot.trip.endDate).map((date) => [
    date,
    snapshot.itinerary.filter((item) => item.date === date).reduce((total, item) => total + item.durationMinutes, 0),
  ]));
  for (const leg of buildScheduledRouteLegs(snapshot)) {
    const estimate = findUsableRouteEstimateForLeg(snapshot.routeLegEstimates ?? [], leg, snapshot.trip.transport, analyzedAt);
    if (estimate) scheduled[leg.date] = (scheduled[leg.date] ?? 0) + Math.ceil(estimate.durationSeconds / 60);
  }
  return scheduled;
}

function analyzePreferredDailyLoad(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  const committed = committedMinutesByDate(snapshot, analyzedAt);
  return detailedResults(snapshot).flatMap((result) => {
    const preferred = result.detailedSignals.preferredDailyScheduledMinutes;
    if (preferred <= 0) return [];
    const worst = Object.entries(committed)
      .map(([date, minutes]) => ({ date, minutes, excess: minutes - preferred }))
      .filter((entry) => entry.excess >= 15)
      .sort((left, right) => right.excess - left.excess || left.date.localeCompare(right.date))[0];
    if (!worst) return [];
    const name = memberName(snapshot, result.userId);
    const affected = snapshot.itinerary.filter((item) => item.date === worst.date);
    return [{
      id: `preference-daily-load-${result.userId}-${worst.date}`,
      category: "preference" as const,
      severity: result.detailedSignals.staminaScore === 0 ? "medium" as const : "low" as const,
      title: `${name}님의 희망 일정량보다 긴 날이 있어요`,
      summary: `${name}님이 설문에서 직접 구성한 하루 평균은 ${preferred}분이고, ${worst.date} 일정은 조회된 이동시간을 포함해 최소 ${worst.minutes}분이에요. ${worst.excess}분 차이를 Soft 제약으로 확인해 주세요.`,
      date: worst.date,
      affectedItemIds: affected.map((item) => item.id),
      affectedPlaceIds: affected.flatMap((item) => item.placeId ? [item.placeId] : []),
      affectedMemberIds: [result.userId],
      evidence: [
        { label: "설문에서 구성한 하루 평균", value: `${preferred}분`, memberIds: [result.userId] },
        { label: "현재 일정 최소 점유", value: `${worst.minutes}분 · 조회 실패 이동구간 제외`, itemIds: affected.map((item) => item.id) },
        { label: "체력 응답 점수", value: `${result.detailedSignals.staminaScore}/100`, memberIds: [result.userId] },
      ],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "medium" as const,
      source: "mobile-context" as const,
    }];
  });
}

function analyzeDetailedCategoryCoverage(snapshot: DuriAnalysisSnapshot): DuriReportIssue[] {
  return detailedResults(snapshot).flatMap((result) => {
    const liked = Object.entries(result.detailedSignals.categoryScores)
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
      title: `${name}님이 좋아한다고 답한 활동이 아직 없어요`,
      summary: `직접 ‘좋아요’로 답한 ${missingLabels.join(", ")} 유형을 현재 장소 분류·태그에서 찾지 못했어요. 분류가 부정확할 수 있어 Soft 제약으로만 안내해요.`,
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

export function analyzePreferenceConstraints(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  return [
    ...analyzeExplicitPreferenceDifferences(snapshot),
    ...analyzeMobilityConsensus(snapshot),
    ...analyzeBudgetPriorityDifferences(snapshot),
    ...analyzeMobilityChoices(snapshot),
    ...analyzePreferredDailyLoad(snapshot, analyzedAt),
    ...analyzeDetailedCategoryCoverage(snapshot),
    ...analyzeScheduleRepresentation(snapshot),
  ];
}
