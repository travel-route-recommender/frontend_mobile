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

function dimensionsFromDetailedSignals(value: unknown, fallback: PersonalPreferenceAnswers) {
  if (!isRecord(value)) return { values: fallback, observedDimensions: [...preferenceDimensions] };
  // 새 설문의 0~100 신호를 임의 25/75 경계로 legacy 0/1/2 축에 투영하지 않는다.
  // 상세 신호는 해상도와 원래 단위를 보존하는 전용 분석기가 사용한다.
  return { values: fallback, observedDimensions: [] as PreferenceDimension[] };
}

export function normalizePreferenceResult(
  value: unknown,
  expectedUserId?: string,
): NormalizedPreferenceVector | null {
  if (!isRecord(value)) return null;
  const userId = typeof value.userId === "string" ? value.userId : "";
  if (!userId || (expectedUserId !== undefined && userId !== expectedUserId)) return null;
  if (value.detailedSignalsInvalid === true) return null;
  if (value.version !== PERSONAL_TEST_VERSION) return null;
  const fallbackValues = normalizeAnswers(value.answers);
  if (!fallbackValues) return null;
  const { values, observedDimensions } = dimensionsFromDetailedSignals(value.detailedSignals, fallbackValues);
  const profileType = typeof value.profileType === "string" && value.profileType.trim()
    ? value.profileType.trim()
    : undefined;
  return {
    userId,
    values,
    observedDimensions,
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
