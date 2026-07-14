import type {
  EntityId,
  ItineraryItem,
  ItineraryItemType,
} from "../../domain";
import type { DuriAnalysisInput, DuriAnalysisResult } from "../duri-analysis";

export type DuriSuggestionType =
  | "reorder-route"
  | "move-item"
  | "insert-rest"
  | "insert-meal"
  | "add-preference-place"
  | "remove-overload-item"
  | "replace-place";

export type SuggestionPriority = "low" | "medium" | "high";

export type ScheduleChangeAction = "add" | "remove" | "move" | "resize" | "replace";

export type SuggestionPreviewStatus =
  | "ready"
  | "conflict"
  | "invalid"
  | "not-applicable";

export type SuggestionApplyStatus =
  | "applied"
  | "stale"
  | "conflict"
  | "invalid"
  | "trip-not-editable"
  | "not-authorized";

export interface SuggestionApplyResult {
  status: SuggestionApplyStatus;
  changedItemIds: EntityId[];
  affectedDate?: string;
  message?: string;
}

export type ScheduleChangeSnapshot = {
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  placeId?: EntityId;
  itemType?: ItineraryItemType;
  preferredByUserIds?: EntityId[];
  note?: string;
};

export type ScheduleChangeState = ScheduleChangeSnapshot;

export interface ScheduleChangePreview {
  itemId?: EntityId;
  placeId?: EntityId;
  action: ScheduleChangeAction;
  before?: ScheduleChangeSnapshot;
  after?: ScheduleChangeSnapshot;
}

export interface DuriSuggestion {
  id: string;
  tripId: EntityId;
  sourceIssueIds: string[];
  type: DuriSuggestionType;
  priority: SuggestionPriority;
  title: string;
  summary: string;
  reason: string;
  affectedItemIds: EntityId[];
  affectedPlaceIds: EntityId[];
  changes: ScheduleChangePreview[];
  canApply: boolean;
  unavailableReason?: string;
  itineraryFingerprint: string;
}

export type DuriSuggestionInput = DuriAnalysisInput & {
  analysis: DuriAnalysisResult;
};

export type SuggestionChangeContext = {
  tripId: EntityId;
  tripDates: string[];
  placesById: DuriAnalysisInput["placesById"];
  candidates: DuriAnalysisInput["candidates"];
};

export type SuggestionChangeResult =
  | { success: true; itinerary: ItineraryItem[]; changedItemIds: EntityId[]; affectedDate?: string }
  | { success: false; status: Exclude<SuggestionPreviewStatus, "ready">; changedItemIds: []; reason: string };

export type SuggestionPreviewResult =
  | { success: true; previewItinerary: ItineraryItem[]; changedItemIds: EntityId[]; affectedDate?: string }
  | { success: false; reason: string };
