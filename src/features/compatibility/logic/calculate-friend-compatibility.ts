import { budgetCategories } from "../../preferences/config/travel-preference-test-config";
import type { TravelPreferenceSurveyResult } from "../../preferences/types";
import type {
  CompatibilityCategoryId,
  CompatibilityCategoryScore,
  CompatibilityCategoryStatus,
  CompatibilityDynamics,
  CompatibilityType,
  FriendCompatibilityResult,
} from "../types";

export const FRIEND_COMPATIBILITY_ALGORITHM_VERSION = 6;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const similarity = (left: number, right: number) => clampScore(100 - Math.abs(left - right));

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// 대표적인 관계를 보되 가장 불편한 한 쌍도 30% 반영한다.
const robustConsensus = (values: number[]) => {
  if (!values.length) return 0;
  return median(values) * 0.7 + Math.min(...values) * 0.3;
};

// 차이가 없거나 극단적이면 0, 적당한 차이에서 1이 되는 보완 곡선이다.
const triangularComplement = (difference: number, start: number, peak: number, end: number) => {
  if (difference <= start || difference >= end) return 0;
  if (difference <= peak) return (difference - start) / (peak - start);
  return (end - difference) / (end - peak);
};

type PairCategoryAssessment = {
  score: number;
  status: CompatibilityCategoryStatus;
};

type PairComparison = Record<CompatibilityCategoryId, PairCategoryAssessment>;

const statusFromScore = (score: number): CompatibilityCategoryStatus => {
  if (score >= 75) return "ALIGNED";
  if (score < 40) return "NEEDS_COORDINATION";
  return "ADJUSTABLE";
};

const scoreAssessment = (score: number): PairCategoryAssessment => {
  const normalizedScore = clampScore(score);
  return { score: normalizedScore, status: statusFromScore(normalizedScore) };
};

export function getCompatibilityType(score: number): CompatibilityType {
  if (score < 20) return { id: "NEEDS_COORDINATION", label: "조율이 많이 필요한 사이", description: "여행 기준의 차이가 커요. 출발 전에 우선순위를 충분히 맞춰보세요." };
  if (score < 40) return { id: "ENJOY_DIFFERENCES", label: "차이를 즐길 수 있는 사이", description: "서로 다른 취향이 새로운 여행을 만들 수 있어요. 각자 꼭 하고 싶은 것을 나눠보세요." };
  if (score < 60) return { id: "BALANCED_MATCH", label: "적당히 맞춰가는 사이", description: "맞는 부분과 다른 부분이 고르게 있어요. 중요한 일정부터 함께 정하면 좋아요." };
  if (score < 80) return { id: "GOOD_MATCH", label: "꽤 잘 맞는 여행 메이트", description: "대부분의 여행 기준이 잘 맞아요. 몇 가지 차이만 조율하면 편안한 여행이 될 거예요." };
  return { id: "PERFECT_MATCH", label: "찰떡 여행 메이트", description: "여행 속도와 취향이 아주 잘 맞아요. 함께 계획하는 과정도 즐거울 가능성이 높아요." };
}

function scheduleCompatibility(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  return robustConsensus([
    similarity(left.scheduleStylePreference.components.density, right.scheduleStylePreference.components.density),
    similarity(left.scheduleStylePreference.components.activeRestPreference, right.scheduleStylePreference.components.activeRestPreference),
  ]);
}

function accommodationCompatibility(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  return robustConsensus([
    similarity(left.accommodationPreference.stayImportance, right.accommodationPreference.stayImportance),
    similarity(left.accommodationPreference.facilityOverLocation, right.accommodationPreference.facilityOverLocation),
    similarity(left.accommodationPreference.comfortOverPrice, right.accommodationPreference.comfortOverPrice),
  ]);
}

function budgetCompatibility(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  const rankDifference = budgetCategories.reduce((total, category) => total + Math.abs(
    left.spendingPriority.ranking.indexOf(category.id) - right.spendingPriority.ranking.indexOf(category.id),
  ), 0);
  const maximumRankDifference = Math.floor((budgetCategories.length ** 2) / 2);
  return clampScore(100 - (rankDifference / maximumRankDifference) * 100);
}

function discoveryCompatibility(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult): PairCategoryAssessment {
  const alignedScore = robustConsensus([
    similarity(left.discoveryPreference.landmarkImportance, right.discoveryPreference.landmarkImportance),
    similarity(left.discoveryPreference.localInterest, right.discoveryPreference.localInterest),
  ]);
  const leftOrientation = left.discoveryPreference.localInterest - left.discoveryPreference.landmarkImportance;
  const rightOrientation = right.discoveryPreference.localInterest - right.discoveryPreference.landmarkImportance;
  const oppositeInterests = leftOrientation * rightOrientation < 0;
  const orientationDifference = Math.abs(leftOrientation - rightOrientation);
  const engagement = Math.min(
    Math.max(left.discoveryPreference.landmarkImportance, left.discoveryPreference.localInterest),
    Math.max(right.discoveryPreference.landmarkImportance, right.discoveryPreference.localInterest),
  ) / 100;
  const complementStrength = oppositeInterests
    ? triangularComplement(orientationDifference, 20, 100, 180) * engagement
    : 0;
  const complementary = complementStrength >= 0.35;
  const score = clampScore(Math.max(alignedScore, complementary ? 68 + complementStrength * 17 : 0));
  return { score, status: complementary ? "COMPLEMENTARY" : statusFromScore(score) };
}

function challengeStyleCompatibility(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult): PairCategoryAssessment {
  const alignedScore = robustConsensus([
    similarity(left.challengeStylePreference.scores.exploration, right.challengeStylePreference.scores.exploration),
    similarity(left.challengeStylePreference.scores.cautiousness, right.challengeStylePreference.scores.cautiousness),
  ]);
  const explorationDifference = left.challengeStylePreference.scores.exploration - right.challengeStylePreference.scores.exploration;
  const cautiousnessDifference = left.challengeStylePreference.scores.cautiousness - right.challengeStylePreference.scores.cautiousness;
  const rolesAreOpposite = explorationDifference * cautiousnessDifference < 0;
  const roleDifference = (Math.abs(explorationDifference) + Math.abs(cautiousnessDifference)) / 2;
  const complementStrength = rolesAreOpposite ? triangularComplement(roleDifference, 10, 35, 70) : 0;
  const complementary = complementStrength >= 0.35;
  const score = clampScore(Math.max(alignedScore, complementary ? 68 + complementStrength * 17 : 0));
  return { score, status: complementary ? "COMPLEMENTARY" : statusFromScore(score) };
}

function comparePair(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult): PairComparison {
  return {
    schedule: scoreAssessment(scheduleCompatibility(left, right)),
    accommodation: scoreAssessment(accommodationCompatibility(left, right)),
    challenge: challengeStyleCompatibility(left, right),
    stamina: scoreAssessment(similarity(left.staminaPreference.score, right.staminaPreference.score)),
    budget: scoreAssessment(budgetCompatibility(left, right)),
    discovery: discoveryCompatibility(left, right),
  };
}

const categoryPresentation: Record<CompatibilityCategoryId, { label: string; descriptions: Record<CompatibilityCategoryStatus, string> }> = {
  schedule: {
    label: "일정 밀도",
    descriptions: {
      ALIGNED: "원하는 일정 밀도와 휴식 간격이 비슷해요.",
      COMPLEMENTARY: "일정 속도는 보완보다 합의가 중요한 항목이에요.",
      ADJUSTABLE: "일정 속도는 조금 다르지만 자유시간을 나누면 조율할 수 있어요.",
      NEEDS_COORDINATION: "원하는 일정 속도 차이가 커서 하루 활동량을 먼저 맞춰야 해요.",
    },
  },
  accommodation: {
    label: "숙소 스타일",
    descriptions: {
      ALIGNED: "숙소의 중요도와 위치·시설·가격 기준이 비슷해요.",
      COMPLEMENTARY: "같은 숙소를 공유하므로 보완보다 기준 합의가 중요해요.",
      ADJUSTABLE: "숙소 기준 일부가 달라 우선순위를 정하면 조율할 수 있어요.",
      NEEDS_COORDINATION: "숙소에서 포기하기 어려운 조건이 달라 예약 전에 합의가 필요해요.",
    },
  },
  challenge: {
    label: "새로운 경험 접근",
    descriptions: {
      ALIGNED: "새로운 경험을 찾고 확인하는 속도가 비슷해요.",
      COMPLEMENTARY: "한 명은 후보를 넓히고 다른 한 명은 정보를 확인하는 역할로 보완돼요.",
      ADJUSTABLE: "새로운 경험을 받아들이는 속도는 다르지만 조율 가능한 범위예요.",
      NEEDS_COORDINATION: "낯선 경험을 받아들이는 기준 차이가 커서 선택 범위를 먼저 정해야 해요.",
    },
  },
  stamina: {
    label: "체력 수준",
    descriptions: {
      ALIGNED: "걷기와 활동량을 소화하는 수준이 비슷해요.",
      COMPLEMENTARY: "체력은 보완보다 체력이 낮은 동행자의 한계를 지키는 게 중요해요.",
      ADJUSTABLE: "휴식 횟수와 이동 거리를 조절하면 함께 움직일 수 있어요.",
      NEEDS_COORDINATION: "가능한 활동량 차이가 커서 체력이 낮은 동행자 기준의 계획이 필요해요.",
    },
  },
  budget: {
    label: "예산 소비",
    descriptions: {
      ALIGNED: "숙소·맛집·체험·쇼핑·이동에 예산을 쓰는 우선순위가 비슷해요.",
      COMPLEMENTARY: "공동 지출은 보완보다 예산 기준을 맞추는 게 중요해요.",
      ADJUSTABLE: "투자하고 싶은 항목이 일부 달라 공동·개별 지출을 나누면 좋아요.",
      NEEDS_COORDINATION: "지출 우선순위 차이가 커서 공용 예산과 개인 예산을 먼저 나눠야 해요.",
    },
  },
  discovery: {
    label: "여행지 탐색",
    descriptions: {
      ALIGNED: "유명 명소와 로컬 경험을 고르는 기준이 비슷해요.",
      COMPLEMENTARY: "명소와 로컬 취향이 적당히 달라 서로의 여행 선택지를 넓혀줘요.",
      ADJUSTABLE: "가고 싶은 장소의 결은 다르지만 일정에 번갈아 담을 수 있어요.",
      NEEDS_COORDINATION: "선호하는 장소 유형이 크게 달라 각자 꼭 갈 곳을 먼저 정해야 해요.",
    },
  },
};

const categoryStatusLabels: Record<CompatibilityCategoryStatus, string> = {
  ALIGNED: "성향 일치",
  COMPLEMENTARY: "보완 시너지",
  ADJUSTABLE: "조율 가능",
  NEEDS_COORDINATION: "사전 조율",
};

const categoryWeights = [
  { id: "schedule", weight: 0.24 },
  { id: "stamina", weight: 0.2 },
  { id: "accommodation", weight: 0.2 },
  { id: "budget", weight: 0.16 },
  { id: "challenge", weight: 0.1 },
  { id: "discovery", weight: 0.1 },
] as const;
const sharedConstraintCategoryIds = ["schedule", "stamina", "accommodation"] as const;
const criticalConditionCategoryIds = ["schedule", "stamina", "accommodation", "budget"] as const;
const tasteCategoryIds = ["challenge", "discovery"] as const;

function createParticipantPairs(participants: TravelPreferenceSurveyResult[]) {
  const pairs: PairComparison[] = [];
  participants.forEach((left, leftIndex) => {
    participants.slice(leftIndex + 1).forEach((right) => pairs.push(comparePair(left, right)));
  });
  return pairs;
}

function getGroupCategoryStatus(assessments: PairCategoryAssessment[], score: number): CompatibilityCategoryStatus {
  if (assessments.some((assessment) => assessment.score < 40)) return "NEEDS_COORDINATION";
  const complementaryCount = assessments.filter((assessment) => assessment.status === "COMPLEMENTARY").length;
  if (complementaryCount / assessments.length >= 0.5) return "COMPLEMENTARY";
  return statusFromScore(score);
}

function createDynamics(categories: CompatibilityCategoryScore[]): CompatibilityDynamics {
  const synergyCategoryIds = categories
    .filter((category) => category.status === "COMPLEMENTARY")
    .map((category) => category.id);
  const coordinationCategoryIds = categories
    .filter((category) => category.status === "NEEDS_COORDINATION")
    .map((category) => category.id);
  const criticalCoordinationIds = coordinationCategoryIds.filter((id) => (
    criticalConditionCategoryIds.some((categoryId) => categoryId === id)
  ));

  if (criticalCoordinationIds.length) {
    return {
      id: "NEEDS_COORDINATION",
      label: "핵심 조건을 먼저 맞춰볼 조합",
      description: "일정 속도·체력·숙소·예산 중 차이가 큰 부분이 있어 출발 전에 기준을 정하는 게 좋아요.",
      synergyCategoryIds,
      coordinationCategoryIds,
    };
  }
  if (coordinationCategoryIds.length) {
    return {
      id: "ADJUSTABLE",
      label: "취향을 나눠 담으면 좋은 조합",
      description: "여행의 기본 조건은 맞지만 일부 취향 차이가 커서 각자 꼭 하고 싶은 것을 나눠보세요.",
      synergyCategoryIds,
      coordinationCategoryIds,
    };
  }
  if (synergyCategoryIds.length) {
    return {
      id: "COMPLEMENTARY",
      label: "서로 보완하는 여행 메이트",
      description: "서로 다른 취향이 역할 분담과 더 다양한 여행 선택으로 이어질 수 있어요.",
      synergyCategoryIds,
      coordinationCategoryIds,
    };
  }
  if (categories.filter((category) => category.status === "ALIGNED").length >= 4) {
    return {
      id: "ALIGNED",
      label: "닮아서 편안한 여행 메이트",
      description: "대부분의 여행 기준이 비슷해 큰 설명 없이도 편안하게 계획할 수 있어요.",
      synergyCategoryIds,
      coordinationCategoryIds,
    };
  }
  return {
    id: "ADJUSTABLE",
    label: "조율하며 맞춰가는 여행 메이트",
    description: "큰 충돌은 없고 몇 가지 기준만 정하면 서로의 방식을 자연스럽게 맞출 수 있어요.",
    synergyCategoryIds,
    coordinationCategoryIds,
  };
}

export function calculateFriendCompatibility(
  requester: TravelPreferenceSurveyResult,
  friends: TravelPreferenceSurveyResult[],
  calculatedAt = new Date().toISOString(),
): FriendCompatibilityResult {
  if (!friends.length) throw new Error("궁합을 계산할 친구를 한 명 이상 선택해 주세요.");
  const pairs = createParticipantPairs([requester, ...friends]);
  const categories = (Object.keys(categoryPresentation) as CompatibilityCategoryId[]).map((id): CompatibilityCategoryScore => {
    const assessments = pairs.map((pair) => pair[id]);
    const score = clampScore(robustConsensus(assessments.map((assessment) => assessment.score)));
    const status = getGroupCategoryStatus(assessments, score);
    return {
      id,
      label: categoryPresentation[id].label,
      score,
      status,
      statusLabel: categoryStatusLabels[status],
      description: categoryPresentation[id].descriptions[status],
    };
  });
  const scoreByCategory = Object.fromEntries(categories.map((category) => [category.id, category.score])) as Record<CompatibilityCategoryId, number>;
  const unboundedScore = clampScore(categoryWeights.reduce((total, { id, weight }) => (
    total + scoreByCategory[id] * weight
  ), 0));
  const weakestSharedConstraintScore = Math.min(...sharedConstraintCategoryIds.map((id) => scoreByCategory[id]));
  const weakestTasteScore = Math.min(...tasteCategoryIds.map((id) => scoreByCategory[id]));
  const score = weakestSharedConstraintScore < 25
    ? Math.min(unboundedScore, 39)
    : weakestSharedConstraintScore < 40
      ? Math.min(unboundedScore, 59)
      : weakestTasteScore < 25
        ? Math.min(unboundedScore, 79)
        : unboundedScore;
  return {
    id: `compatibility-${requester.userId}-${calculatedAt}`,
    requesterUserId: requester.userId,
    friendUserIds: friends.map((friend) => friend.userId),
    score,
    type: getCompatibilityType(score),
    dynamics: createDynamics(categories),
    categories,
    algorithmVersion: FRIEND_COMPATIBILITY_ALGORITHM_VERSION,
    calculatedAt,
  };
}
