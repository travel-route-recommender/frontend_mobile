import type { EntityId, TripEndConditionType, TripLocation, TripTransport } from "../../domain";

export const CREATE_TRIP_DRAFT_VERSION = 4;
export const CREATE_TRIP_STEP_COUNT = 5;

export type CreateTripStep = 0 | 1 | 2 | 3 | 4;
export type TripCreationScreenMode = "create" | "edit";
export type TripCompanionType = "friends" | "family" | "couple" | "group" | "undecided";

export interface CreateTripEndConditionDraft {
  type: TripEndConditionType;
  location: string;
  locationDetails?: TripLocation | null;
  deadline: string;
  travelMinutes: string;
  serviceBufferMinutes: string;
  note: string;
}

export interface CreateTripDraft {
  configVersion: typeof CREATE_TRIP_DRAFT_VERSION;
  ownerUserId: EntityId;
  currentStep: CreateTripStep;
  regionId: EntityId;
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  transport: TripTransport | null;
  accommodationLocation: string;
  accommodationLocationDetails?: TripLocation | null;
  endCondition: CreateTripEndConditionDraft | null;
  companionType: TripCompanionType | null;
  expectedMemberCount: number | null;
  selectedMemberUserIds: EntityId[];
  roomName: string;
  isRoomNameCustomized: boolean;
  startedAt: string;
  updatedAt: string;
}

export type CreateTripDraftPatch = Partial<Omit<CreateTripDraft, "configVersion" | "ownerUserId" | "startedAt" | "updatedAt">>;
