import type { DuriDomainState } from "../../data/mock/demoData";
import type { DuriAnalysisSession, DuriSuggestionApplyReceipt, DuriSuggestionEnvelope } from "../../features/duri/types";
import type { PersonalPreferenceDraft } from "../../features/preferences/types";
import type { CreateTripDraft } from "../../features/trip-creation/types";
import type { SessionKind } from "../../features/auth/types";

export type StateIntegritySeverity = "warning" | "error";

export interface StateIntegrityIssue {
  code: string;
  severity: StateIntegritySeverity;
  entityType: string;
  entityId?: string;
  message: string;
}

export interface StateIntegrityReport {
  valid: boolean;
  errors: StateIntegrityIssue[];
  warnings: StateIntegrityIssue[];
}

export interface AuthIntegrityState {
  sessionKind: SessionKind | null;
  currentSessionUserId: string | null;
  preferenceTestCompleted: boolean;
}

export interface DuriIntegrityState {
  sessionsByTripId: Readonly<Record<string, DuriAnalysisSession | undefined>>;
  suggestionsByTripId: Readonly<Record<string, readonly DuriSuggestionEnvelope[] | undefined>>;
  receiptsBySuggestionId: Readonly<Record<string, DuriSuggestionApplyReceipt | undefined>>;
}

export interface AppStateIntegritySnapshot {
  domain: DuriDomainState;
  auth: AuthIntegrityState;
  preferenceDraft?: PersonalPreferenceDraft | null;
  createTripDraft?: CreateTripDraft | null;
  duri?: DuriIntegrityState;
}

export function issue(
  severity: StateIntegritySeverity,
  code: string,
  entityType: string,
  message: string,
  entityId?: string,
): StateIntegrityIssue {
  return { code, severity, entityType, message, ...(entityId ? { entityId } : {}) };
}

