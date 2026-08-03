import { useMemo } from "react";
import { getMockTravelPreferenceResult } from "../config/mock-travel-preference-results";
import { calculateTravelPreferenceSurveyResult } from "../logic/calculate-travel-preference-result";
import { isSameDraftOwner, usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";
import type { PreferenceDraftOwner } from "../types";

export function useTravelPreferenceSurveyResult(owner: PreferenceDraftOwner | null) {
  const completedSurvey = usePersonalPreferenceDraftStore((state) => state.completedSurvey);
  const ownerKind = owner?.kind ?? null;
  const ownerUserId = owner?.kind === "user" ? owner.userId : null;

  return useMemo(() => {
    if (!ownerKind) return null;
    const resolvedOwner: PreferenceDraftOwner = ownerKind === "user" && ownerUserId
      ? { kind: "user", userId: ownerUserId }
      : { kind: "anonymous" };
    if (completedSurvey && isSameDraftOwner(resolvedOwner, completedSurvey.owner)) {
      const userId = resolvedOwner.kind === "user" ? resolvedOwner.userId : "anonymous-preview";
      return calculateTravelPreferenceSurveyResult(userId, completedSurvey.answers, completedSurvey.completedAt);
    }
    return resolvedOwner.kind === "user" ? getMockTravelPreferenceResult(resolvedOwner.userId) : null;
  }, [completedSurvey, ownerKind, ownerUserId]);
}
