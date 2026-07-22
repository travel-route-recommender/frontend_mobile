import { budgetCategories, mobilityOptions } from "../../preferences/config/travel-preference-test-config";
import type { TravelPreferenceSurveyResult } from "../../preferences/types";
import type {
  CompatibilityCategoryScore,
  CompatibilityType,
  FriendCompatibilityResult,
} from "../types";

export const FRIEND_COMPATIBILITY_ALGORITHM_VERSION = 1;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const similarity = (left: number, right: number) => clampScore(100 - Math.abs(left - right));
const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export function getCompatibilityType(score: number): CompatibilityType {
  if (score < 20) return { id: "NEEDS_COORDINATION", label: "조율이 많이 필요한 사이", description: "여행 기준의 차이가 커요. 출발 전에 우선순위를 충분히 맞춰보세요." };
  if (score < 40) return { id: "ENJOY_DIFFERENCES", label: "차이를 즐길 수 있는 사이", description: "서로 다른 취향이 새로운 여행을 만들 수 있어요. 각자 꼭 하고 싶은 것을 나눠보세요." };
  if (score < 60) return { id: "BALANCED_MATCH", label: "적당히 맞춰가는 사이", description: "맞는 부분과 다른 부분이 고르게 있어요. 중요한 일정부터 함께 정하면 좋아요." };
  if (score < 80) return { id: "GOOD_MATCH", label: "꽤 잘 맞는 여행 메이트", description: "대부분의 여행 기준이 잘 맞아요. 몇 가지 차이만 조율하면 편안한 여행이 될 거예요." };
  return { id: "PERFECT_MATCH", label: "찰떡 여행 메이트", description: "여행 속도와 취향이 아주 잘 맞아요. 함께 계획하는 과정도 즐거울 가능성이 높아요." };
}

function mobilitySimilarity(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  const leftModes = new Set(mobilityOptions.filter((mode) => left.transportPreferences[mode.id] > 0).map((mode) => mode.id));
  const rightModes = new Set(mobilityOptions.filter((mode) => right.transportPreferences[mode.id] > 0).map((mode) => mode.id));
  const union = new Set([...leftModes, ...rightModes]);
  if (!union.size) return 100;
  const intersection = [...leftModes].filter((mode) => rightModes.has(mode)).length;
  return clampScore((intersection / union.size) * 100);
}

function accommodationSimilarity(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  return average([
    similarity(left.accommodationPreference.stayImportance, right.accommodationPreference.stayImportance),
    similarity(left.accommodationPreference.facilityOverLocation, right.accommodationPreference.facilityOverLocation),
    similarity(left.accommodationPreference.comfortOverPrice, right.accommodationPreference.comfortOverPrice),
  ]);
}

function budgetSimilarity(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  const absoluteDifference = budgetCategories.reduce((total, category) => total + Math.abs(
    left.spendingAllocation.allocation[category.id] - right.spendingAllocation.allocation[category.id],
  ), 0);
  return clampScore(100 - absoluteDifference / 2);
}

function discoverySimilarity(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  return average([
    similarity(left.discoveryPreference.landmarkImportance, right.discoveryPreference.landmarkImportance),
    similarity(left.discoveryPreference.localInterest, right.discoveryPreference.localInterest),
  ]);
}

function comparePair(left: TravelPreferenceSurveyResult, right: TravelPreferenceSurveyResult) {
  return {
    schedule: similarity(left.scheduleFeatures.densityScore, right.scheduleFeatures.densityScore),
    mobility: mobilitySimilarity(left, right),
    accommodation: accommodationSimilarity(left, right),
    challenge: similarity(left.challengePreference.score, right.challengePreference.score),
    stamina: similarity(left.staminaPreference.score, right.staminaPreference.score),
    budget: budgetSimilarity(left, right),
    discovery: discoverySimilarity(left, right),
  };
}

const categoryPresentation: Record<keyof ReturnType<typeof comparePair>, { label: string; description: string }> = {
  schedule: { label: "일정 밀도", description: "하루를 채우는 속도와 자유시간 선호" },
  mobility: { label: "이동 방식", description: "함께 이용하고 싶은 교통수단의 공통점" },
  accommodation: { label: "숙소 스타일", description: "숙소 경험·위치·시설·가격 기준" },
  challenge: { label: "도전 성향", description: "검증된 장소와 새로운 장소 사이의 선택" },
  stamina: { label: "체력 수준", description: "걷기와 활동량을 소화하는 정도" },
  budget: { label: "예산 소비", description: "숙소·맛집·체험·쇼핑·이동의 투자 방향" },
  discovery: { label: "여행지 탐색", description: "유명 명소와 로컬 경험에 대한 관심" },
};

export function calculateFriendCompatibility(
  requester: TravelPreferenceSurveyResult,
  friends: TravelPreferenceSurveyResult[],
  calculatedAt = new Date().toISOString(),
): FriendCompatibilityResult {
  if (!friends.length) throw new Error("궁합을 계산할 친구를 한 명 이상 선택해 주세요.");
  const pairs = friends.map((friend) => comparePair(requester, friend));
  const categories = (Object.keys(categoryPresentation) as (keyof typeof categoryPresentation)[]).map((id): CompatibilityCategoryScore => ({
    id,
    label: categoryPresentation[id].label,
    score: clampScore(average(pairs.map((pair) => pair[id]))),
    description: categoryPresentation[id].description,
  }));
  const score = clampScore(average(categories.map((category) => category.score)));
  return {
    id: `compatibility-${requester.userId}-${calculatedAt}`,
    requesterUserId: requester.userId,
    friendUserIds: friends.map((friend) => friend.userId),
    score,
    type: getCompatibilityType(score),
    categories,
    algorithmVersion: FRIEND_COMPATIBILITY_ALGORITHM_VERSION,
    calculatedAt,
  };
}
