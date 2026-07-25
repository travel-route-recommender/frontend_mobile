import type { EntityId, TripBudgetLevel, TripIntensity, TripTransport } from "../../domain";

export const CREATE_TRIP_DRAFT_VERSION = 2;
export const CREATE_TRIP_STEP_COUNT = 5;

export type CreateTripStep = 0 | 1 | 2 | 3 | 4;
export type TripCreationScreenMode = "create" | "edit";
export type TripCompanionType = "friends" | "family" | "couple" | "group" | "undecided";

export interface CreateTripDraft {
  configVersion: typeof CREATE_TRIP_DRAFT_VERSION;
  ownerUserId: EntityId;
  currentStep: CreateTripStep;
  regionId: EntityId;
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  transport: TripTransport;
  budgetLevel: TripBudgetLevel;
  intensity: TripIntensity;
  companionType: TripCompanionType | null;
  expectedMemberCount: number | null;
  selectedMemberUserIds: EntityId[];
  roomName: string;
  isRoomNameCustomized: boolean;
  startedAt: string;
  updatedAt: string;
}

export type CreateTripDraftPatch = Partial<Omit<CreateTripDraft, "configVersion" | "ownerUserId" | "startedAt" | "updatedAt">>;
