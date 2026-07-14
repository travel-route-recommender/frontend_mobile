import type { TripRoom, UserPreferenceResult } from "../../domain";
import { preferenceDimensionLabels } from "../preferences";
import type {
  GroupPlanningDimension,
  GroupPreferenceDiagnosis,
  GroupPreferenceDimensionDiagnosis,
} from "./types";

const planningDimensions: GroupPlanningDimension[] = ["pace", "mobility", "activity", "mealStyle", "planningStyle"];

export function diagnoseGroupPreferences(
  trip: TripRoom,
  preferenceResults: Record<string, UserPreferenceResult>,
): GroupPreferenceDiagnosis {
  const completedResults = trip.members.flatMap((member) => {
    const result = preferenceResults[member.userId];
    return result?.answers ? [{ userId: member.userId, result }] : [];
  });
  const dimensions = Object.fromEntries(planningDimensions.map((dimension) => {
    const responses = completedResults.map(({ userId, result }) => ({ userId, score: result.answers[dimension] }));
    const scores = responses.map((response) => response.score);
    const average = scores.length ? scores.reduce<number>((sum, score) => sum + score, 0) / scores.length : undefined;
    const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : undefined;
    return [dimension, { dimension, responses, average, spread } satisfies GroupPreferenceDimensionDiagnosis];
  })) as GroupPreferenceDiagnosis["dimensions"];
  const commonPreferences = planningDimensions.flatMap((dimension) => dimensions[dimension].spread === 0 ? [preferenceDimensionLabels[dimension]] : []);
  const moderateDifferences = planningDimensions.flatMap((dimension) => dimensions[dimension].spread === 1 ? [preferenceDimensionLabels[dimension]] : []);
  const needsCoordination = planningDimensions.flatMap((dimension) => dimensions[dimension].spread === 2 ? [preferenceDimensionLabels[dimension]] : []);
  return {
    tripId: trip.id,
    totalMemberCount: trip.members.length,
    completedMemberCount: completedResults.length,
    dimensions,
    commonPreferences,
    moderateDifferences,
    needsCoordination,
  };
}
