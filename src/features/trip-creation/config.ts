import type { TripEndConditionType, TripTransport } from "../../domain";
import type { CreateTripStep, TripCompanionType } from "./types";

export const createTripSteps: readonly { id: CreateTripStep; title: string; description: string }[] = [
  { id: 0, title: "어디로 떠날까요?", description: "함께 계획할 여행지를 선택해 주세요." },
  { id: 1, title: "언제 떠날까요?", description: "시작일과 종료일을 차례로 선택해 주세요." },
  { id: 2, title: "여행 조건을 알려주세요", description: "실제 이동 방식과 숙소, 마지막 날 종료 조건을 기록해요." },
  { id: 3, title: "누구와 함께하나요?", description: "나는 방장으로 자동 포함돼요." },
  { id: 4, title: "여행방을 확인해 주세요", description: "이름을 정하고 선택한 내용을 검토해요." },
];

export const transportOptions: readonly { value: TripTransport; label: string; description: string }[] = [
  { value: "car", label: "자차", description: "자가용 또는 렌터카로 이동해요" },
  { value: "public", label: "대중교통 · 도보", description: "버스, 지하철, 기차와 도보로 이동해요" },
];

export const endConditionOptions: readonly { value: TripEndConditionType; label: string; description: string }[] = [
  { value: "train", label: "기차 출발", description: "기차역에 도착해야 하는 시각이 있어요" },
  { value: "intercity-bus", label: "버스 출발", description: "버스 터미널에 도착해야 하는 시각이 있어요" },
  { value: "rental-car-return", label: "렌터카 반납", description: "반납 지점과 마감 시각이 있어요" },
  { value: "other", label: "기타 종료 조건", description: "그 밖의 정해진 종료 지점과 시각이 있어요" },
];

export const companionTypeOptions: readonly { value: TripCompanionType; label: string; description: string }[] = [
  { value: "friends", label: "친구·동료", description: "친구나 동료와 함께 떠나요" },
  { value: "family", label: "가족", description: "가족 구성원과 일정을 맞춰요" },
  { value: "couple", label: "연인", description: "둘의 취향을 함께 담아요" },
  { value: "group", label: "모임", description: "여러 사람과 여행을 준비해요" },
  { value: "undecided", label: "아직 미정", description: "유형은 나중에 정할게요" },
];
