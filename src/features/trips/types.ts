import type { EntityId, TripStatus } from "../../domain";

export type TripListFilter = "ongoing" | "completed" | "all";
export type TripPreparationStepStatus = "completed" | "active" | "pending";
export type TripPreparationStepId = "room" | "preferences" | "candidates" | "itinerary" | "confirmation";

export interface TripPreparationStep {
  id: TripPreparationStepId;
  label: string;
  description: string;
  status: TripPreparationStepStatus;
  actionLabel?: string;
}

export interface TripPreparationProgress {
  completedSteps: number;
  activeSteps: number;
  totalSteps: number;
  rate: number;
  steps: TripPreparationStep[];
}

export interface TripRoomCardMemberView {
  userId: EntityId;
  name: string;
  initial: string;
  profileImageUrl?: string;
}

export interface TripRoomCardViewModel {
  id: EntityId;
  title: string;
  destinationName: string;
  imageUrl?: string;
  dateLabel: string;
  status: TripStatus;
  statusLabel: string;
  timingLabel?: string;
  members: TripRoomCardMemberView[];
  memberCount: number;
  candidateCount: number;
  itineraryCount: number;
  preferenceCompletedCount: number;
  preferenceTotalCount: number;
  preparation: TripPreparationProgress;
  isOwner: boolean;
}
