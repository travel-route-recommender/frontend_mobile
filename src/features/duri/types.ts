import type { EntityId, ItineraryItem, Place, TripCandidate, TripRoom, User, UserPreferenceResult } from "../../domain";
import type { AnalysisEvidence, AnalysisSeverity, AnalysisStatus, DuriAnalysisInput, DuriAnalysisResult } from "../../duri/duri-analysis";
import type { DuriSuggestion } from "../../duri/duri-suggestions";
import type { DiagnosisCoverage, GroupPlanningProfile, GroupPreferenceDiagnosis } from "../../duri/group-preferences";

export type DuriAnalysisAvailabilityStatus =
  | "available"
  | "limited"
  | "no-itinerary"
  | "invalid-trip-dates"
  | "invalid-itinerary"
  | "engine-unavailable";

export interface DuriAnalysisAvailability {
  status: DuriAnalysisAvailabilityStatus;
  canAnalyze: boolean;
  readOnly: boolean;
  message: string;
}

export type DuriRouteCoverage = "unavailable" | "partial" | "available";

export interface DuriAnalysisCoverage {
  itinerary: "insufficient" | "partial" | "complete";
  preferences: DiagnosisCoverage;
  routeData: DuriRouteCoverage;
  routeMessage: string;
}

export interface DuriAnalysisSnapshot extends DuriAnalysisInput {
  groupPreferenceDiagnosis: GroupPreferenceDiagnosis;
  groupPlanningProfile: GroupPlanningProfile;
}

export type DuriReportIssueCategory =
  | "route"
  | "density"
  | "meal"
  | "preference"
  | "time-conflict"
  | "day-balance"
  | "candidate-usage";

export interface DuriReportIssue {
  id: string;
  category: DuriReportIssueCategory;
  severity: AnalysisSeverity;
  title: string;
  summary: string;
  date?: string;
  affectedItemIds: EntityId[];
  affectedPlaceIds: EntityId[];
  affectedMemberIds: EntityId[];
  evidence: AnalysisEvidence[];
  suggestionSupported: boolean;
  source: "web-engine" | "mobile-context";
}

export interface DuriDayMetric {
  date: string;
  itemCount: number;
  scheduledMinutes: number;
  conflictCount: number;
  longGapMinutes: number;
}

export interface DuriCandidateUsage {
  candidateCount: number;
  scheduledCandidateCount: number;
  unscheduledCandidateCount: number;
  unscheduledSharedCandidateIds: EntityId[];
}

export interface DuriGroupInsight {
  id: string;
  kind: "coverage" | "common" | "difference" | "coordination";
  title: string;
  description: string;
}

export interface DuriAnalysisSession {
  tripId: EntityId;
  inputFingerprint: string;
  algorithmVersion: string;
  analyzedAt: string;
  snapshot: DuriAnalysisSnapshot;
  result: DuriAnalysisResult;
  overallStatus: AnalysisStatus;
  overallMessage: string;
  coverage: DuriAnalysisCoverage;
  issues: DuriReportIssue[];
  dayMetrics: DuriDayMetric[];
  candidateUsage: DuriCandidateUsage;
  groupInsights: DuriGroupInsight[];
}

export interface DuriSuggestionEnvelope {
  suggestion: DuriSuggestion;
  baseFingerprint: string;
  algorithmVersion: string;
  createdAt: string;
  beforeItinerary: ItineraryItem[];
}

export type ScheduleDiffKind = "added" | "removed" | "moved" | "time-changed" | "reordered" | "unchanged";

export interface ItinerarySnapshotItem extends ItineraryItem {
  order: number;
}

export interface ScheduleDiffItem {
  kind: ScheduleDiffKind;
  itemId: EntityId;
  placeId?: EntityId;
  placeName: string;
  before?: ItinerarySnapshotItem;
  after?: ItinerarySnapshotItem;
}

export interface DuriExpectedImpactMetric {
  id: string;
  label: string;
  before: number;
  after: number;
  unit: string;
}

export interface DuriExpectedImpact {
  metrics: DuriExpectedImpactMetric[];
}

export interface DuriSuggestionPreview {
  suggestionId: EntityId;
  tripId: EntityId;
  baseFingerprint: string;
  before: ItinerarySnapshotItem[];
  after: ItinerarySnapshotItem[];
  diff: ScheduleDiffItem[];
  affectedDates: string[];
  impact: DuriExpectedImpact;
  validation: { valid: true } | { valid: false; message: string };
}

export interface DuriSuggestionApplyReceipt {
  suggestionId: EntityId;
  tripId: EntityId;
  appliedByUserId: EntityId;
  appliedAt: string;
  beforeFingerprint: string;
  afterFingerprint: string;
  changedItemIds: EntityId[];
  affectedDates: string[];
}

export type DuriApplyFailureReason =
  | "stale"
  | "permission-denied"
  | "trip-not-editable"
  | "invalid-change"
  | "missing-item"
  | "invalid-time"
  | "unsupported-version"
  | "unknown";

export type ApplyDuriSuggestionAtomicallyResult =
  | { ok: true; receipt: DuriSuggestionApplyReceipt }
  | { ok: false; reason: DuriApplyFailureReason; message: string };

export interface ApplyDuriSuggestionAtomicallyInput {
  tripId: EntityId;
  envelope: DuriSuggestionEnvelope;
  expectedFingerprint: string;
  appliedByUserId: EntityId;
}

export type DuriInputSource = {
  currentUserId: EntityId;
  usersById: Record<EntityId, User>;
  placesById: Record<EntityId, Place>;
  tripsById: Record<EntityId, TripRoom>;
  candidatesByTripId: Record<EntityId, TripCandidate[]>;
  itineraryByTripId: Record<EntityId, ItineraryItem[]>;
  preferenceResultsByUserId: Record<EntityId, UserPreferenceResult>;
};
