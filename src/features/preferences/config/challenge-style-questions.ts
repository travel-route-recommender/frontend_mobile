import type {
  ChallengeStyleQuestionId,
  FivePointScaleValue,
} from "../types";
import type { PreferenceMessageOption } from "./itinerary-message-questions";

export const CHALLENGE_STYLE_QUESTIONNAIRE_VERSION = "challenge-style-short-v1";

export type ChallengeStyleQuestion = {
  id: ChallengeStyleQuestionId;
  facet: "O4" | "E5" | "C6";
  modelDirection: "direct" | "reverse";
  categoryIcon: string;
  categoryLabel: string;
  senderName: string;
  senderStatus: string;
  message: string;
  options: readonly PreferenceMessageOption<FivePointScaleValue>[];
};

const sender = {
  senderName: "여행 메이트",
  senderStatus: "다음 여행 얘기 나누는 중",
} as const;

export const challengeStyleQuestions: readonly ChallengeStyleQuestion[] = [
  {
    id: "i18",
    facet: "O4",
    modelDirection: "direct",
    categoryIcon: "🌈",
    categoryLabel: "새로움 한 스푼",
    ...sender,
    message: "여행도 일상도 비슷한 흐름이 계속되면 살짝 심심하잖아. 너는 중간중간 새로운 걸 해보는 게 좋아?",
    options: [
      { id: 1, meaning: "새로움 선호가 매우 낮음", label: "나는 익숙한 흐름이 제일 편해." },
      { id: 2, meaning: "새로움 선호가 낮음", label: "새로운 건 가끔이면 충분해." },
      { id: 3, meaning: "새로움 선호가 중간", label: "그날 기분에 따라 달라." },
      { id: 4, meaning: "새로움 선호가 높음", label: "응, 새로운 게 하나쯤 있으면 좋아." },
      { id: 5, meaning: "새로움 선호가 매우 높음", label: "완전! 새로운 게 있어야 더 신나." },
    ],
  },
  {
    id: "i48",
    facet: "O4",
    modelDirection: "reverse",
    categoryIcon: "🧩",
    categoryLabel: "내가 편한 방식",
    ...sender,
    message: "처음 보는 방법이 있어도, 굳이 바꾸기보단 손에 익은 방식으로 하는 편이야?",
    options: [
      { id: 1, meaning: "익숙한 방식 선호가 매우 낮음", label: "아니, 새 방법도 바로 해보는 편이야." },
      { id: 2, meaning: "익숙한 방식 선호가 낮음", label: "새 방법 쪽에 조금 더 마음이 가." },
      { id: 3, meaning: "익숙한 방식 선호가 중간", label: "둘 다 괜찮아. 상황을 봐." },
      { id: 4, meaning: "익숙한 방식 선호가 높음", label: "응, 익숙한 방식이 조금 더 편해." },
      { id: 5, meaning: "익숙한 방식 선호가 매우 높음", label: "맞아, 아는 방식이 제일 마음 편해." },
    ],
  },
  {
    id: "i22",
    facet: "E5",
    modelDirection: "direct",
    categoryIcon: "🎢",
    categoryLabel: "두근두근 체험",
    ...sender,
    message: "여행 중에 조금 두근거리는 체험이 보이면 어때? 짜릿한 것도 꽤 좋아하는 편이야?",
    options: [
      { id: 1, meaning: "자극 선호가 매우 낮음", label: "나는 편안하고 잔잔한 게 좋아." },
      { id: 2, meaning: "자극 선호가 낮음", label: "가벼운 재미 정도면 충분해." },
      { id: 3, meaning: "자극 선호가 중간", label: "분위기와 컨디션을 봐야 해." },
      { id: 4, meaning: "자극 선호가 높음", label: "좋아, 살짝 두근거리는 건 환영이야." },
      { id: 5, meaning: "자극 선호가 매우 높음", label: "완전 좋아! 짜릿해야 기억에 남지." },
    ],
  },
  {
    id: "i52",
    facet: "E5",
    modelDirection: "direct",
    categoryIcon: "🧭",
    categoryLabel: "작은 모험",
    ...sender,
    message: "일정에 없더라도 ‘이건 작은 모험인데?’ 싶은 게 보이면 일부러 해보러 가는 편이야?",
    options: [
      { id: 1, meaning: "모험 탐색이 매우 낮음", label: "아니, 굳이 찾아가진 않아." },
      { id: 2, meaning: "모험 탐색이 낮음", label: "근처라면 한 번 생각해볼래." },
      { id: 3, meaning: "모험 탐색이 중간", label: "시간과 상황이 맞으면 해." },
      { id: 4, meaning: "모험 탐색이 높음", label: "응, 재밌어 보이면 찾아가는 편이야." },
      { id: 5, meaning: "모험 탐색이 매우 높음", label: "맞아! 발견하면 바로 가보고 싶어." },
    ],
  },
  {
    id: "i90",
    facet: "C6",
    modelDirection: "reverse",
    categoryIcon: "🎟️",
    categoryLabel: "예약 버튼 앞에서",
    ...sender,
    message: "마음에 드는 게 보이면 자세히 알아보기 전에 ‘일단 예약!’부터 하는 편이야?",
    options: [
      { id: 1, meaning: "성급한 결정이 매우 낮음", label: "아니, 중요한 건 확인하고 예약해." },
      { id: 2, meaning: "성급한 결정이 낮음", label: "대체로 한 번 살펴보고 정해." },
      { id: 3, meaning: "성급한 결정이 중간", label: "그때그때 달라." },
      { id: 4, meaning: "성급한 결정이 높음", label: "종종 먼저 예약하고 보는 편이야." },
      { id: 5, meaning: "성급한 결정이 매우 높음", label: "맞아, 놓치기 전에 일단 잡고 봐!" },
    ],
  },
  {
    id: "i120",
    facet: "C6",
    modelDirection: "reverse",
    categoryIcon: "💭",
    categoryLabel: "고민되는 선택",
    ...sender,
    message: "갈 곳을 고를 때 오래 비교하기보다, 끌리는 곳부터 먼저 골라보는 편이야?",
    options: [
      { id: 1, meaning: "즉흥 결정이 매우 낮음", label: "아니, 비교해 보고 고르는 편이야." },
      { id: 2, meaning: "즉흥 결정이 낮음", label: "조금은 따져본 다음 정해." },
      { id: 3, meaning: "즉흥 결정이 중간", label: "선택에 따라 달라." },
      { id: 4, meaning: "즉흥 결정이 높음", label: "대체로 마음 가는 곳을 먼저 골라." },
      { id: 5, meaning: "즉흥 결정이 매우 높음", label: "응, 일단 고르고 나중에 생각해!" },
    ],
  },
];
