import type { EntityId, ItineraryItem, Place } from "../../domain";
import { sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../utils/schedule";
import type { AnalysisIssue, AnalysisStatus, CategoryAnalysisResult } from "./types";

export function groupItineraryByDate(items: ItineraryItem[]) {
  const grouped = new Map<string, ItineraryItem[]>();
  for (const item of sortItineraryItemsByDateAndTime(items)) {
    grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
  }
  return grouped;
}

export function getItemEndMinutes(item: Pick<ItineraryItem, "startTime" | "durationMinutes">) {
  return timeStringToMinutes(item.startTime) + item.durationMinutes;
}

export function getValidPlaceEntries(items: ItineraryItem[], placesById: Record<EntityId, Place>) {
  return items.flatMap((item) => {
    const place = item.placeId ? placesById[item.placeId] : undefined;
    return place ? [{ item, place }] : [];
  });
}

export function categoryStatusFromIssues(issues: AnalysisIssue[]): AnalysisStatus {
  if (issues.some((issue) => issue.severity === "high")) return "warning";
  if (issues.some((issue) => issue.severity === "medium" || issue.severity === "low")) return "attention";
  return "good";
}

export function insufficientCategory(category: CategoryAnalysisResult["category"], summary: string): CategoryAnalysisResult {
  return { category, status: "insufficient-data", summary, issues: [] };
}

export function normalizeTrait(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
}
