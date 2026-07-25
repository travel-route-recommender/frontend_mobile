import { createMockTravelPreferenceResults } from "../src/features/preferences/config/mock-travel-preference-results";
import { MOCK_FRIEND_IDS, mockFriendProfiles } from "../src/features/compatibility/config/mock-friends";
import {
  calculateLegacyPreferenceProjection,
  calculateTravelPreferenceSurveyResult,
} from "../src/features/preferences/logic/calculate-travel-preference-result";
import { itineraryMessageQuestions } from "../src/features/preferences/config/itinerary-message-questions";
import { isPreferenceStepComplete } from "../src/features/preferences/logic/travel-preference-survey";
import type { ItineraryMessageAnswers } from "../src/features/preferences/types";
import {
  calculateFriendCompatibility,
  getCompatibilityType,
} from "../src/features/compatibility/logic/calculate-friend-compatibility";

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
  "1. 윤지·민석·현호·수현의 프로필과 7단계 결과가 준비되어야 한다",
);
assert(soomin.spendingAllocation.totalCoins === 100, "2. 예산 합계는 100이어야 한다");
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
assert(oneFriend.score >= 0 && oneFriend.score <= 100 && oneFriend.categories.length === 7, "10. 한 명 궁합은 7개 카테고리와 0~100 점수를 반환해야 한다");
const group = calculateFriendCompatibility(soomin, [yunji, minseok], "2026-07-22T00:00:00.000Z");
assert(group.friendUserIds.length === 2 && group.score >= 0 && group.score <= 100, "11. 여러 친구는 하나의 그룹 평균 결과를 반환해야 한다");

assert(getCompatibilityType(0).id === "NEEDS_COORDINATION", "12. 0~19점 유형");
assert(getCompatibilityType(20).id === "ENJOY_DIFFERENCES", "13. 20~39점 유형");
assert(getCompatibilityType(40).id === "BALANCED_MATCH", "14. 40~59점 유형");
assert(getCompatibilityType(60).id === "GOOD_MATCH", "15. 60~79점 유형");
assert(getCompatibilityType(80).id === "PERFECT_MATCH", "16. 80~100점 유형");

const repeatedGroup = calculateFriendCompatibility(soomin, [yunji, minseok], "2026-07-22T00:00:00.000Z");
assert(repeatedGroup.requesterUserId === soomin.userId && repeatedGroup.friendUserIds.length === 2, "17. 궁합 결과에는 참여자 식별 정보가 포함되어야 한다");
assert(repeatedGroup.score === group.score, "18. 같은 입력의 클라이언트 궁합 계산은 결정적이어야 한다");

assert(
  itineraryMessageQuestions.length === 9
    && new Set(itineraryMessageQuestions.map((question) => question.id)).size === 9
    && itineraryMessageQuestions.every((question) => (
      question.options.length === 3
      && question.options.map((option) => option.id).join(",") === "like,neutral,dislike"
    )),
  "19. 일정 앞에는 고유한 9개 대화 질문과 선호·중간·불호 답장이 있어야 한다",
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
assert(isPreferenceStepComplete("itinerary", messageSurveyAnswers), "20. 9개 대화에 모두 답하면 첫 항목이 완료되어야 한다");
const messageResult = calculateTravelPreferenceSurveyResult("message-user", messageSurveyAnswers, "2026-07-24T00:00:00.000Z");
assert(
  messageResult.itineraryMessagePreference.categoryScores.restaurant === 100
    && messageResult.itineraryMessagePreference.densityScore === 50
    && messageResult.scheduleFeatures.scheduledMinutes === 0,
  "21. 대화 응답은 일정 블록을 만들지 않고 카테고리와 밀도 점수로 계산되어야 한다",
);

console.log("Preference and compatibility verification passed: 21 assertions");
