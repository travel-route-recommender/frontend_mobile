export type CompatibilityCategoryId = "schedule" | "accommodation" | "challenge" | "stamina" | "budget" | "discovery";

export type CompatibilityCategoryStatus = "ALIGNED" | "COMPLEMENTARY" | "ADJUSTABLE" | "NEEDS_COORDINATION";

export type CompatibilityCategoryScore = {
  id: CompatibilityCategoryId;
  label: string;
  score: number;
  status: CompatibilityCategoryStatus;
  statusLabel: string;
  description: string;
};

export type CompatibilityDynamicsId = "ALIGNED" | "COMPLEMENTARY" | "ADJUSTABLE" | "NEEDS_COORDINATION";

export type CompatibilityDynamics = {
  id: CompatibilityDynamicsId;
  label: string;
  description: string;
  synergyCategoryIds: CompatibilityCategoryId[];
  coordinationCategoryIds: CompatibilityCategoryId[];
};

export type CompatibilityTypeId = "NEEDS_COORDINATION" | "ENJOY_DIFFERENCES" | "BALANCED_MATCH" | "GOOD_MATCH" | "PERFECT_MATCH";

export type CompatibilityType = {
  id: CompatibilityTypeId;
  label: string;
  description: string;
};

export type FriendCompatibilityResult = {
  id: string;
  requesterUserId: string;
  friendUserIds: string[];
  score: number;
  type: CompatibilityType;
  dynamics: CompatibilityDynamics;
  categories: CompatibilityCategoryScore[];
  algorithmVersion: number;
  calculatedAt: string;
};
