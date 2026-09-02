import type { EntityId } from "../../domain";
import type { WorkspaceMutationPermissions } from "./logic/workspaceCapabilities";

export type CandidateBoardFilter = "all" | "common" | "mine" | "companion";
export type CandidateScheduleState =
  | "unscheduled"
  | "scheduled-on-selected-date"
  | "scheduled-on-other-date";
export type ItineraryMoveDirection = "up" | "down";
export type TripDayMoveDirection = "previous" | "next";

export interface WorkspaceDate {
  date: string;
  dayIndex: number;
  dayLabel: string;
  monthDayLabel: string;
  weekdayLabel: string;
  itineraryCount: number;
}

export interface WorkspaceViewModel {
  tripId: EntityId;
  title: string;
  startDate: string;
  endDate: string;
  regionName: string;
  dates: WorkspaceDate[];
  selectedDate: string;
  candidateCount: number;
  unscheduledCandidateCount: number;
  scheduledCandidateCount: number;
  itineraryCount: number;
  memberCount: number;
  permissions: WorkspaceMutationPermissions;
  canEdit: boolean;
  readOnlyReason?: string;
}

export interface CandidatePlaceViewModel {
  tripId: EntityId;
  placeId: EntityId;
  name: string;
  imageUrl?: string;
  categoryLabel: string;
  address: string;
  tags: string[];
  addedByUserIds: EntityId[];
  addedByNames: string[];
  addedByCount: number;
  recommendedByDuri: boolean;
  scheduleState: CandidateScheduleState;
  scheduledCount: number;
  scheduledDates: string[];
  scheduledPlacements: {
    itemId: EntityId;
    date: string;
    dayLabel: string;
    startTime: string;
    endTime: string;
  }[];
  placeMissing: boolean;
}

export interface ItineraryItemViewModel {
  id: EntityId;
  tripId: EntityId;
  placeId?: EntityId;
  placeName: string;
  imageUrl?: string;
  date: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  note?: string;
  lockedForDuri: boolean;
  categoryLabel: string;
  preferredByNames: string[];
  conflictItemIds: EntityId[];
  hasTimeConflict: boolean;
  placeMissing: boolean;
}

export type WorkspaceFeedback = {
  message: string;
  targetDate?: string;
};
