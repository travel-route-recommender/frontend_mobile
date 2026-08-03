import type { DataSourceMode } from "../../../config/environment";
import { environment } from "../../../config/environment";
import { calculateTravelPreferenceSurveyResult } from "../logic/calculate-travel-preference-result";
import { validateTravelPreferenceSurvey } from "../logic/travel-preference-survey";
import type { PersonalPreferenceDraftAnswers, TravelPreferenceSurveyResult } from "../types";

export type PreferenceCalculationInput = {
  userId: string;
  answers: PersonalPreferenceDraftAnswers;
  completedAt: string;
};

type PreferenceCalculationOutcome =
  | { status: "success"; source: "local-mock"; result: TravelPreferenceSurveyResult }
  | { status: "error"; code: "invalid-answers" | "contract-unavailable"; message: string };

export interface PreferenceResultService {
  calculate(input: PreferenceCalculationInput): Promise<PreferenceCalculationOutcome>;
}

class LocalPreferenceResultService implements PreferenceResultService {
  async calculate(input: PreferenceCalculationInput): Promise<PreferenceCalculationOutcome> {
    const validation = validateTravelPreferenceSurvey(input.answers);
    if (!validation.valid) return { status: "error", code: "invalid-answers", message: validation.message };
    const result = calculateTravelPreferenceSurveyResult(input.userId, validation.answers, input.completedAt);
    return { status: "success", source: "local-mock", result };
  }
}

class UnavailablePreferenceResultService implements PreferenceResultService {
  async calculate(): Promise<PreferenceCalculationOutcome> {
    return { status: "error", code: "contract-unavailable", message: "백엔드 Quiz 계약 연결 전입니다. 답변은 기기에 그대로 보관했어요." };
  }
}

export function createPreferenceResultService(mode: DataSourceMode): PreferenceResultService {
  return mode === "mock" ? new LocalPreferenceResultService() : new UnavailablePreferenceResultService();
}

export const preferenceResultService = createPreferenceResultService(environment.dataSource);
