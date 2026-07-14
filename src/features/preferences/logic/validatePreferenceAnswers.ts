import type { PersonalPreferenceAnswers, PreferenceDimension, PreferenceScore } from "../../../domain";
import { PERSONAL_TEST_VERSION, personalTestQuestions } from "../../../duri/preferences";
import type { PersonalPreferenceDraftAnswers } from "../types";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type PreferenceAnswersValidation =
  | { valid: true; answers: PersonalPreferenceAnswers }
  | {
      valid: false;
      code: "empty-config" | "version-mismatch" | "missing-answer" | "invalid-answer" | "unknown-question";
      message: string;
      firstInvalidDimension?: PreferenceDimension;
    };

export function normalizePreferenceDraftAnswers(value: unknown): PersonalPreferenceDraftAnswers {
  if (!isRecord(value)) return {};
  const normalized: PersonalPreferenceDraftAnswers = {};
  for (const question of personalTestQuestions) {
    const score = value[question.dimension];
    if (question.choices.some((choice) => choice.value === score)) normalized[question.dimension] = score as PreferenceScore;
  }
  return normalized;
}

export function validatePreferenceAnswers(value: unknown, configVersion: number): PreferenceAnswersValidation {
  if (!personalTestQuestions.length) return { valid: false, code: "empty-config", message: "여행 성향 문항을 불러오지 못했어요." };
  if (configVersion !== PERSONAL_TEST_VERSION) return { valid: false, code: "version-mismatch", message: "문항이 변경되어 테스트를 처음부터 다시 시작해 주세요." };
  if (!isRecord(value)) return { valid: false, code: "missing-answer", message: "아직 답하지 않은 문항이 있어요.", firstInvalidDimension: personalTestQuestions[0]?.dimension };

  const validDimensions = new Set(personalTestQuestions.map((question) => question.dimension));
  const unknownKey = Object.keys(value).find((key) => !validDimensions.has(key as PreferenceDimension));
  if (unknownKey) return { valid: false, code: "unknown-question", message: "현재 문항에 없는 답변이 포함되어 있어요." };

  for (const question of personalTestQuestions) {
    const score = value[question.dimension];
    if (score === undefined) return { valid: false, code: "missing-answer", message: "아직 답하지 않은 문항이 있어요.", firstInvalidDimension: question.dimension };
    if (!question.choices.some((choice) => choice.value === score)) return { valid: false, code: "invalid-answer", message: "선택할 수 없는 답변이 포함되어 있어요.", firstInvalidDimension: question.dimension };
  }

  return { valid: true, answers: Object.fromEntries(personalTestQuestions.map((question) => [question.dimension, value[question.dimension] as PreferenceScore])) as PersonalPreferenceAnswers };
}
