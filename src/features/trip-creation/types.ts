import type { EntityId, TripBudgetLevel, TripIntensity, TripTransport } from "../../domain";

export const CREATE_TRIP_DRAFT_VERSION = 1;
export const CREATE_TRIP_STEP_COUNT = 5;

export type CreateTripStep = 0 | 1 | 2 | 3 | 4;

export interface CreateTripDraft {
  configVersion: typeof CREATE_TRIP_DRAFT_VERSION;
  ownerUserId: EntityId;
  currentStep: CreateTripStep;
  regionId: EntityId;
  startDate: string;
  endDate: string;
  transport: TripTransport;
  budgetLevel: TripBudgetLevel;
  intensity: TripIntensity;
  selectedMemberUserIds: EntityId[];
  title: string;
  startedAt: string;
  updatedAt: string;
}

export type CreateTripDraftPatch = Partial<Omit<CreateTripDraft, "configVersion" | "ownerUserId" | "startedAt" | "updatedAt">>;

