import { createMockTravelPreferenceResults, getMockTravelPreferenceResult } from "../src/features/preferences/config/mock-travel-preference-results";
import {
  MOCK_FRIEND_FIXTURE_OWNER_ID,
  MOCK_FRIEND_IDS,
  mockFriendProfiles,
} from "../src/features/compatibility/config/mock-friends";
import {
  calculateLegacyPreferenceProjection,
  calculateTravelPreferenceSurveyResult,
  buildDuriPreferenceSignals,
} from "../src/features/preferences/logic/calculate-travel-preference-result";
import { challengeStyleQuestions } from "../src/features/preferences/config/challenge-style-questions";
import { itineraryMessageQuestions } from "../src/features/preferences/config/itinerary-message-questions";
import { preferenceSteps } from "../src/features/preferences/config/travel-preference-test-config";
import { deriveScheduleStylePreference } from "../src/features/preferences/logic/derive-schedule-style";
import {
  getBudgetRanking,
  isPreferenceStepComplete,
  normalizeTravelPreferenceSurveyAnswers,
} from "../src/features/preferences/logic/travel-preference-survey";
import type { ItineraryMessageAnswers, TravelPreferenceSurveyResult } from "../src/features/preferences/types";
import {
  FRIEND_COMPATIBILITY_ALGORITHM_VERSION,
  calculateFriendCompatibility,
  getCompatibilityType,
} from "../src/features/compatibility/logic/calculate-friend-compatibility";
import { resolveSavedFriendIds } from "../src/features/compatibility/logic/resolve-saved-friend-ids";
import { resolvePreferencePresentation } from "../src/features/preferences/logic/resolve-preference-presentation";
import { resolvePreferenceResultPair } from "../src/features/preferences/logic/resolve-preference-result-pair";
import {
  preferenceIndividualSelectionCount,
  preferenceQuestionCount,
  preferenceStoryQuestions,
  resolvePreferenceScrollResetKey,
  resolvePreferenceTestProgress,
} from "../src/features/preferences/logic/resolve-preference-test-progress";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results = createMockTravelPreferenceResults();
const soomin = results["user-soomin"];
const yunji = results["user-jiyoon"];
const minseok = results["user-minjae"];
const hyunho = results["user-hyunho"];
const suhyeon = results["user-suhyeon"];
assert(
  Boolean(soomin && yunji && minseok && hyunho && suhyeon)
    && MOCK_FRIEND_IDS.length === 4
    && mockFriendProfiles["user-jiyoon"].name === "윤지"
    && mockFriendProfiles["user-minjae"].name === "민석",
  "1. 윤지·민석·현호·수현의 프로필과 상세 결과가 준비되어야 한다",
);
const soominLegacyResult = calculateLegacyPreferenceProjection(soomin.userId, soomin.answers, soomin.completedAt);
const canonicalPresentation = resolvePreferencePresentation(soominLegacyResult, {
  challengeStyle: soomin.challengeStylePreference,
  scheduleStyle: soomin.scheduleStylePreference,
});
assert(
  canonicalPresentation.title === `${soomin.scheduleStylePreference.modifier} ${soomin.challengeStylePreference.label}`
    && canonicalPresentation.traits.length === 3,
  "1-1. My Page와 개인 결과는 상세 도전 유형 및 일정 수식어를 반영한 같은 표시 모델을 사용해야 한다",
);
assert(
  canonicalPresentation.preferredTags.join(",") === soominLegacyResult.preferredTags.join(",")
    && canonicalPresentation.keywordCount === canonicalPresentation.preferredTags.length,
  "1-2. 취향 키워드 수와 칩은 같은 preferredTags 배열에서 파생되어야 한다",
);
const legacyOnlyPresentation = resolvePreferencePresentation(soominLegacyResult);
assert(
  legacyOnlyPresentation.title === soominLegacyResult.profileType
    && legacyOnlyPresentation.traits.join(",") === soominLegacyResult.traits.join(","),
  "1-3. 상세 결과가 없을 때는 기존 저장 결과의 표시 규칙을 유지해야 한다",
);
const coherentPairA = resolvePreferenceResultPair(soominLegacyResult, soomin, soomin.userId);
assert(
  coherentPairA.detailedResult === soomin
    && coherentPairA.completedAt === soomin.completedAt
    && coherentPairA.canonicalPresentation.title === canonicalPresentation.title,
  "1-3a. canonical A와 detailed A는 하나의 coherent result pair로 해석되어야 한다",
);
const completedAtB = "2026-08-30T12:00:00.000Z";
const detailedResultB = calculateTravelPreferenceSurveyResult(soomin.userId, {
  ...soomin.answers,
  challengeStyleAnswers: { i18: 1, i48: 5, i22: 1, i52: 1, i90: 1, i120: 1 },
}, completedAtB);
const canonicalResultB = calculateLegacyPreferenceProjection(soomin.userId, detailedResultB.answers, completedAtB);
const coherentPairB = resolvePreferenceResultPair(canonicalResultB, [soomin, detailedResultB], soomin.userId);
assert(
  coherentPairB.detailedResult === detailedResultB
    && coherentPairB.canonicalPresentation.title.includes(detailedResultB.challengeStylePreference.label),
  "1-3b. 재검사 B 완료 후에는 canonical B와 detailed B를 선택하고 과거 detailed A를 붙이지 않아야 한다",
);
const fallbackPairB = resolvePreferenceResultPair(canonicalResultB, [soomin], soomin.userId);
assert(
  fallbackPairB.detailedResult === null
    && fallbackPairB.canonicalPresentation.title === canonicalResultB.profileType
    && !fallbackPairB.canonicalPresentation.title.includes(soomin.challengeStylePreference.label),
  "1-3c. canonical B에 matching detailed B가 없으면 과거 detailed A를 버리고 legacy canonical fallback을 사용해야 한다",
);
assert(
  resolvePreferenceResultPair(canonicalResultB, [{ ...detailedResultB, userId: "other-user" }], soomin.userId).detailedResult === null,
  "1-3d. 완료 시각이 같아도 owner가 다르면 같은 result pair가 아니어야 한다",
);
assert(
  resolveSavedFriendIds({}, MOCK_FRIEND_FIXTURE_OWNER_ID).join(",") === MOCK_FRIEND_IDS.join(","),
  "1-4. 데모 친구 fixture는 정확한 데모 회원 ID에만 연결되어야 한다",
);
assert(
  resolveSavedFriendIds({}, "newly-created-member").length === 0
    && resolveSavedFriendIds(
      { [MOCK_FRIEND_FIXTURE_OWNER_ID]: [] },
      MOCK_FRIEND_FIXTURE_OWNER_ID,
    ).length === 0,
  "1-5. 신규 회원에게 친구를 자동 생성하지 않고 명시적으로 저장한 빈 목록도 보존해야 한다",
);
assert(
  getMockTravelPreferenceResult("newly-created-member") === null,
  "1-6. 신규 회원에게 완료하지 않은 여행 성향 결과를 fixture로 자동 생성하지 않아야 한다",
);
assert(
  soomin.spendingPriority.ranking.join(",") === "food,stay,activity,mobility,shopping"
    && soomin.spendingAllocation.totalCoins === 100,
  "2. 예산은 순위로 저장되고 기존 결과 호환용 점수 합계는 100이어야 한다",
);
const normalizedLegacyBudget = normalizeTravelPreferenceSurveyAnswers({
  budgetAllocation: { stay: 20, food: 30, activity: 20, shopping: 10, mobility: 20 },
});
assert(
  getBudgetRanking(normalizedLegacyBudget).join(",") === "food,stay,activity,mobility,shopping",
  "2-1. 기존 코인 응답은 금액이 큰 순서의 예산 우선순위로 변환되어야 한다",
);
assert(
  !isPreferenceStepComplete("budget", { budgetRanking: ["food", "stay", "activity", "shopping"] })
    && isPreferenceStepComplete("budget", { budgetRanking: ["food", "stay", "activity", "shopping", "mobility"] }),
  "2-2. 다섯 예산 카테고리의 순위를 모두 골라야 예산 단계가 완료되어야 한다",
);
assert(soomin.scheduleFeatures.scheduledMinutes === 300, "3. 일정 블록 시간이 분 단위 특징값으로 계산되어야 한다");
assert(soomin.scheduleFeatures.restMinutes === 60 && soomin.scheduleFeatures.activityMinutes === 240, "4. 활동과 휴식 시간이 분리되어야 한다");
assert(soomin.discoveryPreference.localInterest === 100, "5. 4단계 최고값은 100점이어야 한다");
assert(soomin.accommodationPreference.comfortOverPrice > 50, "6. 편안함↔가격 화면 척도는 comfortOverPrice 의미로 뒤집혀야 한다");

const recalculated = calculateTravelPreferenceSurveyResult(soomin.userId, soomin.answers, soomin.completedAt);
assert(recalculated.userId === soomin.userId && recalculated.completedAt === soomin.completedAt, "7. 원본 응답에서 같은 상세 결과를 다시 계산할 수 있어야 한다");
const legacyProjection = calculateLegacyPreferenceProjection(soomin.userId, soomin.answers, soomin.completedAt);
assert(legacyProjection.answers.pace >= 0, "8. 기존 그룹 진단용 호환 projection이 저장 경계에서 계산되어야 한다");

const identical = calculateFriendCompatibility(soomin, [{ ...soomin, userId: "identical-friend" }], "2026-07-22T00:00:00.000Z");
assert(identical.score === 100 && identical.categories.every((category) => category.score === 100), "9. 동일한 성향은 전체와 모든 카테고리에서 100점이어야 한다");

const oneFriend = calculateFriendCompatibility(soomin, [yunji], "2026-07-22T00:00:00.000Z");
assert(
  oneFriend.score >= 0
    && oneFriend.score <= 100
    && oneFriend.categories.length === 6
    && !oneFriend.categories.map((category) => String(category.id)).includes("mobility"),
  "10. 한 명 궁합은 이동수단을 제외한 6개 카테고리와 0~100 점수를 반환해야 한다",
);
const reverseBudget = calculateFriendCompatibility(soomin, [{
  ...soomin,
  userId: "reverse-budget",
  spendingPriority: { ranking: [...soomin.spendingPriority.ranking].reverse() },
}]);
const reverseBudgetCategory = reverseBudget.categories.find((category) => category.id === "budget");
assert(
  reverseBudgetCategory?.score === 0
    && reverseBudgetCategory.status === "NEEDS_COORDINATION"
    && reverseBudget.score === 84
    && reverseBudget.dynamics.coordinationCategoryIds.includes("budget"),
  "10-1. 반대 예산 순위는 예산만 0점이고 전체에서는 16%만 감점하되 사전 조율 안내를 유지해야 한다",
);
const group = calculateFriendCompatibility(soomin, [yunji, minseok], "2026-07-22T00:00:00.000Z");
assert(group.friendUserIds.length === 2 && group.score >= 0 && group.score <= 100, "11. 여러 친구는 모든 참여자 쌍을 반영한 하나의 그룹 결과를 반환해야 한다");

assert(getCompatibilityType(0).id === "NEEDS_COORDINATION", "12. 0~19점 유형");
assert(getCompatibilityType(20).id === "ENJOY_DIFFERENCES", "13. 20~39점 유형");
assert(getCompatibilityType(40).id === "BALANCED_MATCH", "14. 40~59점 유형");
assert(getCompatibilityType(60).id === "GOOD_MATCH", "15. 60~79점 유형");
assert(getCompatibilityType(80).id === "PERFECT_MATCH", "16. 80~100점 유형");

const repeatedGroup = calculateFriendCompatibility(soomin, [yunji, minseok], "2026-07-22T00:00:00.000Z");
assert(repeatedGroup.requesterUserId === soomin.userId && repeatedGroup.friendUserIds.length === 2, "17. 궁합 결과에는 참여자 식별 정보가 포함되어야 한다");
assert(repeatedGroup.score === group.score, "18. 같은 입력의 클라이언트 궁합 계산은 결정적이어야 한다");

function withChallengeScores(
  source: TravelPreferenceSurveyResult,
  userId: string,
  exploration: number,
  cautiousness: number,
) {
  return {
    ...source,
    userId,
    challengeStylePreference: {
      ...source.challengeStylePreference,
      scores: { ...source.challengeStylePreference.scores, exploration, cautiousness },
    },
  };
}

function withDiscoveryScores(
  source: TravelPreferenceSurveyResult,
  userId: string,
  landmarkImportance: number,
  localInterest: number,
) {
  return {
    ...source,
    userId,
    discoveryPreference: { landmarkImportance, localInterest },
  };
}

function withScheduleComponents(
  source: TravelPreferenceSurveyResult,
  userId: string,
  density: number,
  activeRestPreference: number,
) {
  return {
    ...source,
    userId,
    scheduleStylePreference: {
      ...source.scheduleStylePreference,
      components: { ...source.scheduleStylePreference.components, density, activeRestPreference },
    },
  };
}

assert(
  FRIEND_COMPATIBILITY_ALGORITHM_VERSION === 6
    && identical.algorithmVersion === 6
    && identical.dynamics.id === "ALIGNED"
    && identical.categories.every((category) => category.status === "ALIGNED"),
  "19. 궁합 v6는 가중 산술평균과 선택적 하드캡 및 순위형 예산 비교를 함께 반환해야 한다",
);

const complementaryChallengeLeft = withChallengeScores(soomin, "challenge-left", 70, 35);
const complementaryChallengeRight = withChallengeScores(soomin, "challenge-right", 35, 70);
const complementaryChallenge = calculateFriendCompatibility(complementaryChallengeLeft, [complementaryChallengeRight]);
assert(
  complementaryChallenge.categories.find((category) => category.id === "challenge")?.status === "COMPLEMENTARY"
    && complementaryChallenge.dynamics.id === "COMPLEMENTARY",
  "20. 탐색과 신중 역할이 적당히 엇갈리면 새로운 경험 접근을 보완 시너지로 판정해야 한다",
);

const extremeChallengeLeft = withChallengeScores(soomin, "extreme-left", 100, 0);
const extremeChallengeRight = withChallengeScores(soomin, "extreme-right", 0, 100);
const extremeChallenge = calculateFriendCompatibility(extremeChallengeLeft, [extremeChallengeRight]);
assert(
  extremeChallenge.categories.find((category) => category.id === "challenge")?.status === "NEEDS_COORDINATION"
    && extremeChallenge.score === 79,
  "21. 도전 성향이 극단적으로 엇갈리면 시너지로 포장하지 않고 최고 등급을 제한해야 한다",
);

const complementaryDiscoveryLeft = withDiscoveryScores(soomin, "discovery-left", 67, 100);
const complementaryDiscoveryRight = withDiscoveryScores(soomin, "discovery-right", 100, 67);
const complementaryDiscovery = calculateFriendCompatibility(complementaryDiscoveryLeft, [complementaryDiscoveryRight]);
assert(
  complementaryDiscovery.categories.find((category) => category.id === "discovery")?.status === "COMPLEMENTARY",
  "22. 명소와 로컬 관심이 적당히 엇갈리면 여행지 탐색을 보완 시너지로 판정해야 한다",
);

const midpointSchedule = withScheduleComponents(soomin, "schedule-mid", 50, 50);
const relaxedSchedule = withScheduleComponents(soomin, "schedule-low", 0, 0);
const packedSchedule = withScheduleComponents(soomin, "schedule-high", 100, 100);
const allPairGroup = calculateFriendCompatibility(midpointSchedule, [relaxedSchedule, packedSchedule]);
assert(
  allPairGroup.categories.find((category) => category.id === "schedule")?.score === 35
    && allPairGroup.score === 59,
  "23. 세 명 이상 궁합은 신청자-친구뿐 아니라 친구-친구를 포함한 모든 참여자 쌍의 최저 관계를 반영해야 한다",
);

const criticalMismatch = calculateFriendCompatibility(relaxedSchedule, [packedSchedule]);
assert(
  criticalMismatch.dynamics.id === "NEEDS_COORDINATION"
    && criticalMismatch.score === 39,
  "24. 핵심 조건이 극단적으로 다르면 다른 항목이 잘 맞아도 전체 궁합을 낙관적으로 표시하지 않아야 한다",
);

assert(
  itineraryMessageQuestions.length === 9
    && new Set(itineraryMessageQuestions.map((question) => question.id)).size === 9
    && new Set([...challengeStyleQuestions, ...itineraryMessageQuestions].map((question) => question.presentation.kind)).size === 3
    && itineraryMessageQuestions.every((question) => (
      question.options.length === 3
      && question.options.map((option) => option.id).join(",") === "like,neutral,dislike"
    )),
  "25. 일정 앞에는 메신저·친구들과의 선택·현장 선택을 섞은 9개 질문과 선호·중간·불호 응답이 있어야 한다",
);

const itineraryMessageAnswers = Object.fromEntries(itineraryMessageQuestions.map((question) => [
  question.id,
  question.id === "density" ? "neutral" : "like",
])) as ItineraryMessageAnswers;
const messageSurveyAnswers = {
  ...soomin.answers,
  itineraryDays: undefined,
  itineraryMessageAnswers,
};
assert(isPreferenceStepComplete("itinerary", messageSurveyAnswers), "26. 9개 대화에 모두 답하면 첫 항목이 완료되어야 한다");
const messageResult = calculateTravelPreferenceSurveyResult("message-user", messageSurveyAnswers, "2026-07-24T00:00:00.000Z");
const messageSignals = buildDuriPreferenceSignals(messageResult);
assert(
  messageResult.itineraryMessagePreference.categoryScores.restaurant === 100
    && messageResult.itineraryMessagePreference.densityScore === 50
    && messageResult.scheduleFeatures.scheduledMinutes === 0,
  "27. 대화 응답은 일정 블록을 만들지 않고 카테고리와 밀도 점수로 계산되어야 한다",
);
assert(messageSignals.preferredDailyScheduledMinutes === undefined && messageSignals.preferredAverageActivityBlockMinutes === undefined, "27a. 사용자가 시간표를 만들지 않았으면 희망 시간을 0분으로 조작하지 않는다");
const scheduledSignals = buildDuriPreferenceSignals(soomin);
assert(scheduledSignals.preferredDailyScheduledResolutionMinutes === 60 / soomin.scheduleFeatures.dayCount
  && scheduledSignals.preferredAverageActivityBlockResolutionMinutes === 60 / soomin.placeFeatures.selectedPlaceCount,
"27b. 일평균과 활동 블록 평균의 서로 다른 격자 해상도를 보존한다");

assert(
  challengeStyleQuestions.length === 6
    && new Set(challengeStyleQuestions.map((question) => question.id)).size === 6
    && challengeStyleQuestions.every((question) => question.options.length === 5)
    && challengeStyleQuestions.every((question) => question.options.map((option) => option.id).join(",") === "1,2,3,4,5")
    && new Set(challengeStyleQuestions.map((question) => question.options)).size === 6
    && challengeStyleQuestions.filter((question) => question.modelDirection === "reverse").length === 3,
  "28. 도전·안정 모델에는 문항별 답장이 있는 고유한 6개 문항, 순서가 보존된 5점 척도, 3개 역채점 문항이 있어야 한다",
);
assert(
  isPreferenceStepComplete("challengeStyle", soomin.answers)
    && ["challenge_executor", "cautious_explorer", "stable_planner"].includes(soomin.challengeStylePreference.type)
    && soomin.challengeStylePreference.modelVersion === "challenge-style-dt-v1",
  "29. 6개 응답은 앱 모델의 세 유형 중 하나와 모델 버전을 생성해야 한다",
);
assert(
  deriveScheduleStylePreference({ densityScore: 0, restPreferenceScore: 100, staminaScore: 0 }).modifier === "여유로운"
    && deriveScheduleStylePreference({ densityScore: 100, restPreferenceScore: 0, staminaScore: 100 }).modifier === "알찬",
  "30. 일정 밀도·휴식·체력의 양 극단은 여유로운·알찬 일정으로 구분되어야 한다",
);
assert(
  ["여유로운", "알찬"].includes(soomin.scheduleStylePreference.modifier)
    && soomin.scheduleStylePreference.score >= 0
    && soomin.scheduleStylePreference.score <= 100,
  "31. 완료 결과에는 이진 일정 수식어와 0~100점 일정 속도가 포함되어야 한다",
);
assert(
  preferenceSteps.map((step) => step.id).join(",") === "challengeStyle,accommodation,stamina,budget,discovery"
    && !preferenceSteps.some((step) => step.id === "mobility" || step.id === "adventure"),
  "32. 메시지 질문은 하나로 통합되고 이동수단과 중복 도전 문항 없이 5개 단계로 이어져야 한다",
);
const chapterOneFirst = resolvePreferenceTestProgress({ answers: {}, chapterIndex: 0, stepId: "challengeStyle", storyQuestionIndex: 0 });
const chapterOneFinal = resolvePreferenceTestProgress({ answers: {}, chapterIndex: 0, stepId: "challengeStyle", storyQuestionIndex: preferenceStoryQuestions.length - 1 });
const chapterTwoSecond = resolvePreferenceTestProgress({ answers: { accommodation: { stayMeaning: 4 } }, chapterIndex: 1, stepId: "accommodation" });
const chapterFiveFirst = resolvePreferenceTestProgress({ answers: {}, chapterIndex: 4, stepId: "discovery" });
const chapterFiveFinal = resolvePreferenceTestProgress({ answers: { landmarkImportance: 3 }, chapterIndex: 4, stepId: "discovery" });
assert(
  preferenceStoryQuestions.length === 15
    && preferenceQuestionCount === 22
    && preferenceIndividualSelectionCount === 26
    && chapterOneFirst.chapterLabel === "챕터 1 / 5"
    && chapterOneFirst.innerProgressLabel === "질문 1 / 15"
    && chapterOneFinal.innerProgressLabel === "질문 15 / 15"
    && chapterTwoSecond.innerProgressLabel === "숙소 기준 2 / 3"
    && chapterFiveFirst.innerProgressLabel === "선택 1 / 2"
    && chapterFiveFinal.innerProgressLabel === "선택 2 / 2"
    && chapterFiveFinal.isFinalAtomicItem,
  "32-1. 상세 테스트 규모는 source에서 5개 챕터·22개 질문·26개 선택으로 계산되고 각 챕터의 atomic 진행률을 함께 표현해야 한다",
);
const storyFirstKey = resolvePreferenceScrollResetKey({ answers: {}, stepId: "challengeStyle", storyQuestionIndex: 0 });
const storySecondKey = resolvePreferenceScrollResetKey({ answers: {}, stepId: "challengeStyle", storyQuestionIndex: 1 });
assert(
  storyFirstKey !== storySecondKey
    && resolvePreferenceScrollResetKey({ answers: {}, stepId: "accommodation" })
      === resolvePreferenceScrollResetKey({ answers: { accommodation: { stayMeaning: 4 } }, stepId: "accommodation" })
    && resolvePreferenceScrollResetKey({ answers: {}, stepId: "accommodation" })
      !== resolvePreferenceScrollResetKey({ answers: {}, stepId: "stamina" })
    && resolvePreferenceScrollResetKey({ answers: {}, stepId: "budget" })
      !== resolvePreferenceScrollResetKey({ answers: { budgetRanking: ["stay"] }, stepId: "budget" }),
  "32-2. Next·Previous·chapter·예산 inner transition은 scroll key를 바꾸고 같은 화면의 단순 선택은 유지해야 한다",
);
const withoutLegacyAdventure = { ...soomin.answers, adventure: undefined };
const derivedChallengeResult = calculateTravelPreferenceSurveyResult("derived-challenge", withoutLegacyAdventure, "2026-08-03T00:00:00.000Z");
assert(
  derivedChallengeResult.challengePreference.score === derivedChallengeResult.challengeStylePreference.scores.exploration,
  "33. 예전 도전 문항이 없으면 6문항 모델의 탐색 점수로 호환 필드를 채워야 한다",
);

console.log("Preference and compatibility verification passed: 50 assertions");
