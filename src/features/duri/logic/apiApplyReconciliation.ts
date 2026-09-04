import type { ItineraryItem } from "../../../domain";
import {
  applyWorkspaceScheduleLocalOverlays,
  mapWorkspaceScheduleToBatch,
  type WorkspaceScheduleItemMetadata,
  type WorkspaceScheduleSnapshot,
} from "../../workspace/services/workspaceScheduleContract";

type ProposalPostState = {
  itinerary: readonly ItineraryItem[];
  metadataByItemId: Readonly<Record<string, WorkspaceScheduleItemMetadata | undefined>>;
};

function lockedItemIds(itinerary: readonly ItineraryItem[]) {
  return new Set(itinerary.filter((item) => item.lockedForDuri).map((item) => item.id));
}

function comparableDays(input: ProposalPostState, snapshot: WorkspaceScheduleSnapshot) {
  const days = mapWorkspaceScheduleToBatch({
    itinerary: input.itinerary,
    metadataByItemId: input.metadataByItemId,
    tripId: snapshot.scope.tripId,
    startDate: snapshot.scope.startDate,
    endDate: snapshot.scope.endDate,
    expectedVersion: 0,
    userLockedItemIds: lockedItemIds(input.itinerary),
  }).days;
  return days
    .map((day) => ({
      day: day.day,
      items: day.items
        .map((item) => ({ ...item, tags: [...item.tags].sort((left, right) => left.localeCompare(right)) }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.day - right.day);
}

/**
 * Compares only the schedule fields persisted by `POST /schedule/apply`.
 * Version and request IDs are deliberately excluded: a lost response can still
 * leave the server in the exact requested post-state with a newer version.
 */
export function apiScheduleMatchesProposal(
  snapshot: WorkspaceScheduleSnapshot,
  proposal: ProposalPostState,
) {
  try {
    const expected = comparableDays(proposal, snapshot);
    const actual = comparableDays({
      itinerary: snapshot.itinerary,
      metadataByItemId: snapshot.metadataByItemId,
    }, snapshot);
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/**
 * A reconciliation refetch is authoritative for shared fields, but it cannot
 * recreate device-only item type/preference overlays when the apply response
 * was lost. Reattach only those fields from the reviewed proposal.
 */
export function restoreProposalLocalOverlays(
  snapshot: WorkspaceScheduleSnapshot,
  proposalItinerary: readonly ItineraryItem[],
) {
  return applyWorkspaceScheduleLocalOverlays(snapshot, Object.fromEntries(
    proposalItinerary.map((item) => [item.id, {
      itemType: item.itemType,
      preferredByUserIds: [...item.preferredByUserIds],
      ...(item.note ? { note: item.note } : {}),
      ...(item.lockedForDuri ? { lockedForDuri: true } : {}),
    }]),
  ));
}
