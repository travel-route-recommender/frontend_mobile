import type { TripBudgetLevel, TripIntensity, TripTransport } from "../../domain";
import type { CreateTripStep, TripCompanionType } from "./types";

export const createTripSteps: readonly { id: CreateTripStep; title: string; description: string }[] = [
  { id: 0, title: "어디로 떠날까요?", description: "함께 계획할 여행지를 선택해 주세요." },
  { id: 1, title: "언제 떠날까요?", description: "시작일과 종료일을 차례로 선택해 주세요." },
  { id: 2, title: "어떤 여행을 원하나요?", description: "이동, 예산, 일정 밀도를 정해요." },
  { id: 3, title: "누구와 함께하나요?", description: "나는 방장으로 자동 포함돼요." },
  { id: 4, title: "여행방을 확인해 주세요", description: "이름을 정하고 선택한 내용을 검토해요." },
];

export const transportOptions: readonly { value: TripTransport; label: string; description: string }[] = [
  { value: "public", label: "대중교통", description: "버스와 지하철 중심" },
  { value: "car", label: "자동차", description: "렌터카 또는 자가용" },
  { value: "walking", label: "도보", description: "가까운 동선 중심" },
];

export const budgetOptions: readonly { value: TripBudgetLevel; label: string; description: string }[] = [
  { value: "budget", label: "알뜰하게", description: "가성비를 우선해요" },
  { value: "standard", label: "적당하게", description: "가격과 경험의 균형" },
  { value: "premium", label: "여유롭게", description: "좋은 경험을 우선해요" },
];

export const intensityOptions: readonly { value: TripIntensity; label: string; description: string }[] = [
  { value: "relaxed", label: "느긋하게", description: "하루 1~2곳 정도" },
  { value: "balanced", label: "균형 있게", description: "여유와 관광을 모두" },
  { value: "packed", label: "알차게", description: "다양한 장소를 촘촘히" },
];

export const companionTypeOptions: readonly { value: TripCompanionType; label: string; description: string }[] = [
  { value: "friends", label: "친구·동료", description: "친구나 동료와 함께 떠나요" },
  { value: "family", label: "가족", description: "가족 구성원과 일정을 맞춰요" },
  { value: "couple", label: "연인", description: "둘의 취향을 함께 담아요" },
  { value: "group", label: "모임", description: "여러 사람과 여행을 준비해요" },
  { value: "undecided", label: "아직 미정", description: "유형은 나중에 정할게요" },
];
