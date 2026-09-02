import type { ResolvedPreferencePresentation } from "./resolve-preference-presentation";

type UnknownRecord = Record<string, unknown>;

export type ApiPreferenceAxes = {
  scheduleDensity: number;
  landmarkNecessity: number;
  localInterest: number;
  challenging: number;
};

export type ApiTravelType = {
  name: string;
  description: string;
  tags: string[];
  warning?: string;
  emoji?: string;
};

export type ApiPreferenceProfile = {
  completed: boolean;
  travelType: ApiTravelType | null;
  axes: ApiPreferenceAxes | null;
  completedAt?: string;
  activeSessionId?: string;
  presentation: ResolvedPreferencePresentation | null;
};

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function score(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

export function parseApiTravelType(value: unknown): ApiTravelType | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new Error("서버 여행 성향 유형 형식이 올바르지 않아요.");
  const name = optionalString(value.name);
  const description = optionalString(value.description);
  if (!name || !description) throw new Error("서버 여행 성향 유형에 이름 또는 설명이 없어요.");
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    : [];
  const warning = optionalString(value.warning);
  const emoji = optionalString(value.emoji);
  return {
    name,
    description,
    tags,
    ...(warning ? { warning } : {}),
    ...(emoji ? { emoji } : {}),
  };
}

export function parseApiPreferenceAxes(value: unknown): ApiPreferenceAxes | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new Error("서버 여행 성향 축 형식이 올바르지 않아요.");
  const scheduleDensity = score(value.scheduleDensity);
  const landmarkNecessity = score(value.landmarkNecessity);
  const localInterest = score(value.localInterest);
  const challenging = score(value.challenging);
  if (scheduleDensity === undefined || landmarkNecessity === undefined || localInterest === undefined || challenging === undefined) {
    throw new Error("서버 여행 성향 축의 점수 범위가 올바르지 않아요.");
  }
  return { scheduleDensity, landmarkNecessity, localInterest, challenging };
}

export function resolveApiPreferencePresentation(travelType: ApiTravelType): ResolvedPreferencePresentation {
  const traits = travelType.tags.slice(0, 3).map((tag) => `${tag} 여행을 선호해요`);
  return {
    title: travelType.name,
    description: travelType.description,
    icon: travelType.emoji ?? "🧳",
    planningMessage: travelType.warning ?? "두리는 이 성향과 동행자의 선택을 함께 고려해 일정을 조율할게요.",
    traits: traits.length ? traits : ["서버에 저장된 최신 여행 성향이에요"],
    preferredTags: travelType.tags,
    keywordCount: travelType.tags.length,
  };
}

export function parseApiPreferenceCompletionStatus(value: unknown) {
  if (!isRecord(value) || typeof value.completed !== "boolean") {
    throw new Error("서버 여행 성향 완료 상태를 확인할 수 없어요.");
  }
  return value.completed;
}

/**
 * `/quiz/status`를 완료 여부의 기준으로 삼고 `/quiz/me`에서 표시용 최신 결과를 읽는다.
 * 구버전 데이터는 `/quiz/me.completed=false`여도 travelType이 남아 있을 수 있으므로
 * status 또는 travelType 중 하나라도 완료를 증명하면 완료로 간주한다.
 */
export function parseApiPreferenceProfile(statusPayload: unknown, profilePayload: unknown): ApiPreferenceProfile {
  const statusCompleted = parseApiPreferenceCompletionStatus(statusPayload);
  if (!isRecord(statusPayload)) throw new Error("서버 여행 성향 완료 상태를 확인할 수 없어요.");
  if (!isRecord(profilePayload)) throw new Error("서버 여행 성향 결과 형식이 올바르지 않아요.");

  const travelType = parseApiTravelType(profilePayload.travelType);
  const completed = statusCompleted || profilePayload.completed === true || Boolean(travelType);
  if (completed && !travelType) {
    throw new Error("여행 성향은 완료됐지만 서버에 결과 유형이 없어요. 잠시 후 다시 확인해 주세요.");
  }

  const completedAt = optionalString(profilePayload.completedAt);
  const activeSessionId = optionalString(statusPayload.activeSessionId) ?? optionalString(profilePayload.activeSessionId);
  const axes = parseApiPreferenceAxes(profilePayload.axes);
  return {
    completed,
    travelType,
    axes,
    ...(completedAt ? { completedAt } : {}),
    ...(activeSessionId ? { activeSessionId } : {}),
    presentation: travelType ? resolveApiPreferencePresentation(travelType) : null,
  };
}
