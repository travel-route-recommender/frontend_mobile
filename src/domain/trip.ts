import type { EntityId, ISODateString } from "./user";

export type TripStatus = "planning" | "drafting" | "confirmed" | "completed";
export type TripMemberRole = "owner" | "member";
export type TripTransport = "public" | "car" | "walking";
export type TripBudgetLevel = "budget" | "standard" | "premium";
export type TripIntensity = "relaxed" | "balanced" | "packed";

export type TripMember = {
  userId: EntityId;
  role: TripMemberRole;
};

export type TripRoom = {
  id: EntityId;
  title: string;
  regionId: EntityId;
  startDate: ISODateString | null;
  endDate: ISODateString | null;
  dateUndecided?: boolean;
  status: TripStatus;
  transport: TripTransport;
  budgetLevel: TripBudgetLevel;
  intensity: TripIntensity;
  travelStyles?: string[];
  companionType?: string | null;
  expectedMemberCount?: number | null;
  members: TripMember[];
};

export type TripCandidate = {
  tripId: EntityId;
  placeId: EntityId;
  addedByUserIds: EntityId[];
  recommendedByDuri: boolean;
  addedAt?: ISODateString;
};
