import type { PreferenceDimension, PreferenceScore } from "../../domain";

export interface PreferenceChoice {
  value: PreferenceScore;
  label: string;
  description: string;
}

export interface PreferenceQuestion {
  id: string;
  dimension: PreferenceDimension;
  question: string;
  choices: PreferenceChoice[];
}

export const PERSONAL_TEST_VERSION = 1;

export const personalTestQuestions: PreferenceQuestion[] = [
  {
    id: "personal-pace",
    dimension: "pace",
    question: "하루 일정을 어느 정도 채우고 싶나요?",
    choices: [
      { value: 0, label: "여유롭게", description: "머무는 시간과 휴식을 넉넉하게 두고 싶어요." },
      { value: 1, label: "관광과 휴식을 균형 있게", description: "둘러보는 일정과 쉬는 시간을 함께 챙겨요." },
      { value: 2, label: "알차게 많이 둘러보기", description: "하루에 여러 장소를 적극적으로 경험하고 싶어요." },
    ],
  },
  {
    id: "personal-budget",
    dimension: "budget",
    question: "여행에서 비용은 어떻게 쓰는 편인가요?",
    choices: [
      { value: 0, label: "절약을 우선해요", description: "합리적인 가격과 무료 명소를 먼저 살펴봐요." },
      { value: 1, label: "적당한 수준이 좋아요", description: "예산과 만족도를 균형 있게 맞추고 싶어요." },
      { value: 2, label: "기억에 남는 경험이라면 더 써도 괜찮아요", description: "특별한 경험에는 조금 더 투자할 수 있어요." },
    ],
  },
  {
    id: "personal-mobility",
    dimension: "mobility",
    question: "장소 사이 이동은 어느 정도 괜찮나요?",
    choices: [
      { value: 0, label: "가까운 장소 위주가 좋아요", description: "한 권역에서 천천히 둘러보는 편이 편해요." },
      { value: 1, label: "적당한 이동은 괜찮아요", description: "일정 사이 이동이 무리하지 않으면 괜찮아요." },
      { value: 2, label: "멀어도 좋은 장소라면 괜찮아요", description: "가고 싶은 장소라면 이동 부담도 감수할 수 있어요." },
    ],
  },
  {
    id: "personal-activity",
    dimension: "activity",
    question: "어떤 여행 흐름을 더 선호하나요?",
    choices: [
      { value: 0, label: "쉬고 머무는 시간이 중요해요", description: "카페나 풍경 좋은 곳에서 여유롭게 머물고 싶어요." },
      { value: 1, label: "관광과 휴식을 적절히 섞고 싶어요", description: "대표 명소와 쉬는 시간을 고르게 담고 싶어요." },
      { value: 2, label: "체험하고 많이 움직이는 여행이 좋아요", description: "야외 활동과 새로운 체험을 적극적으로 즐겨요." },
    ],
  },
  {
    id: "personal-meal",
    dimension: "mealStyle",
    question: "맛집을 고를 때 어떤 편인가요?",
    choices: [
      { value: 0, label: "대기 없이 편하게 먹고 싶어요", description: "동선 가까운 곳에서 편하게 식사하고 싶어요." },
      { value: 1, label: "상황에 따라 적당히 기다릴 수 있어요", description: "일정에 무리가 없다면 잠깐 기다릴 수 있어요." },
      { value: 2, label: "오래 기다려도 꼭 가고 싶은 곳을 선택해요", description: "로컬 맛집이라면 대기 시간도 감수할 수 있어요." },
    ],
  },
  {
    id: "personal-planning",
    dimension: "planningStyle",
    question: "여행 일정은 어느 정도 정해두고 싶나요?",
    choices: [
      { value: 0, label: "미리 정한 일정을 따르고 싶어요", description: "출발 전에 정한 계획대로 움직이면 편해요." },
      { value: 1, label: "기본 일정은 두되 일부 변경할 수 있어요", description: "큰 흐름은 정하고 상황에 맞춰 조정해요." },
      { value: 2, label: "현장에서 유연하게 결정하고 싶어요", description: "그날의 기분과 상황에 맞춰 선택하고 싶어요." },
    ],
  },
];

export const preferenceDimensionLabels: Record<PreferenceDimension, string> = {
  pace: "일정 밀도",
  budget: "예산",
  mobility: "이동 부담",
  activity: "활동 강도",
  mealStyle: "식사 방식",
  planningStyle: "계획 방식",
};
