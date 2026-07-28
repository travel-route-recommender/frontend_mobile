import type { EntityId } from "../../domain";

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
  scheduledDates: string[];
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
