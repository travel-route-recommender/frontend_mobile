import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { activateLocalPrivateDataScope, deactivateLocalPrivateDataScope, inferLegacyLocalPrivateDataOwner, resolveHydratedLocalPrivateDataScope, transferLocalPrivateDataScope } from "../../auth/services/localPrivateDataPolicy";
import { discardExpiredWebSessionDocuments, normalizeTravelDocumentsByTripId, reconcileTravelDocumentLinks, setItineraryDocumentLinks } from "../logic/travelDocumentState";
import type { TravelDocument, TravelDocumentExtraction } from "../types";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
type DocumentsByTripId = Record<string, TravelDocument[]>;

type TripDocumentState = {
  /** UI와 서비스에는 현재 인증 계정의 자료만 노출한다. */
  documentsByTripId: DocumentsByTripId;
  privateDataOwnerUserId: string | null;
  /** undefined는 auth 결정 전, null은 명시적 로그아웃 상태다. persist하지 않는다. */
  requestedPrivateDataOwnerUserId: string | null | undefined;
  privateDocumentsByOwnerUserId: Record<string, DocumentsByTripId>;
  /** 소유자를 단일하게 판별할 수 없었던 구버전 자료는 어떤 계정에도 노출하지 않는다. */
  legacyQuarantinedDocumentsByTripId: DocumentsByTripId;
  activatePrivateDataScope(userId: string): void;
  deactivatePrivateDataScope(): void;
  transferPrivateDataScope(previousUserId: string, nextUserId: string): void;
  addDocument(document: TravelDocument): boolean;
  removeDocument(tripId: string, documentId: string): TravelDocument | undefined;
  setDocumentExtraction(tripId: string, documentId: string, extraction: TravelDocumentExtraction | undefined): boolean;
  setLinksForItinerary(tripId: string, itineraryItemId: string, selectedDocumentIds: readonly string[]): boolean;
  reconcileTripLinks(tripId: string, validItineraryItemIds: readonly string[]): void;
  removeTripDocuments(tripId: string): TravelDocument[];
};

type TripDocumentHydrationState = {
  isHydrated: boolean;
  hydrationError: string | null;
  begin(): void;
  succeed(): void;
  fail(message: string): void;
};

/**
 * persist 대상과 hydration 상태를 분리한다. 읽기 전에 상태 flag를 갱신하면서
 * 빈 documentsByTripId를 저장해 기존 metadata를 덮어쓰는 일을 방지한다.
 */
export const useTripDocumentHydrationState = create<TripDocumentHydrationState>((set) => ({
  isHydrated: false,
  hydrationError: null,
  begin: () => set({ isHydrated: false, hydrationError: null }),
  succeed: () => set({ isHydrated: true, hydrationError: null }),
  fail: (hydrationError) => set({ isHydrated: false, hydrationError }),
}));

export const TRIP_DOCUMENT_STORAGE_KEY = "duri-trip-documents";
export const TRIP_DOCUMENT_STORAGE_VERSION = 3;

function normalizeDocumentCollection(value: unknown) {
  return discardExpiredWebSessionDocuments(normalizeTravelDocumentsByTripId(value));
}

function normalizePrivateDocumentScopes(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, documents]) => (
    userId ? [[userId, normalizeDocumentCollection(documents)] as const] : []
  )));
}

function normalizePersistedDocumentState(value: unknown) {
  const source = isRecord(value) ? value : {};
  let documentsByTripId = normalizeDocumentCollection(source.documentsByTripId);
  let privateDataOwnerUserId = typeof source.privateDataOwnerUserId === "string" && source.privateDataOwnerUserId
    ? source.privateDataOwnerUserId
    : null;
  const privateDocumentsByOwnerUserId = normalizePrivateDocumentScopes(source.privateDocumentsByOwnerUserId);
  let legacyQuarantinedDocumentsByTripId = normalizeDocumentCollection(source.legacyQuarantinedDocumentsByTripId);
  if (!privateDataOwnerUserId && Object.values(documentsByTripId).some((documents) => documents.length > 0)) {
    const inferred = inferLegacyLocalPrivateDataOwner(
      Object.values(documentsByTripId).flat().map((document) => document.createdByUserId),
    );
    if (inferred.status === "single-owner") privateDataOwnerUserId = inferred.userId;
    else if (inferred.status === "ambiguous") {
      legacyQuarantinedDocumentsByTripId = { ...legacyQuarantinedDocumentsByTripId, ...documentsByTripId };
      documentsByTripId = {};
    }
  }
  return {
    documentsByTripId,
    privateDataOwnerUserId,
    privateDocumentsByOwnerUserId,
    legacyQuarantinedDocumentsByTripId,
  };
}

export const useTripDocumentStore = create<TripDocumentState>()(
  persist(
    (set, get) => ({
      documentsByTripId: {},
      privateDataOwnerUserId: null,
      requestedPrivateDataOwnerUserId: undefined,
      privateDocumentsByOwnerUserId: {},
      legacyQuarantinedDocumentsByTripId: {},
      activatePrivateDataScope: (userId) => set((state) => {
        const next = activateLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: state.documentsByTripId,
          dataByOwnerUserId: state.privateDocumentsByOwnerUserId,
        }, userId, () => ({}));
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: userId,
          documentsByTripId: next.activeData,
          privateDocumentsByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      deactivatePrivateDataScope: () => set((state) => {
        const next = deactivateLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: state.documentsByTripId,
          dataByOwnerUserId: state.privateDocumentsByOwnerUserId,
        }, () => ({}));
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: null,
          documentsByTripId: next.activeData,
          privateDocumentsByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      transferPrivateDataScope: (previousUserId, nextUserId) => set((state) => {
        const next = transferLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: state.documentsByTripId,
          dataByOwnerUserId: state.privateDocumentsByOwnerUserId,
        }, previousUserId, nextUserId, () => ({}));
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: nextUserId,
          documentsByTripId: next.activeData,
          privateDocumentsByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      addDocument: (document) => {
        const current = get().documentsByTripId[document.tripId] ?? [];
        if (current.some((entry) => entry.id === document.id
          || (document.storage === "external-url" && entry.storage === "external-url" && entry.localUri === document.localUri))) return false;
        set((state) => ({
          documentsByTripId: {
            ...state.documentsByTripId,
            [document.tripId]: [document, ...(state.documentsByTripId[document.tripId] ?? [])],
          },
        }));
        return true;
      },
      removeDocument: (tripId, documentId) => {
        const current = get().documentsByTripId[tripId] ?? [];
        const removed = current.find((document) => document.id === documentId);
        if (!removed) return undefined;
        set((state) => ({
          documentsByTripId: {
            ...state.documentsByTripId,
            [tripId]: (state.documentsByTripId[tripId] ?? []).filter((document) => document.id !== documentId),
          },
        }));
        return removed;
      },
      setDocumentExtraction: (tripId, documentId, extraction) => {
        const current = get().documentsByTripId[tripId] ?? [];
        if (!current.some((document) => document.id === documentId)) return false;
        set((state) => ({
          documentsByTripId: {
            ...state.documentsByTripId,
            [tripId]: (state.documentsByTripId[tripId] ?? []).map((document) => document.id === documentId
              ? { ...document, ...(extraction ? { extraction } : { extraction: undefined }) }
              : document),
          },
        }));
        return true;
      },
      setLinksForItinerary: (tripId, itineraryItemId, selectedDocumentIds) => {
        const current = get().documentsByTripId[tripId] ?? [];
        const existingIds = new Set(current.map((document) => document.id));
        if (!itineraryItemId || selectedDocumentIds.some((id) => !existingIds.has(id))) return false;
        set((state) => {
          const currentDocuments = state.documentsByTripId[tripId] ?? [];
          const nextDocuments = setItineraryDocumentLinks(currentDocuments, itineraryItemId, selectedDocumentIds);
          return nextDocuments === currentDocuments ? state : {
            documentsByTripId: { ...state.documentsByTripId, [tripId]: nextDocuments },
          };
        });
        return true;
      },
      reconcileTripLinks: (tripId, validItineraryItemIds) => set((state) => {
        const currentDocuments = state.documentsByTripId[tripId] ?? [];
        const nextDocuments = reconcileTravelDocumentLinks(currentDocuments, new Set(validItineraryItemIds));
        return nextDocuments === currentDocuments ? state : {
          documentsByTripId: { ...state.documentsByTripId, [tripId]: nextDocuments },
        };
      }),
      removeTripDocuments: (tripId) => {
        const removed = get().documentsByTripId[tripId] ?? [];
        set((state) => {
          const documentsByTripId = { ...state.documentsByTripId };
          delete documentsByTripId[tripId];
          return { documentsByTripId };
        });
        return removed;
      },
    }),
    {
      name: TRIP_DOCUMENT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: TRIP_DOCUMENT_STORAGE_VERSION,
      migrate: (persistedState) => normalizePersistedDocumentState(persistedState),
      merge: (persistedState, currentState) => {
        const persisted = normalizePersistedDocumentState(persistedState);
        const scoped = resolveHydratedLocalPrivateDataScope({
          ownerUserId: persisted.privateDataOwnerUserId,
          activeData: persisted.documentsByTripId,
          dataByOwnerUserId: persisted.privateDocumentsByOwnerUserId,
        }, currentState.requestedPrivateDataOwnerUserId, () => ({}));
        return {
          ...currentState,
          ...persisted,
          privateDataOwnerUserId: scoped.ownerUserId,
          documentsByTripId: scoped.activeData,
          privateDocumentsByOwnerUserId: scoped.dataByOwnerUserId,
        };
      },
      onRehydrateStorage: () => {
        useTripDocumentHydrationState.getState().begin();
        return (_hydratedState, error) => {
          if (error) {
            useTripDocumentHydrationState.getState().fail("저장된 여행 문서 목록을 불러오지 못했어요.");
            return;
          }
          useTripDocumentHydrationState.getState().succeed();
        };
      },
      partialize: (state) => ({
        documentsByTripId: state.documentsByTripId,
        privateDataOwnerUserId: state.privateDataOwnerUserId,
        privateDocumentsByOwnerUserId: state.privateDocumentsByOwnerUserId,
        legacyQuarantinedDocumentsByTripId: state.legacyQuarantinedDocumentsByTripId,
      }),
    },
  ),
);
