import type {
  PersonalPreferenceAnswers,
  PreferenceDimension,
  PreferenceScore,
  UserPreferenceResult,
} from "../../domain";
import { PERSONAL_TEST_VERSION, personalTestQuestions } from "../preferences";
import type { NormalizedPreferenceVector } from "./types";

const preferenceDimensions = personalTestQuestions.map((question) => question.dimension);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPreferenceScore(value: unknown): value is PreferenceScore {
  return value === 0 || value === 1 || value === 2;
}

function normalizeAnswers(value: unknown): PersonalPreferenceAnswers | null {
  if (!isRecord(value)) return null;
  const entries = preferenceDimensions.map((dimension) => [dimension, value[dimension]] as const);
  if (!entries.every(([, score]) => isPreferenceScore(score))) return null;
  return Object.fromEntries(entries) as PersonalPreferenceAnswers;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const label = entry.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [label];
  });
}

export function normalizePreferenceResult(
  value: unknown,
  expectedUserId?: string,
): NormalizedPreferenceVector | null {
  if (!isRecord(value)) return null;
  const userId = typeof value.userId === "string" ? value.userId : "";
  if (!userId || (expectedUserId !== undefined && userId !== expectedUserId)) return null;
  if (value.version !== PERSONAL_TEST_VERSION) return null;
  const values = normalizeAnswers(value.answers);
  if (!values) return null;
  const profileType = typeof value.profileType === "string" && value.profileType.trim()
    ? value.profileType.trim()
    : undefined;
  return {
    userId,
    values,
    preferredTags: normalizeTags(value.preferredTags),
    ...(profileType ? { profileType } : {}),
  };
}

export function isSupportedPreferenceResult(
  value: unknown,
  expectedUserId?: string,
): value is UserPreferenceResult {
  return normalizePreferenceResult(value, expectedUserId) !== null;
}

export const supportedPreferenceDimensions = [...preferenceDimensions] as PreferenceDimension[];
