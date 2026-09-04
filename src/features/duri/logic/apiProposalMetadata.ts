import type { Place } from "../../../domain";
import {
  createWorkspaceScheduleItemMetadataFromPlace,
  type WorkspaceScheduleItemMetadata,
  type WorkspaceScheduleSnapshot,
} from "../../workspace/services/workspaceScheduleContract";
import type { ItinerarySnapshotItem } from "../types";

/**
 * Builds the Backend sidecar for the exact itinerary shown in the DURI preview.
 * Existing item metadata is preserved losslessly; newly generated items may only
 * reference places that already exist in the current server room snapshot.
 */
export function buildApiProposalMetadata(
  snapshot: WorkspaceScheduleSnapshot,
  nextItinerary: readonly ItinerarySnapshotItem[],
  placesById: Readonly<Record<string, Place | undefined>>,
): Record<string, WorkspaceScheduleItemMetadata> {
  const beforeById = new Map(snapshot.itinerary.map((item) => [item.id, item]));
  return Object.fromEntries(nextItinerary.map((item): [string, WorkspaceScheduleItemMetadata] => {
    const previous = beforeById.get(item.id);
    const metadata = snapshot.metadataByItemId[item.id];
    if (previous && metadata) {
      if (previous.placeId !== item.placeId) {
        throw new Error("같은 일정 ID에서 장소를 바꾸는 제안은 예약·티켓 오연결을 막기 위해 적용하지 않아요.");
      }
      return [item.id, {
        ...metadata,
        reason: item.note === undefined ? metadata.reason : item.note.trim(),
        tags: [...metadata.tags],
        tickets: metadata.tickets.map((ticket) => ({ ...ticket })),
        ...(metadata.reservation ? {
          reservation: {
            ...metadata.reservation,
            documentTicketIds: [...metadata.reservation.documentTicketIds],
          },
        } : {}),
      }];
    }
    if (!item.placeId) throw new Error("새로 추가할 일정의 장소 정보를 확인하지 못했어요.");
    const place = placesById[item.placeId];
    if (!place) throw new Error("새로 추가할 장소 정보를 찾지 못했어요.");
    return [item.id, createWorkspaceScheduleItemMetadataFromPlace({
      itemId: item.id,
      place,
      reason: item.note,
      priority: "optional",
    })];
  }));
}
