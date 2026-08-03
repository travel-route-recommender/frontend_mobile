export type CompatibilityCategoryId = "schedule" | "accommodation" | "challenge" | "stamina" | "budget" | "discovery";

export type CompatibilityCategoryScore = {
  id: CompatibilityCategoryId;
  label: string;
  score: number;
  description: string;
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
  categories: CompatibilityCategoryScore[];
  algorithmVersion: number;
  calculatedAt: string;
};
