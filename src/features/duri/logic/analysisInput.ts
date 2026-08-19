import type { ConfirmedScheduleConstraint, DuriDocumentReference } from "../../../duri/duri-analysis";
import { buildDuriAnalysisInputFromState } from "../selectors/duriSelectors";
import type { DuriInputSource } from "../types";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "./analysisSnapshot";
import type { TravelDocument } from "../../trip-documents/types";
import { buildConfirmedScheduleConstraintsFromDocuments, buildDuriDocumentReferencesFromDocuments } from "../../trip-documents/logic/documentExtraction";

type BasicDocumentReferenceSource = Pick<DuriDocumentReference, "id" | "kind" | "itineraryItemIds">
  & Partial<Pick<DuriDocumentReference, "extractionStatus" | "confirmedFactIds" | "pendingReviewFactIds">>;
type DocumentReferenceSource = BasicDocumentReferenceSource | TravelDocument;

function isTravelDocument(value: DocumentReferenceSource): value is TravelDocument {
  const candidate = value as Partial<TravelDocument>;
  return typeof candidate.tripId === "string"
    && typeof candidate.displayName === "string"
    && typeof candidate.fileName === "string"
    && typeof candidate.mimeType === "string"
    && typeof candidate.localUri === "string"
    && typeof candidate.sizeBytes === "number"
    && (candidate.storage === "native-private" || candidate.storage === "web-session")
    && typeof candidate.createdByUserId === "string"
    && typeof candidate.createdAt === "string";
}

/** 분석 화면과 워크스페이스가 동일한 사용자 입력 fingerprint를 만들도록 한 경로로 조립한다. */
export function buildDuriAnalysisInputWithDocuments(
  source: DuriInputSource,
  tripId: string,
  documents: readonly DocumentReferenceSource[],
  confirmedScheduleConstraints: readonly ConfirmedScheduleConstraint[] = [],
) {
  const base = buildDuriAnalysisInputFromState(source, tripId);
  if (!base) return undefined;
  // 전체가 TravelDocument인 경우에만 파생하던 방식은 generic reference 하나가
  // 섞였을 때 나머지 문서의 사용자 확정 사실까지 조용히 누락시켰다. 각 문서를
  // 독립적으로 판별하고, 다른 여행방의 full document는 여기서 격리한다.
  const travelDocuments = documents.filter(isTravelDocument).filter((document) => document.tripId === tripId);
  const documentReferencesById = new Map<string, DuriDocumentReference>();
  documents.forEach((document) => {
    if (isTravelDocument(document)) return;
    documentReferencesById.set(document.id, {
      id: document.id,
      kind: document.kind,
      itineraryItemIds: [...document.itineraryItemIds],
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
  const constraintsById = new Map([...(base.confirmedScheduleConstraints ?? []), ...derivedConstraints, ...confirmedScheduleConstraints]
    .map((constraint) => [constraint.id, { ...constraint }]));
  return {
    ...base,
    confirmedScheduleConstraints: [...constraintsById.values()],
    documentReferences,
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
