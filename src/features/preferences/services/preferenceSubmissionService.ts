import type { DataSourceMode } from "../../../config/environment";
import { environment } from "../../../config/environment";
import { ApiError, ApiNetworkError, apiClient } from "../../../services/apiClient";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
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
  challengeStyle: {
    challengeStyleAnswers: NonNullable<PersonalPreferenceDraftAnswers["challengeStyleAnswers"]>;
    itineraryMessageAnswers: NonNullable<PersonalPreferenceDraftAnswers["itineraryMessageAnswers"]>;
    type: TravelPreferenceSurveyResult["challengeStylePreference"]["type"];
    scores: TravelPreferenceSurveyResult["challengeStylePreference"]["scores"];
    scheduleStyle: {
      type: TravelPreferenceSurveyResult["scheduleStylePreference"]["type"];
      score: number;
      components: TravelPreferenceSurveyResult["scheduleStylePreference"]["components"];
    };
    itineraryPreference: TravelPreferenceSurveyResult["itineraryMessagePreference"];
  };
  accommodation: {
    answers: NonNullable<PersonalPreferenceDraftAnswers["accommodation"]>;
    scores: TravelPreferenceSurveyResult["accommodationPreference"];
  };
  stamina: {
    answer: NonNullable<PersonalPreferenceDraftAnswers["stamina"]>;
    level: TravelPreferenceSurveyResult["staminaPreference"]["level"];
    score: number;
  };
  budget: {
    ranking: TravelPreferenceSurveyResult["spendingPriority"]["ranking"];
  };
  discovery: {
    answers: {
      landmarkImportance: NonNullable<PersonalPreferenceDraftAnswers["landmarkImportance"]>;
      localInterest: NonNullable<PersonalPreferenceDraftAnswers["localInterest"]>;
    };
    scores: TravelPreferenceSurveyResult["discoveryPreference"];
  };
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

export function toQuizResponses(result: TravelPreferenceSurveyResult): QuizResponses {
  const answers = result.answers;
  return {
    surveyVersion: result.surveyVersion,
    algorithmVersion: result.algorithmVersion,
    challengeStyle: {
      challengeStyleAnswers: { ...answers.challengeStyleAnswers! },
      itineraryMessageAnswers: { ...answers.itineraryMessageAnswers! },
      type: result.challengeStylePreference.type,
      scores: { ...result.challengeStylePreference.scores },
      scheduleStyle: {
        type: result.scheduleStylePreference.type,
        score: result.scheduleStylePreference.score,
        components: { ...result.scheduleStylePreference.components },
      },
      itineraryPreference: {
        categoryScores: { ...result.itineraryMessagePreference.categoryScores },
        densityScore: result.itineraryMessagePreference.densityScore,
      },
    },
    accommodation: {
      answers: { ...answers.accommodation! },
      scores: { ...result.accommodationPreference },
    },
    stamina: {
      answer: answers.stamina!,
      level: result.staminaPreference.level,
      score: result.staminaPreference.score,
    },
    budget: {
      ranking: [...result.spendingPriority.ranking],
    },
    discovery: {
      answers: {
        landmarkImportance: answers.landmarkImportance!,
        localInterest: answers.localInterest!,
      },
      scores: { ...result.discoveryPreference },
    },
  };
}

function submissionFailure(error: unknown): PreferenceCalculationOutcome {
  if (error instanceof ApiNetworkError) {
    return { status: "error", code: "network", message: `${toUserFacingApiErrorMessage(error, "서버에 연결하지 못했어요.")} 답변은 기기에 그대로 보관했어요.` };
  }
  if (error instanceof ApiError) {
    return { status: "error", code: "submission-failed", message: `${toUserFacingApiErrorMessage(error, "여행 성향 결과를 저장하지 못했어요.")} 답변은 기기에 그대로 보관했어요.` };
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
