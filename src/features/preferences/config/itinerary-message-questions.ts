import type {
  ItineraryMessageQuestionId,
  ItineraryPreferenceLevel,
} from "../types";

export type PreferenceMessageOption = {
  id: ItineraryPreferenceLevel;
  meaning: "선호" | "중간" | "불호";
  label: string;
};

export type ItineraryMessageQuestion = {
  id: ItineraryMessageQuestionId;
  categoryIcon: string;
  categoryLabel: string;
  senderName: string;
  senderStatus: string;
  message: string;
  options: readonly PreferenceMessageOption[];
};

const sender = {
  senderName: "여행 동반자",
  senderStatus: "함께 여행을 준비 중",
} as const;

export const itineraryMessageQuestions: readonly ItineraryMessageQuestion[] = [
  {
    id: "restaurant",
    categoryIcon: "🍜",
    categoryLabel: "식당",
    ...sender,
    message: "우리 여행에서는 맛있는 곳을 찾아다니는 데 시간을 꽤 써도 괜찮을까?",
    options: [
      { id: "like", meaning: "선호", label: "응, 조금 기다리거나 멀어도 맛있는 곳은 꼭 가고 싶어." },
      { id: "neutral", meaning: "중간", label: "한두 곳은 찾아가고, 나머지는 동선에 맞춰 먹자." },
      { id: "dislike", meaning: "불호", label: "나는 맛집을 찾아다니기보다 가까운 곳에서 간단히 먹고 싶어." },
    ],
  },
  {
    id: "cafe",
    categoryIcon: "☕",
    categoryLabel: "카페",
    ...sender,
    message: "여행 중에 분위기 좋은 카페를 찾아서 쉬는 시간도 자주 넣을까?",
    options: [
      { id: "like", meaning: "선호", label: "좋아, 카페도 여행의 중요한 코스니까 여유 있게 들르고 싶어." },
      { id: "neutral", meaning: "중간", label: "지나가다 괜찮은 곳이 있으면 한두 번 들르는 정도가 좋아." },
      { id: "dislike", meaning: "불호", label: "카페에 오래 있기보다는 그 시간에 다른 곳을 더 보고 싶어." },
    ],
  },
  {
    id: "shopping",
    categoryIcon: "🛍️",
    categoryLabel: "쇼핑",
    ...sender,
    message: "우리 일정에 쇼핑할 시간을 따로 넉넉히 잡아둘까?",
    options: [
      { id: "like", meaning: "선호", label: "응, 상점이나 쇼핑몰을 천천히 둘러볼 시간을 꼭 갖고 싶어." },
      { id: "neutral", meaning: "중간", label: "기념품 살 정도의 시간만 적당히 있으면 충분해." },
      { id: "dislike", meaning: "불호", label: "나는 쇼핑 일정은 따로 잡지 않고 꼭 필요한 것만 사고 싶어." },
    ],
  },
  {
    id: "attraction",
    categoryIcon: "🏛️",
    categoryLabel: "명소 관광",
    ...sender,
    message: "그 도시에서 유명한 명소들은 조금 붐벼도 빠뜨리지 않고 가볼까?",
    options: [
      { id: "like", meaning: "선호", label: "응, 대표 명소는 기다리더라도 꼭 챙겨서 보고 싶어." },
      { id: "neutral", meaning: "중간", label: "가장 끌리는 명소 몇 곳만 골라서 가보자." },
      { id: "dislike", meaning: "불호", label: "유명하다는 이유만으로 찾아가기보다는 다른 곳을 보고 싶어." },
    ],
  },
  {
    id: "local",
    categoryIcon: "🪴",
    categoryLabel: "로컬 탐방",
    ...sender,
    message: "유명 관광지 말고 현지 동네나 시장을 천천히 둘러보는 시간도 넣을까?",
    options: [
      { id: "like", meaning: "선호", label: "좋아, 현지 사람들이 사는 동네와 시장을 오래 걸어보고 싶어." },
      { id: "neutral", meaning: "중간", label: "동선이 맞으면 한 번쯤 가볍게 둘러보자." },
      { id: "dislike", meaning: "불호", label: "나는 낯선 동네를 돌아다니기보다 정해진 관광 코스가 편해." },
    ],
  },
  {
    id: "experience",
    categoryIcon: "🎟️",
    categoryLabel: "액티비티",
    ...sender,
    message: "구경만 하기보다 미리 예약해서 하는 체험이나 액티비티도 넣어볼까?",
    options: [
      { id: "like", meaning: "선호", label: "좋아, 직접 해보는 체험이나 액티비티를 꼭 하나 이상 하고 싶어." },
      { id: "neutral", meaning: "중간", label: "부담 없는 체험이 있으면 하나 정도 해보자." },
      { id: "dislike", meaning: "불호", label: "나는 예약 체험보다는 자유롭게 구경하는 일정이 더 좋아." },
    ],
  },
  {
    id: "nature",
    categoryIcon: "🌿",
    categoryLabel: "자연",
    ...sender,
    message: "도심에서 조금 이동하더라도 바다나 공원, 산 같은 자연을 보러 갈까?",
    options: [
      { id: "like", meaning: "선호", label: "응, 시간이 걸려도 자연 풍경을 보는 일정은 꼭 넣고 싶어." },
      { id: "neutral", meaning: "중간", label: "가까운 곳에 좋은 자연 명소가 있으면 들러보자." },
      { id: "dislike", meaning: "불호", label: "나는 자연 명소보다 도심 안에서 즐기는 일정이 더 좋아." },
    ],
  },
  {
    id: "rest",
    categoryIcon: "🛋️",
    categoryLabel: "휴식",
    ...sender,
    message: "여행 중간중간 숙소에 들어가 쉬거나 아무 일정 없는 시간을 넉넉히 둘까?",
    options: [
      { id: "like", meaning: "선호", label: "응, 쉬는 시간이 충분해야 여행을 더 즐길 수 있어." },
      { id: "neutral", meaning: "중간", label: "일정 사이에 잠깐씩 쉬는 정도면 괜찮을 것 같아." },
      { id: "dislike", meaning: "불호", label: "나는 따로 쉬는 시간을 잡기보다 밖에서 계속 둘러보고 싶어." },
    ],
  },
  {
    id: "density",
    categoryIcon: "🗓️",
    categoryLabel: "일정 밀도",
    ...sender,
    message: "그럼 하루 일정은 어느 정도로 채우는 게 좋을까?",
    options: [
      { id: "like", meaning: "선호", label: "아침부터 저녁까지 여러 곳을 알차게 다니고 싶어." },
      { id: "neutral", meaning: "중간", label: "핵심 일정 두세 개에 여유 시간을 섞는 게 좋아." },
      { id: "dislike", meaning: "불호", label: "하루 한두 곳만 보고 나머지는 천천히 보내고 싶어." },
    ],
  },
];

export const itineraryPreferenceLevelScores: Record<ItineraryPreferenceLevel, number> = {
  like: 100,
  neutral: 50,
  dislike: 0,
};

export const itineraryPreferenceLevelLabels: Record<ItineraryPreferenceLevel, "선호" | "중간" | "불호"> = {
  like: "선호",
  neutral: "중간",
  dislike: "불호",
};
