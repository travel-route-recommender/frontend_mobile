import type {
  EntityId,
  ItineraryItem,
  Place,
  Region,
  TripCandidate,
  TripMember,
  TripRoom,
  TripStatus,
  User,
} from "../../../domain";
import type {
  ConfirmedScheduleConstraint,
  DuriDocumentReference,
  SharedDuriPreferenceEvidence,
  SharedPreferenceEvidenceStatus,
} from "../../../duri/duri-analysis";
import type { TravelDocument } from "../../trip-documents/types";
import type { ApiTripDocument } from "../../trip-documents/services/tripDocumentApi";
import type { WorkspaceScheduleSnapshot } from "../../workspace/services/workspaceScheduleContract";
import type { ApiTripLocalFacts } from "../../trip-creation/services/apiTripFactsStorage";
import { buildDuriAnalysisInputWithDocuments } from "./analysisInput";

/** API 응답 중 분석에 필요한 최소 구조. 네트워크 계층 타입에 분석기를 결합하지 않는다. */
export type ApiDuriAnalysisData = {
  room: {
    id: EntityId;
    title: string;
    startDate: string | null;
    endDate: string | null;
    status: TripStatus;
    members: TripMember[];
    factsVersion?: number;
  };
  region: Region;
  usersById: Record<EntityId, User>;
  candidates: TripCandidate[];
  placesById: Record<EntityId, Place>;
  scheduleSnapshot?: WorkspaceScheduleSnapshot;
  localFacts: ApiTripLocalFacts | null;
  localFactsStatus?: "loaded" | "missing" | "unavailable";
  workspaceOverlayStatus?: "loaded" | "missing" | "unavailable";
  sharedPreferenceEvidence?: SharedDuriPreferenceEvidence | null;
  sharedPreferenceEvidenceStatus?: SharedPreferenceEvidenceStatus;
  sharedDocuments?: readonly ApiTripDocument[];
  sharedDocumentsStatus?: "loaded" | "unavailable";
};

function normalizedPlanningFactsStatus(data: ApiDuriAnalysisData) {
  // API 분석의 이동수단·숙소·복귀 조건은 공유 Backend planning만 사용한다.
  // schedule 자체가 정상 로드됐지만 transportMode가 없으면 "미설정"이지
  // public 이동으로 추정해서는 안 된다.
  return data.scheduleSnapshot?.planning?.transportMode?.confirmedAt ? "loaded" as const : "missing" as const;
}

function normalizedSharedPreferenceStatus(
  data: ApiDuriAnalysisData,
  snapshot: WorkspaceScheduleSnapshot,
): SharedPreferenceEvidenceStatus {
  const status = data.sharedPreferenceEvidenceStatus ?? "unavailable";
  const evidence = data.sharedPreferenceEvidence;
  if (status !== "loaded" || !evidence) return status === "loaded" ? "unavailable" : status;
  const memberIds = new Set(data.room.members.map((member) => member.userId));
  const evidenceMemberIds = new Set(evidence.members.map((member) => member.userId));
  const candidatePlaceIds = new Set(data.candidates.map((candidate) => candidate.placeId));
  const evidenceCandidatePlaceIds = new Set(evidence.candidateSignals.map((candidate) => candidate.placeId));
  const memberScopeMatches = memberIds.size === evidenceMemberIds.size
    && [...memberIds].every((memberId) => evidenceMemberIds.has(memberId));
  const candidateScopeMatches = candidatePlaceIds.size === evidenceCandidatePlaceIds.size
    && [...candidatePlaceIds].every((placeId) => evidenceCandidatePlaceIds.has(placeId));
  const factsVersionMatches = Number.isInteger(data.room.factsVersion)
    && evidence.factsVersion === data.room.factsVersion;
  return evidence.roomId === data.room.id
    && evidence.scheduleVersion === snapshot.scheduleVersion
    && memberScopeMatches
    && candidateScopeMatches
    && factsVersionMatches
    ? "loaded"
    : "stale";
}

export function buildApiDomainTrip(data: ApiDuriAnalysisData): TripRoom {
  const planning = data.scheduleSnapshot?.planning;
  const transportMode = planning?.transportMode?.confirmedAt
    ? planning.transportMode.value
    : undefined;
  const hasCompleteReturnCondition = Boolean(
    planning?.returnPoint
    && planning.returnDeadline?.confirmedAt
    && planning.travelBufferMinutes?.confirmedAt
    && planning.prepBufferMinutes?.confirmedAt,
  );
  return {
    id: data.room.id,
    title: data.room.title,
    regionId: data.region.id,
    startDate: data.room.startDate,
    endDate: data.room.endDate,
    dateUndecided: !data.room.startDate || !data.room.endDate,
    status: data.room.status,
    // TripRoom의 transport가 필수라 표시용 fallback은 유지하되, 아래 status가
    // missing이면 분석기는 이 값을 실제 여행 사실로 사용하지 않는다.
    transport: transportMode === "car" ? "car" : "public",
    accommodationLocation: planning?.lodging ? { name: planning.lodging.name } : null,
    endCondition: hasCompleteReturnCondition ? {
      type: "other",
      location: { name: planning!.returnPoint!.name },
      deadline: planning!.returnDeadline!.value,
      // 두 값은 실제 경로 ETA가 아니라 사용자가 planning에 확정한 확보 시간이다.
      travelMinutes: planning!.travelBufferMinutes!.value,
      serviceBufferMinutes: planning!.prepBufferMinutes!.value,
      note: "여행방 공유 planning에 확정된 이동·준비 확보 시간",
    } : null,
    // Backend planning 계약에 아직 없는 두 항목만 기기 입력을 보조 표시값으로 유지한다.
    companionType: data.localFacts?.companionType ?? null,
    expectedMemberCount: data.localFacts?.expectedMemberCount ?? null,
    members: data.room.members.map((member) => ({ userId: member.userId, role: member.role })),
  };
}

function serverConfirmedReservationConstraints(
  snapshot: WorkspaceScheduleSnapshot,
): ConfirmedScheduleConstraint[] {
  return snapshot.itinerary.flatMap((item) => {
    const metadata = snapshot.metadataByItemId[item.id];
    const reservation = metadata?.reservation;
    if (reservation?.status !== "confirmed" || !reservation.confirmedAt) return [];
    return [{
      id: `server-reservation:${reservation.id}`,
      kind: "reservation" as const,
      label: `${metadata.placeName} 확정 예약`,
      source: "user-confirmed" as const,
      date: reservation.date ?? item.date,
      ...(reservation.startTime ? { startTime: reservation.startTime } : {}),
      ...(reservation.endTime ? { endTime: reservation.endTime } : {}),
      itineraryItemId: item.id,
      ...(reservation.placeId ?? item.placeId ? { placeId: reservation.placeId ?? item.placeId } : {}),
      confirmedAt: reservation.confirmedAt,
    }];
  });
}

function serverTicketReferences(snapshot: WorkspaceScheduleSnapshot): DuriDocumentReference[] {
  return snapshot.itinerary.flatMap((item) => {
    const tickets = snapshot.metadataByItemId[item.id]?.tickets ?? [];
    return tickets.map((ticket) => ({
      id: `server-ticket:${item.id}:${ticket.id}`,
      kind: "other" as const,
      itineraryItemIds: [item.id],
      // 티켓 파일 존재만으로 날짜·시각·예약 내용을 추정하지 않는다.
      // 다만 사용자가 첨부한 일정이라는 사실은 자동 순서 변경의 보수적 보호 근거다.
      orderProtected: true,
      extractionStatus: "not-requested" as const,
      confirmedFactIds: [],
      pendingReviewFactIds: [],
    }));
  });
}

function serverSharedDocumentReferences(documents: readonly ApiTripDocument[]): DuriDocumentReference[] {
  return documents.map((document) => ({
    id: `server-document:${document.id}`,
    kind: "other" as const,
    itineraryItemIds: [],
    // Backend 문서 계약에는 아직 종류·OCR 사실·일정 연결이 없다. 파일명이나
    // 메모만으로 예약 사실 또는 자동 잠금을 추정하지 않는다.
    orderProtected: false,
    extractionStatus: "not-requested" as const,
    confirmedFactIds: [],
    pendingReviewFactIds: [],
  }));
}

function snapshotMatchesRoom(data: ApiDuriAnalysisData, snapshot: WorkspaceScheduleSnapshot) {
  return Boolean(
    data.room.startDate
    && data.room.endDate
    && snapshot.scope.roomId === data.room.id
    && snapshot.scope.tripId === data.room.id
    && snapshot.scope.startDate === data.room.startDate
    && snapshot.scope.endDate === data.room.endDate,
  );
}

/**
 * 서버 일정과 로컬 mock Store를 섞지 않고 현재 API schedule snapshot만 분석 입력으로 만든다.
 * 원본 설문을 UserPreferenceResult로 꾸미지 않고 서버 파생 성향을 별도 증거로 전달한다.
 * 기기 전용 문서는 공유 사실과 섞지 않는다. API 모드에서는 서버 티켓·공유
 * 문서·구조화 예약만 분석 근거로 사용한다.
 */
export function buildApiDuriAnalysisInput(
  data: ApiDuriAnalysisData | undefined,
  currentUserId: EntityId,
  _localDocuments: readonly TravelDocument[] = [],
  documentCollectionStatus: "loaded" | "unavailable" = "loaded",
) {
  const snapshot = data?.scheduleSnapshot;
  if (!data || !snapshot || !currentUserId || !snapshotMatchesRoom(data, snapshot)) return undefined;
  const trip = buildApiDomainTrip(data);
  const sharedPreferenceEvidenceStatus = normalizedSharedPreferenceStatus(data, snapshot);
  const source = {
    currentUserId,
    usersById: data.usersById,
    placesById: data.placesById,
    tripsById: { [trip.id]: trip },
    candidatesByTripId: { [trip.id]: data.candidates },
    itineraryByTripId: {
      [trip.id]: snapshot.itinerary.map((item): ItineraryItem => ({
        ...item,
        preferredByUserIds: [...item.preferredByUserIds],
      })),
    },
    // API는 현재 상세 성향 수치를 제공하지 않는다. 로컬 mock 값을 채워 넣지 않는다.
    preferenceResultsByUserId: {},
  };
  const input = buildDuriAnalysisInputWithDocuments(
    source,
    trip.id,
    [
      ...serverTicketReferences(snapshot),
      ...serverSharedDocumentReferences(data.sharedDocuments ?? []),
    ],
    serverConfirmedReservationConstraints(snapshot),
    data.sharedDocumentsStatus ?? documentCollectionStatus,
  );
  return input ? {
    ...input,
    sourceRevision: `api-schedule:${snapshot.scope.roomId}:${snapshot.scheduleVersion}:facts:${data.room.factsVersion ?? "unknown"}:preferences:${sharedPreferenceEvidenceStatus}`,
    ...(Number.isInteger(data.room.factsVersion) ? { sourceFactsVersion: data.room.factsVersion } : {}),
    // 이전 캐시/부분 fixture가 상태를 제공하지 않으면 사실을 추정하지 않는다.
    // 필드명은 persisted 분석 snapshot 호환을 위해 유지하지만 API 모드에서는
    // 기기 저장값이 아닌 공유 Backend planning의 신뢰 상태를 뜻한다.
    localPlanningFactsStatus: normalizedPlanningFactsStatus(data),
    scheduleOverlayStatus: data.workspaceOverlayStatus ?? "unavailable",
    sharedPreferenceEvidenceStatus,
    ...(sharedPreferenceEvidenceStatus === "loaded" && data.sharedPreferenceEvidence
      ? { sharedPreferenceEvidence: data.sharedPreferenceEvidence }
      : {}),
  } : undefined;
}
