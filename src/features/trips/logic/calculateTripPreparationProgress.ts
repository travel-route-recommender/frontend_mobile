import type { TripRoom } from "../../../domain";
import { isValidISODate } from "../../../utils/formatters";
import type { TripPreparationProgress, TripPreparationStep } from "../types";

export interface TripPreparationInput {
  trip: TripRoom;
  completedPreferenceCount: number;
  preferenceTargetCount: number;
  candidateCount: number;
  itineraryCount: number;
}

export function calculateTripPreparationProgress(input: TripPreparationInput): TripPreparationProgress {
  const validDateState = input.trip.dateUndecided
    ? input.trip.startDate === null && input.trip.endDate === null
    : isValidISODate(input.trip.startDate) && isValidISODate(input.trip.endDate) && input.trip.endDate >= input.trip.startDate;
  const validRoom = Boolean(input.trip.regionId) && validDateState;
  const preferenceStatus: TripPreparationStep["status"] = input.preferenceTargetCount > 0 && input.completedPreferenceCount === input.preferenceTargetCount
    ? "completed"
    : input.completedPreferenceCount > 0
      ? "active"
      : "pending";
  const steps: TripPreparationStep[] = [
    { id: "room", label: "여행방 생성", description: validRoom ? "여행 지역과 날짜를 정했어요." : "여행 지역과 날짜를 확인해 주세요.", status: validRoom ? "completed" : "pending" },
    { id: "preferences", label: "동행자 성향 응답", description: `${input.completedPreferenceCount}/${input.preferenceTargetCount}명이 응답했어요.`, status: preferenceStatus, ...(preferenceStatus === "pending" ? { actionLabel: "내 성향 테스트" } : {}) },
    { id: "candidates", label: "후보 장소 수집", description: input.candidateCount ? `${input.candidateCount}곳을 후보로 모으는 중이에요.` : "함께 가고 싶은 장소를 모아보세요.", status: input.candidateCount ? "active" : "pending", actionLabel: input.candidateCount ? "후보 확인" : "장소 탐색" },
    { id: "itinerary", label: "일정 구성", description: input.itineraryCount ? `${input.itineraryCount}개 일정 항목을 구성하는 중이에요.` : "후보 장소를 일정으로 배치해 보세요.", status: input.itineraryCount ? "active" : "pending", actionLabel: "워크스페이스" },
    { id: "confirmation", label: "최종 확인", description: input.trip.status === "confirmed" || input.trip.status === "completed" ? "최종 일정을 확인했어요." : "모두와 확인한 뒤 일정을 확정해요.", status: input.trip.status === "confirmed" || input.trip.status === "completed" ? "completed" : "pending", actionLabel: "일정 확인" },
  ];
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const activeSteps = steps.filter((step) => step.status === "active").length;
  const rate = (steps.reduce((score, step) => score + (step.status === "completed" ? 1 : step.status === "active" ? 0.5 : 0), 0) / steps.length);
  return { completedSteps, activeSteps, totalSteps: steps.length, rate, steps };
}
