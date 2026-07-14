import type { PersonalPreferenceAnswers, PreferenceDimension, PreferenceScore, UserPreferenceResult } from "../../domain";

export type PreferenceDraftOwner =
  | { kind: "anonymous" }
  | { kind: "user"; userId: string };

export type PersonalPreferenceDraftAnswers = Partial<Record<PreferenceDimension, PreferenceScore>>;

export interface PersonalPreferenceDraft {
  configVersion: number;
  owner: PreferenceDraftOwner;
  currentQuestionIndex: number;
  answers: PersonalPreferenceDraftAnswers;
  startedAt: string;
  updatedAt: string;
}

export type PreferencePreviewResult = Omit<UserPreferenceResult, "userId">;

export type PreferenceSubmissionInput = {
  answers: PersonalPreferenceAnswers;
  completedAt: string;
};

export type PreferenceSubmissionResult =
  | { status: "success"; source: "local-mock"; result: PreferencePreviewResult }
  | { status: "error"; code: "invalid-answers" | "contract-unavailable" | "empty-config"; message: string };
