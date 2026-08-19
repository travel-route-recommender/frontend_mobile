import type { EntityId, ISODateString } from "./user";

export type PreferenceDimension = "pace" | "budget" | "mobility" | "activity" | "mealStyle" | "planningStyle";
export type PreferenceScore = 0 | 1 | 2;

export type PersonalPreferenceAnswers = Record<PreferenceDimension, PreferenceScore>;

/** 정밀 성향 설문에서 두리 분석에 필요한 수치만 도메인에 투영한 값이다. */
export type DuriPreferenceSignals = {
  surveyVersion: number;
  algorithmVersion: number;
  staminaScore: number;
  densityScore: number;
  scheduleStyle: "relaxed" | "packed";
  preferredDailyScheduledMinutes: number;
  preferredAverageStayMinutes: number;
  mobilityModes: string[];
  categoryScores: Record<string, number>;
  budgetRanking: string[];
  landmarkImportance: number;
  localInterest: number;
};

export type UserPreferenceResult = {
  userId: EntityId;
  answers: PersonalPreferenceAnswers;
  profileType: string;
  traits: string[];
  preferredTags: string[];
  completedAt: ISODateString;
  version: number;
  detailedSignals?: DuriPreferenceSignals;
};
