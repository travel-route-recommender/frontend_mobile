import { calculateTravelPreferenceSurveyResult } from "../logic/calculate-travel-preference-result";
import type { PersonalPreferenceDraftAnswers, TravelPreferenceSurveyResult } from "../types";

const fixtures: Record<string, { completedAt: string; answers: PersonalPreferenceDraftAnswers }> = {
  "user-soomin": {
    completedAt: "2026-07-01T09:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 5, i48: 1, i22: 3, i52: 3, i90: 1, i120: 1 },
      itineraryDays: [{ id: "day-1", blocks: [
        { id: "soomin-1", activityId: "cafe", startSlot: "10:00", durationHours: 2 },
        { id: "soomin-2", activityId: "local", startSlot: "14:00", durationHours: 2 },
        { id: "soomin-3", activityId: "rest", startSlot: "18:00", durationHours: 1 },
      ] }],
      mobilityModes: ["subway", "bus", "walk"],
      accommodation: { stayMeaning: 4, locationFacility: 3, comfortPrice: 4 },
      adventure: 3,
      stamina: "medium",
      budgetAllocation: { stay: 20, food: 30, activity: 20, shopping: 10, mobility: 20 },
      landmarkImportance: 2,
      localInterest: 4,
    },
  },
  "user-jiyoon": {
    completedAt: "2026-07-02T09:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 5, i48: 1, i22: 3, i52: 3, i90: 1, i120: 1 },
      itineraryDays: [{ id: "day-1", blocks: [
        { id: "jiyoon-1", activityId: "cafe", startSlot: "09:00", durationHours: 2 },
        { id: "jiyoon-2", activityId: "local", startSlot: "13:00", durationHours: 2 },
        { id: "jiyoon-3", activityId: "nature", startSlot: "17:00", durationHours: 2 },
      ] }],
      mobilityModes: ["subway", "bus", "walk"],
      accommodation: { stayMeaning: 5, locationFacility: 3, comfortPrice: 3 },
      adventure: 3,
      stamina: "medium",
      budgetAllocation: { stay: 20, food: 30, activity: 20, shopping: 10, mobility: 20 },
      landmarkImportance: 2,
      localInterest: 4,
    },
  },
  "user-minjae": {
    completedAt: "2026-07-03T09:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 2, i48: 4, i22: 2, i52: 2, i90: 1, i120: 1 },
      itineraryDays: [{ id: "day-1", blocks: [
        { id: "minjae-1", activityId: "attraction", startSlot: "08:00", durationHours: 3 },
        { id: "minjae-2", activityId: "experience", startSlot: "12:00", durationHours: 3 },
        { id: "minjae-3", activityId: "shopping", startSlot: "17:00", durationHours: 2 },
        { id: "minjae-4", activityId: "restaurant", startSlot: "20:00", durationHours: 2 },
      ] }],
      mobilityModes: ["rentalCar", "taxi"],
      accommodation: { stayMeaning: 7, locationFacility: 7, comfortPrice: 2 },
      adventure: 2,
      stamina: "high",
      budgetAllocation: { stay: 30, food: 25, activity: 25, shopping: 10, mobility: 10 },
      landmarkImportance: 4,
      localInterest: 2,
    },
  },
  "user-hyunho": {
    completedAt: "2026-07-04T09:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 5, i48: 1, i22: 5, i52: 5, i90: 5, i120: 5 },
      itineraryDays: [{ id: "day-1", blocks: [
        { id: "hyunho-1", activityId: "nature", startSlot: "08:00", durationHours: 2 },
        { id: "hyunho-2", activityId: "experience", startSlot: "11:00", durationHours: 3 },
        { id: "hyunho-3", activityId: "local", startSlot: "16:00", durationHours: 2 },
        { id: "hyunho-4", activityId: "rest", startSlot: "20:00", durationHours: 1 },
      ] }],
      mobilityModes: ["rentalCar", "walk"],
      accommodation: { stayMeaning: 6, locationFacility: 5, comfortPrice: 5 },
      adventure: 4,
      stamina: "high",
      budgetAllocation: { stay: 15, food: 20, activity: 35, shopping: 10, mobility: 20 },
      landmarkImportance: 2,
      localInterest: 4,
    },
  },
  "user-suhyeon": {
    completedAt: "2026-07-05T09:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 2, i48: 5, i22: 2, i52: 2, i90: 1, i120: 1 },
      itineraryDays: [{ id: "day-1", blocks: [
        { id: "suhyeon-1", activityId: "restaurant", startSlot: "10:00", durationHours: 2 },
        { id: "suhyeon-2", activityId: "cafe", startSlot: "13:00", durationHours: 2 },
        { id: "suhyeon-3", activityId: "shopping", startSlot: "16:00", durationHours: 3 },
        { id: "suhyeon-4", activityId: "rest", startSlot: "20:00", durationHours: 2 },
      ] }],
      mobilityModes: ["bus", "subway", "taxi"],
      accommodation: { stayMeaning: 5, locationFacility: 2, comfortPrice: 7 },
      adventure: 1,
      stamina: "low",
      budgetAllocation: { stay: 25, food: 35, activity: 10, shopping: 25, mobility: 5 },
      landmarkImportance: 3,
      localInterest: 3,
    },
  },
};

export function createMockTravelPreferenceResults(): Record<string, TravelPreferenceSurveyResult> {
  return Object.fromEntries(Object.entries(fixtures).map(([userId, fixture]) => [
    userId,
    calculateTravelPreferenceSurveyResult(userId, fixture.answers, fixture.completedAt),
  ]));
}

const mockTravelPreferenceResults = createMockTravelPreferenceResults();

export function getMockTravelPreferenceResult(userId: string) {
  return mockTravelPreferenceResults[userId] ?? null;
}
