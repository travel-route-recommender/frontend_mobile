import type { ItineraryItem } from "../../../domain";
import type { TravelDocument } from "../../trip-documents/types";
import type {
  BackendScheduleReservation,
  BackendScheduleTicket,
  WorkspaceScheduleItemMetadata,
  WorkspaceScheduleSnapshot,
} from "../services/workspaceScheduleContract";
import type { ApiWorkspaceScheduleDraft } from "./apiWorkspaceScheduleState";

export type ApiWorkspaceScheduleImpactChange = "delete" | "date" | "time" | "duration" | "place";

export type ApiWorkspaceScheduleRelatedDocument = Pick<
  TravelDocument,
  "id" | "tripId" | "itineraryItemIds" | "kind" | "displayName"
>;

export type ApiWorkspaceScheduleReservationImpact = {
  itemId: string;
  placeName: string;
  changes: ApiWorkspaceScheduleImpactChange[];
  before: ItineraryItem;
  after?: ItineraryItem;
  serverTickets: BackendScheduleTicket[];
  serverReservation?: BackendScheduleReservation;
  localDocuments: ApiWorkspaceScheduleRelatedDocument[];
};

function uniqueById<T extends { id: string }>(values: readonly T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = value.id.trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function findChanges(
  before: ItineraryItem,
  after: ItineraryItem | undefined,
  beforeMetadata: WorkspaceScheduleItemMetadata | undefined,
  afterMetadata: WorkspaceScheduleItemMetadata | undefined,
): ApiWorkspaceScheduleImpactChange[] {
  if (!after) return ["delete"];
  const changes: ApiWorkspaceScheduleImpactChange[] = [];
  if (before.date !== after.date) changes.push("date");
  if (before.startTime !== after.startTime) changes.push("time");
  if (before.durationMinutes !== after.durationMinutes) changes.push("duration");
  if (before.placeId !== after.placeId || beforeMetadata?.placeName !== afterMetadata?.placeName) {
    changes.push("place");
  }
  return changes;
}

export function hasApiWorkspaceScheduleRelevantChanges(input: {
  snapshot: Pick<WorkspaceScheduleSnapshot, "itinerary" | "metadataByItemId">;
  draft: ApiWorkspaceScheduleDraft;
}) {
  const afterById = new Map(input.draft.itinerary.map((item) => [item.id, item]));
  return input.snapshot.itinerary.some((before) => findChanges(
    before,
    afterById.get(before.id),
    input.snapshot.metadataByItemId[before.id],
    input.draft.metadataByItemId[before.id],
  ).length > 0);
}

/**
 * API 일정의 저장 전후를 비교해, 사용자가 다시 확인해야 하는 서버 예약·티켓 또는
 * 이 기기의 로컬 문서가 실제로 연결된 변경만 반환한다. 서버가 권위 원본인
 * version/permission 판정은 이 함수의 책임이 아니다.
 */
export function findApiWorkspaceScheduleReservationImpacts(input: {
  snapshot: Pick<WorkspaceScheduleSnapshot, "scope" | "itinerary" | "metadataByItemId">;
  draft: ApiWorkspaceScheduleDraft;
  localDocuments: readonly ApiWorkspaceScheduleRelatedDocument[];
}): ApiWorkspaceScheduleReservationImpact[] {
  const afterById = new Map(input.draft.itinerary.map((item) => [item.id, item]));
  const documentsByItemId = new Map<string, ApiWorkspaceScheduleRelatedDocument[]>();
  input.localDocuments.forEach((document) => {
    if (document.tripId !== input.snapshot.scope.tripId) return;
    [...new Set(document.itineraryItemIds)].forEach((itemId) => {
      documentsByItemId.set(itemId, [...(documentsByItemId.get(itemId) ?? []), document]);
    });
  });

  return input.snapshot.itinerary.flatMap((before) => {
    const after = afterById.get(before.id);
    const beforeMetadata = input.snapshot.metadataByItemId[before.id];
    const afterMetadata = input.draft.metadataByItemId[before.id];
    const changes = findChanges(before, after, beforeMetadata, afterMetadata);
    if (!changes.length) return [];
    const serverTickets = uniqueById(beforeMetadata?.tickets ?? []);
    const serverReservation = beforeMetadata?.reservation;
    const localDocuments = uniqueById(documentsByItemId.get(before.id) ?? []);
    if (!serverTickets.length && !serverReservation && !localDocuments.length) return [];
    return [{
      itemId: before.id,
      placeName: beforeMetadata?.placeName.trim() || "일정",
      changes,
      before,
      ...(after ? { after } : {}),
      serverTickets,
      ...(serverReservation ? { serverReservation } : {}),
      localDocuments,
    }];
  });
}

const changeLabels: Record<ApiWorkspaceScheduleImpactChange, string> = {
  delete: "삭제",
  date: "날짜",
  time: "시각",
  duration: "체류 시간",
  place: "장소",
};

const reservationStatusLabels: Record<BackendScheduleReservation["status"], string> = {
  confirmed: "확정",
  unconfirmed: "미확정",
  cancelled: "취소됨",
};

export function describeApiWorkspaceScheduleReservationImpacts(
  impacts: readonly ApiWorkspaceScheduleReservationImpact[],
) {
  if (!impacts.length) return "";
  const preview = impacts.slice(0, 3).map((impact) => {
    const sources = [
      impact.serverTickets.length ? `공유 티켓 ${impact.serverTickets.length}개` : "",
      impact.serverReservation ? `예약 ${reservationStatusLabels[impact.serverReservation.status]}` : "",
      impact.localDocuments.length ? `이 기기 문서 ${impact.localDocuments.length}개` : "",
    ].filter(Boolean).join(" · ");
    return `• ${impact.placeName}: ${impact.changes.map((change) => changeLabels[change]).join("·")} 변경 (${sources})`;
  });
  if (impacts.length > preview.length) preview.push(`• 그 밖의 연결 일정 ${impacts.length - preview.length}개`);
  return [
    `예약·티켓과 연결된 일정 ${impacts.length}개가 바뀝니다.`,
    preview.join("\n"),
    "저장에 성공하면 예약 내용을 다시 확인할 TODO를 여행방에 공유합니다.",
  ].join("\n\n");
}

export function ticketRemovalItemIdsFromImpacts(
  impacts: readonly ApiWorkspaceScheduleReservationImpact[],
) {
  return impacts
    .filter((impact) => impact.changes.includes("delete") && impact.serverTickets.length > 0)
    .map((impact) => impact.itemId);
}
