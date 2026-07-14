import type {
  EntityId,
  PersonalPreferenceAnswers,
  PreferenceDimension,
  PreferenceScore,
} from "../../domain";

export type GroupPlanningDimension = "pace" | "mobility" | "activity" | "mealStyle" | "planningStyle";
export type DiagnosisCoverage = "complete" | "partial" | "insufficient";
export type GroupDimensionStatus = "common" | "compatible" | "needs-tuning";

export interface NormalizedPreferenceVector {
  userId: EntityId;
  values: PersonalPreferenceAnswers;
  preferredTags: string[];
  profileType?: string;
}

export interface GroupPreferenceDimensionDiagnosis {
  dimension: PreferenceDimension;
  responses: { userId: EntityId; score: PreferenceScore }[];
  status?: GroupDimensionStatus;
  min?: number;
  max?: number;
  average?: number;
  spread?: number;
}

export interface GroupPreferredTagSummary {
  tag: string;
  count: number;
  memberIds: EntityId[];
  ratio: number;
  isCommonToAllRespondents: boolean;
}

export interface GroupPreferenceDiagnosis {
  tripId: EntityId;
  totalMemberCount: number;
  completedMemberCount: number;
  completionRate: number;
  coverage: DiagnosisCoverage;
  completedMemberIds: EntityId[];
  pendingMemberIds: EntityId[];
  invalidMemberIds: EntityId[];
  dimensions: Record<GroupPlanningDimension, GroupPreferenceDimensionDiagnosis>;
  commonPreferences: string[];
  moderateDifferences: string[];
  needsCoordination: string[];
  matchRate?: number;
  preferredTags: GroupPreferredTagSummary[];
  commonPreferredTags: string[];
  sharedPreferredTags: string[];
  memberPreferredTags: Record<EntityId, string[]>;
}

export interface GroupPlanningDimensionProfile {
  average?: number;
  spread?: number;
}

export interface GroupPlanningProfile {
  dataStatus: DiagnosisCoverage;
  completedMemberCount: number;
  totalMemberCount: number;
  commonTags: string[];
  sharedPreferredTags: string[];
  pace: GroupPlanningDimensionProfile;
  mobility: GroupPlanningDimensionProfile;
  activity: GroupPlanningDimensionProfile;
  mealStyle: GroupPlanningDimensionProfile;
  planningStyle: GroupPlanningDimensionProfile;
}
