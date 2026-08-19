import type { TravelDocument, TravelDocumentKind, TravelDocumentStorage } from "../types";
import { TRAVEL_DOCUMENT_SESSION_ID } from "../types";
import { normalizeTravelDocumentExtraction, reconcileExtractionItineraryTargets } from "./documentExtraction";
import { normalizeExternalTravelDocumentUrl } from "./externalDocumentUrl";

type UnknownRecord = Record<string, unknown>;

const kinds: TravelDocumentKind[] = ["accommodation", "admission", "train", "bus", "rental-car", "other"];
const storages: TravelDocumentStorage[] = ["native-private", "web-session", "external-url"];
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uniqueStrings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)))]
  : [];

export function normalizeTravelDocument(value: unknown, fallbackTripId = ""): TravelDocument | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : "";
  const tripId = typeof value.tripId === "string" && value.tripId ? value.tripId : fallbackTripId;
  const kind = kinds.includes(value.kind as TravelDocumentKind) ? value.kind as TravelDocumentKind : undefined;
  const storage = storages.includes(value.storage as TravelDocumentStorage) ? value.storage as TravelDocumentStorage : undefined;
  const fileName = typeof value.fileName === "string" ? value.fileName : "";
  const localUri = typeof value.localUri === "string" ? value.localUri : "";
  const createdByUserId = typeof value.createdByUserId === "string" ? value.createdByUserId : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  const extraction = normalizeTravelDocumentExtraction(value.extraction);
  if (!id || !tripId || !kind || !storage || !fileName || !localUri || !createdByUserId || !createdAt) return undefined;
  if (storage === "external-url" && !normalizeExternalTravelDocumentUrl(localUri)) return undefined;
  return {
    id,
    tripId,
    itineraryItemIds: uniqueStrings(value.itineraryItemIds),
    kind,
    displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim().slice(0, 80) : fileName,
    fileName,
    mimeType: typeof value.mimeType === "string" && value.mimeType ? value.mimeType : "application/octet-stream",
    sizeBytes: typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0 ? value.sizeBytes : 0,
    localUri,
    storage,
    ...(typeof value.sessionId === "string" && value.sessionId ? { sessionId: value.sessionId } : {}),
    createdByUserId,
    createdAt,
    ...(extraction ? { extraction } : {}),
  };
}

export function normalizeTravelDocumentsByTripId(value: unknown): Record<string, TravelDocument[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([tripId, entries]) => {
    if (!tripId || !Array.isArray(entries)) return [];
    const seen = new Set<string>();
    const documents = entries.flatMap((entry) => {
      const document = normalizeTravelDocument(entry, tripId);
      if (!document || document.tripId !== tripId || seen.has(document.id)) return [];
      seen.add(document.id);
      return [document];
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
    return [[tripId, documents]];
  }));
}

export function discardExpiredWebSessionDocuments(documentsByTripId: Record<string, TravelDocument[]>) {
  return Object.fromEntries(Object.entries(documentsByTripId).map(([tripId, documents]) => [
    tripId,
    documents.filter((document) => document.storage !== "web-session" || document.sessionId === TRAVEL_DOCUMENT_SESSION_ID),
  ]));
}

export function setItineraryDocumentLinks(
  documents: TravelDocument[],
  itineraryItemId: string,
  selectedDocumentIds: readonly string[],
) {
  const selected = new Set(selectedDocumentIds);
  const next = documents.map((document) => {
    const alreadyLinked = document.itineraryItemIds.includes(itineraryItemId);
    if (selected.has(document.id) && alreadyLinked) return document;
    if (!selected.has(document.id) && !alreadyLinked) return document;
    const withoutTarget = document.itineraryItemIds.filter((id) => id !== itineraryItemId);
    const itineraryItemIds = selected.has(document.id) ? [...withoutTarget, itineraryItemId] : withoutTarget;
    const extraction = reconcileExtractionItineraryTargets(document.extraction, new Set(itineraryItemIds));
    return {
      ...document,
      itineraryItemIds,
      ...(extraction ? { extraction } : { extraction: undefined }),
    };
  });
  return next.some((document, index) => document !== documents[index]) ? next : documents;
}

export function reconcileTravelDocumentLinks(documents: TravelDocument[], validItineraryItemIds: ReadonlySet<string>) {
  const next = documents.map((document) => {
    const itineraryItemIds = document.itineraryItemIds.filter((id) => validItineraryItemIds.has(id));
    const extraction = reconcileExtractionItineraryTargets(document.extraction, new Set(itineraryItemIds));
    return itineraryItemIds.length === document.itineraryItemIds.length && extraction === document.extraction
      ? document
      : { ...document, itineraryItemIds, ...(extraction ? { extraction } : { extraction: undefined }) };
  });
  return next.some((document, index) => document !== documents[index]) ? next : documents;
}
