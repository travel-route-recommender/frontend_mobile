import { validateCandidates, validateSavedPlaces } from "./validateCandidates";
import { validateDuri } from "./validateDuri";
import { validateItinerary } from "./validateItinerary";
import { validateCreateTripDraft, validatePreferences } from "./validatePreferences";
import { validateTrips } from "./validateTrips";
import { validateUsers } from "./validateUsers";
import type { AppStateIntegritySnapshot, StateIntegrityIssue, StateIntegrityReport } from "./types";

export function validateAppState(snapshot: AppStateIntegritySnapshot): StateIntegrityReport {
  const issues: StateIntegrityIssue[] = [
    ...validateUsers(snapshot.domain, snapshot.auth),
    ...validateTrips(snapshot.domain),
    ...validateCandidates(snapshot.domain),
    ...validateSavedPlaces(snapshot.domain),
    ...validateItinerary(snapshot.domain),
    ...validatePreferences(snapshot.domain, snapshot.auth, snapshot.preferenceDraft),
    ...validateCreateTripDraft(snapshot.domain, snapshot.auth, snapshot.createTripDraft),
    ...validateDuri(snapshot.domain, snapshot.duri),
  ];
  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
}

