import type { GroupPlanningDimension, GroupPlanningProfile, GroupPreferenceDiagnosis } from "./types";

const planningDimensions: GroupPlanningDimension[] = ["pace", "budget", "mobility", "activity", "mealStyle", "planningStyle"];

export function deriveGroupPlanningProfile(diagnosis?: GroupPreferenceDiagnosis): GroupPlanningProfile {
  const completedMemberCount = diagnosis?.completedMemberCount ?? 0;
  const totalMemberCount = diagnosis?.totalMemberCount ?? 0;
  const dataStatus: GroupPlanningProfile["dataStatus"] = completedMemberCount < 2
    ? "insufficient"
    : completedMemberCount === totalMemberCount
      ? "complete"
      : "partial";
  const includeDimensions = dataStatus !== "insufficient";
  const dimensionProfiles = Object.fromEntries(planningDimensions.map((dimension) => [
    dimension,
    includeDimensions && (diagnosis?.dimensions[dimension].responses.length ?? 0) >= 2
      ? { average: diagnosis?.dimensions[dimension].average, spread: diagnosis?.dimensions[dimension].spread }
      : { average: undefined, spread: undefined },
  ])) as Pick<GroupPlanningProfile, GroupPlanningDimension>;
  return {
    dataStatus,
    completedMemberCount,
    totalMemberCount,
    commonTags: dataStatus === "insufficient" ? [] : [...(diagnosis?.commonPreferredTags ?? [])],
    sharedPreferredTags: dataStatus === "insufficient" ? [] : [...(diagnosis?.sharedPreferredTags ?? [])],
    ...dimensionProfiles,
  };
}
