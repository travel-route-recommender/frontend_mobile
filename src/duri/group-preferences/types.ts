import type {
  EntityId,
  PersonalPreferenceAnswers,
  PreferenceDimension,
  PreferenceScore,
} from "../../domain";

export type GroupPlanningDimension = "pace" | "budget" | "mobility" | "activity" | "mealStyle" | "planningStyle";
export type DiagnosisCoverage = "complete" | "partial" | "insufficient";
export type GroupDimensionStatus = "common" | "compatible" | "needs-tuning";

export interface NormalizedPreferenceVector {
  userId: EntityId;
  values: PersonalPreferenceAnswers;
  /** 실제로 직접 관측되었거나 같은 문항 의미로 복원 가능한 축만 포함한다. */
  observedDimensions: PreferenceDimension[];
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
  median?: number;
  variance?: number;
  standardDeviation?: number;
  meanAbsoluteDeviation?: number;
  pairwiseAgreement?: number;
  pairwiseComparisonCount?: number;
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
  budget: GroupPlanningDimensionProfile;
  mobility: GroupPlanningDimensionProfile;
  activity: GroupPlanningDimensionProfile;
  mealStyle: GroupPlanningDimensionProfile;
  planningStyle: GroupPlanningDimensionProfile;
}
