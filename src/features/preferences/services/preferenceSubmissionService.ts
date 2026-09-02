import type { DataSourceMode } from "../../../config/environment";
import { environment } from "../../../config/environment";
import { ApiError, ApiNetworkError, apiClient } from "../../../services/apiClient";
import { calculateTravelPreferenceSurveyResult } from "../logic/calculate-travel-preference-result";
import { validateTravelPreferenceSurvey } from "../logic/travel-preference-survey";
import type { PersonalPreferenceDraftAnswers, TravelPreferenceSurveyResult } from "../types";

export type PreferenceCalculationInput = {
  userId: string;
  answers: PersonalPreferenceDraftAnswers;
  completedAt: string;
};

type PreferenceCalculationOutcome =
  | { status: "success"; source: "local-mock" | "backend"; result: TravelPreferenceSurveyResult }
  | { status: "error"; code: "invalid-answers" | "network" | "submission-failed"; message: string };

type QuizSessionResponse = { id: string };
type QuizCompleteResponse = { completedAt?: string };

type QuizResponses = {
  surveyVersion: number;
  algorithmVersion: number;
  challengeStyleAnswers: NonNullable<PersonalPreferenceDraftAnswers["challengeStyleAnswers"]>;
  itineraryMessageAnswers: NonNullable<PersonalPreferenceDraftAnswers["itineraryMessageAnswers"]>;
  itineraryDays: NonNullable<PersonalPreferenceDraftAnswers["itineraryDays"]>;
  mobilityModes: NonNullable<PersonalPreferenceDraftAnswers["mobilityModes"]>;
  accommodation: NonNullable<PersonalPreferenceDraftAnswers["accommodation"]>;
  adventure: NonNullable<PersonalPreferenceDraftAnswers["adventure"]>;
  stamina: NonNullable<PersonalPreferenceDraftAnswers["stamina"]>;
  budgetRanking: NonNullable<PersonalPreferenceDraftAnswers["budgetRanking"]>;
  landmarkImportance: NonNullable<PersonalPreferenceDraftAnswers["landmarkImportance"]>;
  localInterest: NonNullable<PersonalPreferenceDraftAnswers["localInterest"]>;
};

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

function toQuizResponses(result: TravelPreferenceSurveyResult): QuizResponses {
  const answers = result.answers;
  return {
    surveyVersion: result.surveyVersion,
    algorithmVersion: result.algorithmVersion,
    challengeStyleAnswers: answers.challengeStyleAnswers!,
    itineraryMessageAnswers: answers.itineraryMessageAnswers!,
    itineraryDays: answers.itineraryDays!,
    mobilityModes: answers.mobilityModes!,
    accommodation: answers.accommodation!,
    adventure: answers.adventure!,
    stamina: answers.stamina!,
    budgetRanking: result.spendingPriority.ranking,
    landmarkImportance: answers.landmarkImportance!,
    localInterest: answers.localInterest!,
  };
}

function submissionFailure(error: unknown): PreferenceCalculationOutcome {
  if (error instanceof ApiNetworkError) {
    return { status: "error", code: "network", message: `${error.message} 답변은 기기에 그대로 보관했어요.` };
  }
  if (error instanceof ApiError) {
    return { status: "error", code: "submission-failed", message: `${error.message} 답변은 기기에 그대로 보관했어요.` };
  }
  return { status: "error", code: "submission-failed", message: "여행 성향 결과를 저장하지 못했어요. 답변은 기기에 그대로 보관했어요." };
}

class ApiPreferenceResultService implements PreferenceResultService {
  async calculate(input: PreferenceCalculationInput): Promise<PreferenceCalculationOutcome> {
    const validation = validateTravelPreferenceSurvey(input.answers);
    if (!validation.valid) return { status: "error", code: "invalid-answers", message: validation.message };
    const result = calculateTravelPreferenceSurveyResult(input.userId, validation.answers, input.completedAt);
    try {
      const session = await apiClient.request<QuizSessionResponse>({ path: "/quiz/sessions", method: "POST", auth: true });
      if (!session?.id) throw new Error("Quiz session id is missing");
      const completed = await apiClient.request<QuizCompleteResponse>({
        path: `/quiz/sessions/${session.id}/complete`,
        method: "POST",
        auth: true,
        body: { responses: toQuizResponses(result) },
      });
      const serverCompletedAt = typeof completed?.completedAt === "string" && completed.completedAt.trim()
        ? completed.completedAt
        : result.completedAt;
      return { status: "success", source: "backend", result: { ...result, completedAt: serverCompletedAt } };
    } catch (error) {
      return submissionFailure(error);
    }
  }
}

export function createPreferenceResultService(mode: DataSourceMode): PreferenceResultService {
  return mode === "mock" ? new LocalPreferenceResultService() : new ApiPreferenceResultService();
}

export const preferenceResultService = createPreferenceResultService(environment.dataSource);
