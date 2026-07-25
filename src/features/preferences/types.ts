import type { UserPreferenceResult } from "../../domain";

export type PreferenceStepId = "itinerary" | "mobility" | "accommodation" | "adventure" | "stamina" | "budget" | "discovery";
export type ActivityTagId = "restaurant" | "cafe" | "shopping" | "attraction" | "local" | "experience" | "nature" | "rest";
export type ItineraryMessageQuestionId = ActivityTagId | "density";
export type ItineraryPreferenceLevel = "like" | "neutral" | "dislike";
export type ItineraryMessageAnswers = Partial<Record<ItineraryMessageQuestionId, ItineraryPreferenceLevel>>;
export type ItineraryHourSlot = "08:00" | "09:00" | "10:00" | "11:00" | "12:00" | "13:00" | "14:00" | "15:00" | "16:00" | "17:00" | "18:00" | "19:00" | "20:00" | "21:00" | "22:00" | "23:00";
export type ItineraryBlock = { id: string; activityId: ActivityTagId; startSlot: ItineraryHourSlot; durationHours: number };
export type ItineraryDay = { id: string; blocks: ItineraryBlock[] };
export type MobilityMode = "ownCar" | "rentalCar" | "bus" | "subway" | "train" | "taxi" | "walk";
export type AccommodationAxis = "stayMeaning" | "locationFacility" | "comfortPrice";
export type AccommodationScaleValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FourPointScaleValue = 1 | 2 | 3 | 4;
export type StaminaLevel = "low" | "medium" | "high";
export type BudgetCategory = "stay" | "food" | "activity" | "shopping" | "mobility";

export type PreferenceDraftOwner =
  | { kind: "anonymous" }
  | { kind: "user"; userId: string };

export type PersonalPreferenceDraftAnswers = {
  itineraryMessageAnswers?: ItineraryMessageAnswers;
  itineraryDays?: ItineraryDay[];
  mobilityModes?: MobilityMode[];
  accommodation?: Partial<Record<AccommodationAxis, AccommodationScaleValue>>;
  adventure?: FourPointScaleValue;
  stamina?: StaminaLevel;
  budgetAllocation?: Partial<Record<BudgetCategory, number>>;
  landmarkImportance?: FourPointScaleValue;
  localInterest?: FourPointScaleValue;
};

export interface PersonalPreferenceDraft {
  configVersion: number;
  owner: PreferenceDraftOwner;
  currentQuestionIndex: number;
  answers: PersonalPreferenceDraftAnswers;
  startedAt: string;
  updatedAt: string;
}

export type CompletedPreferenceSurvey = {
  owner: PreferenceDraftOwner;
  answers: PersonalPreferenceDraftAnswers;
  completedAt: string;
};

export type PreferencePreviewResult = Omit<UserPreferenceResult, "userId">;

export type TravelPreferenceSurveyResult = {
  userId: string;
  surveyVersion: number;
  algorithmVersion: number;
  completedAt: string;
  answers: PersonalPreferenceDraftAnswers;
  itineraryMessagePreference: {
    categoryScores: Record<ActivityTagId, number>;
    densityScore: number;
  };
  scheduleFeatures: {
    dayCount: number;
    scheduleSpanMinutes: number;
    scheduledMinutes: number;
    activityMinutes: number;
    restMinutes: number;
    freeTimeMinutes: number;
    blockCount: number;
    restBlockCount: number;
    averageStayMinutes: number;
    averageDailyScheduledMinutes: number;
    densityScore: number;
  };
  placeFeatures: {
    selectedPlaceCount: number;
    selectedLandmarkCount: number;
    selectedLocalPlaceCount: number;
    landmarkAllocatedMinutes: number;
    localAllocatedMinutes: number;
    landmarkImportance: number;
    localInterest: number;
  };
  transportPreferences: Record<MobilityMode, number>;
  accommodationPreference: {
    stayImportance: number;
    facilityOverLocation: number;
    comfortOverPrice: number;
  };
  challengePreference: {
    score: number;
    label: "VALIDATED" | "LESS_VALIDATED";
  };
  staminaPreference: {
    level: "LOW" | "NORMAL" | "HIGH";
    score: number;
  };
  spendingAllocation: {
    totalCoins: number;
    allocation: Record<BudgetCategory, number>;
  };
  discoveryPreference: {
    landmarkImportance: number;
    localInterest: number;
  };
};
