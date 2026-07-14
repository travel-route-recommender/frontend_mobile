import type {
  EntityId,
  ItineraryItem,
  Place,
  TripCandidate,
  TripRoom,
  User,
  UserPreferenceResult,
} from "../../domain";
import type { GroupPlanningProfile, GroupPreferenceDiagnosis } from "../group-preferences";

export type AnalysisStatus = "good" | "attention" | "warning" | "insufficient-data";
export type AnalysisCategory = "route" | "density" | "meal" | "preference";
export type AnalysisSeverity = "info" | "low" | "medium" | "high";

export interface AnalysisEvidence {
  label: string;
  value: string;
  itemIds?: EntityId[];
  placeIds?: EntityId[];
  memberIds?: EntityId[];
}

export interface AnalysisIssue {
  id: string;
  category: AnalysisCategory;
  status: AnalysisStatus;
  severity: AnalysisSeverity;
  title: string;
  summary: string;
  date?: string;
  affectedItemIds: EntityId[];
  affectedPlaceIds: EntityId[];
  affectedMemberIds: EntityId[];
  evidence: AnalysisEvidence[];
}

export interface CategoryAnalysisResult {
  category: AnalysisCategory;
  status: AnalysisStatus;
  score?: number;
  summary: string;
  issues: AnalysisIssue[];
}

export interface DuriAnalysisResult {
  tripId: EntityId;
  overallStatus: AnalysisStatus;
  overallMessage: string;
  analyzedItemCount: number;
  groupPlanningProfile: GroupPlanningProfile;
  route: CategoryAnalysisResult;
  density: CategoryAnalysisResult;
  meal: CategoryAnalysisResult;
  preference: CategoryAnalysisResult;
}

export interface DuriAnalysisInput {
  trip: TripRoom;
  members: User[];
  placesById: Record<EntityId, Place>;
  candidates: TripCandidate[];
  itinerary: ItineraryItem[];
  preferenceResults: Record<EntityId, UserPreferenceResult>;
  groupPreferenceDiagnosis?: GroupPreferenceDiagnosis;
  groupPlanningProfile?: GroupPlanningProfile;
}
