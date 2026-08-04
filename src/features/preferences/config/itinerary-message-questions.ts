import type {
  ItineraryMessageQuestionId,
  ItineraryPreferenceLevel,
} from "../types";

export type PreferenceMessageOption<OptionId extends string | number = ItineraryPreferenceLevel> = {
  id: OptionId;
  meaning: string;
  label: string;
};

export type PreferenceQuestionPresentation =
  | { kind: "chat" }
  | {
    kind: "group-choice" | "scene-choice";
    location: string;
    title: string;
    description: string;
    showPromptLabel?: boolean;
  };

export type ItineraryMessageQuestion = {
  id: ItineraryMessageQuestionId;
  categoryIcon: string;
  categoryLabel: string;
  senderName: string;
  senderStatus: string;
  presentation: PreferenceQuestionPresentation;
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
    presentation: {
      kind: "group-choice",
      location: "여행 첫날 · 점심시간",
      title: "친구들과 첫 끼를 고르고 있어요",
      description: "모두 배가 고픈데 유명한 식당은 조금 멀고 대기도 있대요.",
    },
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
    presentation: {
      kind: "scene-choice",
      location: "오후 3:20 · 많이 걸은 뒤",
      title: "분위기 좋은 공간 앞에 멈췄어요",
      description: "친구들은 잠깐 쉬어갈지 다음 장소로 바로 갈지 기다리고 있어요.",
      showPromptLabel: false,
    },
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
    presentation: {
      kind: "group-choice",
      location: "작은 상점이 모인 거리",
      title: "친구들이 자유시간을 의논해요",
      description: "천천히 둘러보자는 친구와 필요한 것만 사자는 친구가 있어요.",
    },
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
    presentation: { kind: "chat" },
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
    presentation: {
      kind: "scene-choice",
      location: "관광 지도 끝의 골목",
      title: "익숙한 길과 낯선 동네가 갈라져요",
      description: "친구들이 어느 쪽으로 걸을지 당신의 선택을 기다리고 있어요.",
    },
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
    presentation: {
      kind: "group-choice",
      location: "현장 접수 마감 10분 전",
      title: "오늘만 가능한 체험을 발견했어요",
      description: "친구들이 지금 신청할지 자유 일정으로 남을지 함께 정하려 해요.",
    },
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
    presentation: { kind: "chat" },
    message: "시간이 좀 걸리는데 그래도 한 번 보러 갈래?",
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
    presentation: {
      kind: "scene-choice",
      location: "해 질 무렵 · 숙소 근처",
      title: "아직 남은 저녁 시간을 바라봐요",
      description: "숙소로 돌아가는 길과 한 곳을 더 둘러보는 길이 앞에 있어요.",
      showPromptLabel: false,
    },
    message: "시간이 조금 남았는데 그냥 숙소에 들어가서 쉴래? 아니면 밖에서 좀 더 둘러볼래?",
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
    presentation: {
      kind: "group-choice",
      location: "여행 전날 · 함께 계획하는 밤",
      title: "친구들과 하루의 속도를 맞춰요",
      description: "가고 싶은 곳을 모두 펼쳐두고 내일 일정을 어느 정도 채울지 정하는 중이에요.",
    },
    message: "이제 지역은 정했는데 일정을 얼마나 빡빡하게 채워야 할까?",
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
