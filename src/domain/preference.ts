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
  /** 사용자가 직접 일정표를 구성한 경우에만 존재한다. 누락을 0분으로 해석하지 않는다. */
  preferredDailyScheduledMinutes?: number;
  preferredDailyScheduledResolutionMinutes?: number;
  preferredAverageActivityBlockMinutes?: number;
  preferredAverageActivityBlockResolutionMinutes?: number;
  /** 사용자가 설문 시간표에 직접 배치한 날별 첫 활동 시각의 평균(자정 이후 분). */
  preferredDayStartMinutes?: number;
  preferredDayStartResolutionMinutes?: number;
  /** 사용자가 설문 시간표에 직접 배치한 날별 마지막 활동 종료 시각의 평균(자정 이후 분). */
  preferredDayEndMinutes?: number;
  preferredDayEndResolutionMinutes?: number;
  /** @deprecated algorithmVersion 7 호환 필드. */
  preferredAverageStayMinutes?: number;
  /** @deprecated algorithmVersion 7 호환 공용 해상도. */
  schedulePreferenceResolutionMinutes?: number;
  mobilityModes: string[];
  categoryScores: Record<string, number>;
  /** 명시적 선호/중립/불호 응답만 보존한다. 시간표 배치 비율로 만든 점수와 구분한다. */
  categoryPreferenceLevels?: Record<string, "like" | "neutral" | "dislike">;
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
  /** 저장 데이터에 상세 신호가 있었지만 계약 검증에 실패한 경우 legacy로 오인하지 않는다. */
  detailedSignalsInvalid?: true;
};
