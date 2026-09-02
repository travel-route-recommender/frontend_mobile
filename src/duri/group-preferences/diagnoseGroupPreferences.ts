import type { TripRoom, UserPreferenceResult } from "../../domain";
import { preferenceDimensionLabels } from "../preferences";
import { calculateGroupMatchRate } from "./calculateGroupMatchRate";
import { diagnosePreferenceDimension } from "./diagnosePreferenceDimension";
import { normalizePreferenceResult } from "./normalizePreferenceResult";
import { summarizeGroupPreferredTags } from "./summarizeGroupPreferredTags";
import type {
  GroupPlanningDimension,
  GroupPreferenceDiagnosis,
} from "./types";

const planningDimensions: GroupPlanningDimension[] = ["pace", "budget", "mobility", "activity", "mealStyle", "planningStyle"];

export function diagnoseGroupPreferences(
  trip: TripRoom,
  preferenceResults: Readonly<Record<string, UserPreferenceResult | unknown>>,
): GroupPreferenceDiagnosis {
  const memberIds = [...new Set(trip.members.map((member) => member.userId))];
  const completedResults = memberIds.flatMap((userId) => {
    const result = preferenceResults[userId];
    const normalized = normalizePreferenceResult(result, userId);
    return normalized ? [{ userId, result: normalized }] : [];
  });
  const completedMemberIds = completedResults.map(({ userId }) => userId);
  const completedSet = new Set(completedMemberIds);
  const pendingMemberIds = memberIds.filter((userId) => preferenceResults[userId] === undefined);
  const invalidMemberIds = memberIds.filter((userId) => preferenceResults[userId] !== undefined && !completedSet.has(userId));
  const dimensions = Object.fromEntries(planningDimensions.map((dimension) => {
    const responses = completedResults.flatMap(({ userId, result }) => (
      result.observedDimensions.includes(dimension) ? [{ userId, score: result.values[dimension] }] : []
    ));
    return [dimension, diagnosePreferenceDimension(dimension, responses)];
  })) as GroupPreferenceDiagnosis["dimensions"];
  const completedMemberCount = completedMemberIds.length;
  const totalMemberCount = memberIds.length;
  const coverage: GroupPreferenceDiagnosis["coverage"] = completedMemberCount < 2
    ? "insufficient"
    : completedMemberCount === totalMemberCount
      ? "complete"
      : "partial";
  const visibleDimensions = coverage === "insufficient" ? [] : planningDimensions;
  const commonPreferences = visibleDimensions.flatMap((dimension) => dimensions[dimension].status === "common" ? [preferenceDimensionLabels[dimension]] : []);
  const moderateDifferences = visibleDimensions.flatMap((dimension) => dimensions[dimension].status === "compatible" ? [preferenceDimensionLabels[dimension]] : []);
  const needsCoordination = visibleDimensions.flatMap((dimension) => dimensions[dimension].status === "needs-tuning" ? [preferenceDimensionLabels[dimension]] : []);
  const memberPreferredTags = Object.fromEntries(completedResults.map(({ userId, result }) => [userId, [...result.preferredTags]]));
  const preferredTags = summarizeGroupPreferredTags(memberPreferredTags);
  return {
    tripId: trip.id,
    totalMemberCount,
    completedMemberCount,
    completionRate: totalMemberCount ? completedMemberCount / totalMemberCount : 0,
    coverage,
    completedMemberIds,
    pendingMemberIds,
    invalidMemberIds,
    dimensions,
    commonPreferences,
    moderateDifferences,
    needsCoordination,
    matchRate: calculateGroupMatchRate(planningDimensions.map((dimension) => dimensions[dimension]), completedMemberCount),
    preferredTags,
    commonPreferredTags: preferredTags.filter((tag) => tag.isCommonToAllRespondents).map((tag) => tag.tag),
    sharedPreferredTags: preferredTags.filter((tag) => tag.count >= 2).map((tag) => tag.tag),
    memberPreferredTags,
  };
}
