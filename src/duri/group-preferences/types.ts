import type { EntityId, PreferenceDimension, PreferenceScore } from "../../domain";

export type GroupPlanningDimension = "pace" | "mobility" | "activity" | "mealStyle" | "planningStyle";

export interface GroupPreferenceDimensionDiagnosis {
  dimension: PreferenceDimension;
  responses: { userId: EntityId; score: PreferenceScore }[];
  average?: number;
  spread?: number;
}

export interface GroupPreferenceDiagnosis {
  tripId: EntityId;
  totalMemberCount: number;
  completedMemberCount: number;
  dimensions: Record<GroupPlanningDimension, GroupPreferenceDimensionDiagnosis>;
  commonPreferences: string[];
  moderateDifferences: string[];
  needsCoordination: string[];
}

export interface GroupPlanningDimensionProfile {
  average?: number;
  spread?: number;
}

export interface GroupPlanningProfile {
  dataStatus: "complete" | "partial" | "insufficient";
  completedMemberCount: number;
  totalMemberCount: number;
  pace: GroupPlanningDimensionProfile;
  mobility: GroupPlanningDimensionProfile;
  activity: GroupPlanningDimensionProfile;
  mealStyle: GroupPlanningDimensionProfile;
  planningStyle: GroupPlanningDimensionProfile;
}
