import { analyzeDensity } from "./densityAnalyzer";
import { analyzeMeals } from "./mealAnalyzer";
import { analyzePreferences } from "./preferenceAnalyzer";
import { analyzeRoute } from "./routeAnalyzer";
import { createOverallMessage } from "./suggestionFactory";
import { deriveGroupPlanningProfile } from "../group-preferences";
import type { AnalysisStatus, DuriAnalysisInput, DuriAnalysisResult } from "./types";

export function analyzeTrip(input: DuriAnalysisInput): DuriAnalysisResult {
  const groupPlanningProfile = deriveGroupPlanningProfile(input.groupPreferenceDiagnosis);
  const enrichedInput = { ...input, groupPlanningProfile };
  const route = analyzeRoute(enrichedInput);
  const density = analyzeDensity(enrichedInput);
  const meal = analyzeMeals(enrichedInput);
  const preference = analyzePreferences(enrichedInput);
  const categories = [route, density, meal, preference];
  const hasHighWarning = categories.some((category) => category.issues.some((issue) => issue.severity === "high"));
  const hasMediumIssue = categories.some((category) => category.issues.some((issue) => issue.severity === "medium"));
  const insufficientCount = categories.filter((category) => category.status === "insufficient-data").length;
  const overallStatus: AnalysisStatus = hasHighWarning
    ? "warning"
    : hasMediumIssue
      ? "attention"
      : insufficientCount > categories.length / 2
        ? "insufficient-data"
        : "good";

  return {
    tripId: input.trip.id,
    overallStatus,
    overallMessage: createOverallMessage(overallStatus, categories),
    analyzedItemCount: input.itinerary.length,
    groupPlanningProfile,
    route,
    density,
    meal,
    preference,
  };
}
