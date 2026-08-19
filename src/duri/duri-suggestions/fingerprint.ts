import type { ItineraryItem } from "../../domain";
import type { DuriSuggestionType, ScheduleChangePreview } from "./types";

export function buildItineraryFingerprint(itinerary: ItineraryItem[]) {
  return [...itinerary]
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.startTime.localeCompare(right.startTime) ||
      left.id.localeCompare(right.id),
    )
    .map((item) =>
      [
        item.id,
        item.date,
        item.startTime,
        item.durationMinutes,
        item.placeId ?? "",
        item.itemType,
        [...item.preferredByUserIds].sort().join(","),
        JSON.stringify(item.note ?? null),
        item.lockedForDuri ? "locked" : "unlocked",
      ].join("|"),
    )
    .join(";");
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function generateSuggestionId({
  tripId,
  type,
  sourceIssueIds,
  changes,
  itineraryFingerprint,
}: {
  tripId: string;
  type: DuriSuggestionType;
  sourceIssueIds: string[];
  changes: ScheduleChangePreview[];
  itineraryFingerprint: string;
}) {
  const changeKey = changes.map((change) => JSON.stringify(change)).join("|");
  const stableInput = [tripId, type, [...sourceIssueIds].sort().join(","), itineraryFingerprint, changeKey].join("::");
  return `duri-${type}-${stableHash(stableInput)}`;
}
