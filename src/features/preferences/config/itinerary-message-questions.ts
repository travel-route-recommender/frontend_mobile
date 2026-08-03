import type {
  ItineraryMessageQuestionId,
  ItineraryPreferenceLevel,
} from "../types";

export type PreferenceMessageOption<OptionId extends string | number = ItineraryPreferenceLevel> = {
  id: OptionId;
  meaning: string;
  label: string;
};

export type ItineraryMessageQuestion = {
  id: ItineraryMessageQuestionId;
  categoryIcon: string;
  categoryLabel: string;
  senderName: string;
  senderStatus: string;
  message: string;
  options: readonly PreferenceMessageOption<ItineraryPreferenceLevel>[];
};

const sender = {
  senderName: "여행 메이트",
  senderStatus: "오늘의 여행 가방을 채우는 중",
} as const;

export const itineraryMessageQuestions: readonly ItineraryMessageQuestion[] = [
  {
    id: "restaurant",
    categoryIcon: "🍜",
    categoryLabel: "식당",
    ...sender,
    message: "점심시간이 됐어. 조금 기다리거나 멀리 가더라도, 맛있는 곳을 찾아가는 하루는 어때?",
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
    message: "한참 걷다 보니 분위기 좋은 카페가 보여. 카페에 머무는 시간도 여행 코스로 담을까?",
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
    message: "기념품 가게와 작은 상점이 모인 거리가 나왔어. 쇼핑 시간을 따로 챙겨둘까?",
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
    message: "사진에서 보던 대표 명소가 가까이 있어. 조금 붐벼도 이번 여행에 담아볼까?",
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
    message: "관광 지도 끝에 현지 시장과 작은 골목이 보여. 동네를 천천히 걷는 시간도 넣을까?",
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
    message: "오늘만 참여할 수 있는 체험 티켓이 남아 있대. 직접 해보는 일정도 하나 담을까?",
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
    message: "도심 밖으로 조금 나가면 바다와 공원이 있대. 이동 시간을 써서라도 자연을 보러 갈까?",
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
    message: "오후가 길어졌어. 숙소에 들어가 쉬거나 아무것도 하지 않는 빈칸도 남겨둘까?",
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
    message: "이제 하루 지도를 거의 다 채웠어. 우리 일정은 어느 정도 속도로 흘러가면 좋을까?",
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
