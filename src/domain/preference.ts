import type { EntityId, ISODateString } from "./user";

export type PreferenceDimension = "pace" | "budget" | "mobility" | "activity" | "mealStyle" | "planningStyle";
export type PreferenceScore = 0 | 1 | 2;

export type PersonalPreferenceAnswers = Record<PreferenceDimension, PreferenceScore>;

export type UserPreferenceResult = {
  userId: EntityId;
  answers: PersonalPreferenceAnswers;
  profileType: string;
  traits: string[];
  preferredTags: string[];
  completedAt: ISODateString;
  version: number;
};
