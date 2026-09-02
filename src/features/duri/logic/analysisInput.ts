import type { ConfirmedScheduleConstraint, DuriDocumentReference } from "../../../duri/duri-analysis";
import { buildDuriAnalysisInputFromState } from "../selectors/duriSelectors";
import type { DuriInputSource } from "../types";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "./analysisSnapshot";
import type { TravelDocument } from "../../trip-documents/types";
import { buildConfirmedScheduleConstraintsFromDocuments, buildDuriDocumentReferencesFromDocuments } from "../../trip-documents/logic/documentExtraction";

type BasicDocumentReferenceSource = Pick<DuriDocumentReference, "id" | "kind" | "itineraryItemIds">
  & Partial<Pick<DuriDocumentReference, "orderProtected" | "extractionStatus" | "confirmedFactIds" | "pendingReviewFactIds">>;
type DocumentReferenceSource = BasicDocumentReferenceSource | TravelDocument;

function isTravelDocument(value: DocumentReferenceSource): value is TravelDocument {
  const candidate = value as Partial<TravelDocument>;
  return typeof candidate.tripId === "string"
    && typeof candidate.displayName === "string"
    && typeof candidate.fileName === "string"
    && typeof candidate.mimeType === "string"
    && typeof candidate.localUri === "string"
    && typeof candidate.sizeBytes === "number"
    && (candidate.storage === "native-private" || candidate.storage === "web-session" || candidate.storage === "external-url")
    && typeof candidate.createdByUserId === "string"
    && typeof candidate.createdAt === "string";
}

/** 분석 화면과 워크스페이스가 동일한 사용자 입력 fingerprint를 만들도록 한 경로로 조립한다. */
export function buildDuriAnalysisInputWithDocuments(
  source: DuriInputSource,
  tripId: string,
  documents: readonly DocumentReferenceSource[],
  confirmedScheduleConstraints: readonly ConfirmedScheduleConstraint[] = [],
  documentCollectionStatus: "loaded" | "unavailable" = "loaded",
) {
  const base = buildDuriAnalysisInputFromState(source, tripId);
  if (!base) return undefined;
  // 전체가 TravelDocument인 경우에만 파생하던 방식은 generic reference 하나가
  // 섞였을 때 나머지 문서의 사용자 확정 사실까지 조용히 누락시켰다. 각 문서를
  // 독립적으로 판별하고, 다른 여행방의 full document는 여기서 격리한다.
  // 문서 저장소 읽기에 실패했을 때 메모리에 남아 있는 이전 TravelDocument를 최신 사실처럼
  // 재사용하지 않는다. API 서버 티켓처럼 이번 서버 snapshot에서 새로 만든 generic reference는
  // 별도 출처이므로 아래 경로에서 그대로 보존한다.
  const travelDocuments = documentCollectionStatus === "unavailable"
    ? []
    : documents.filter(isTravelDocument).filter((document) => document.tripId === tripId);
  const documentReferencesById = new Map<string, DuriDocumentReference>();
  documents.forEach((document) => {
    if (isTravelDocument(document)) return;
    documentReferencesById.set(document.id, {
      id: document.id,
      kind: document.kind,
      itineraryItemIds: [...document.itineraryItemIds],
      ...(document.orderProtected !== undefined ? { orderProtected: document.orderProtected } : {}),
      ...(document.extractionStatus ? { extractionStatus: document.extractionStatus } : {}),
      ...(document.confirmedFactIds ? { confirmedFactIds: [...document.confirmedFactIds] } : {}),
      ...(document.pendingReviewFactIds ? { pendingReviewFactIds: [...document.pendingReviewFactIds] } : {}),
    });
  });
  // 같은 ID의 legacy reference가 함께 넘어와도 full document의 검토 상태와
  // provenance가 사라지지 않도록 rich reference를 마지막에 우선한다.
  buildDuriDocumentReferencesFromDocuments(travelDocuments).forEach((reference) => {
    documentReferencesById.set(reference.id, reference);
  });
  const documentReferences = [...documentReferencesById.values()];
  const derivedConstraints = buildConfirmedScheduleConstraintsFromDocuments(travelDocuments).constraints;
  const candidateConstraints = [...(base.confirmedScheduleConstraints ?? []), ...derivedConstraints, ...confirmedScheduleConstraints]
    .filter((constraint) => documentCollectionStatus !== "unavailable" || constraint.source !== "document-confirmed");
  const constraintsById = new Map(candidateConstraints
    .map((constraint) => [constraint.id, { ...constraint }]));
  return {
    ...base,
    confirmedScheduleConstraints: [...constraintsById.values()],
    documentReferences,
    documentCollectionStatus,
  };
}

export function isDuriAnalysisCompletionCurrent({
  requestedFingerprint,
  sessionFingerprint,
  latestInput,
}: {
  requestedFingerprint: string;
  sessionFingerprint: string;
  latestInput: ReturnType<typeof buildDuriAnalysisInputWithDocuments>;
}) {
  if (!latestInput || sessionFingerprint !== requestedFingerprint) return false;
  return createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput)) === requestedFingerprint;
}
