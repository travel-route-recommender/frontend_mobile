import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { discardExpiredWebSessionDocuments, normalizeTravelDocumentsByTripId, reconcileTravelDocumentLinks, setItineraryDocumentLinks } from "../logic/travelDocumentState";
import type { TravelDocument } from "../types";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

type TripDocumentState = {
  documentsByTripId: Record<string, TravelDocument[]>;
  addDocument(document: TravelDocument): boolean;
  removeDocument(tripId: string, documentId: string): TravelDocument | undefined;
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

export const useTripDocumentStore = create<TripDocumentState>()(
  persist(
    (set, get) => ({
      documentsByTripId: {},
      addDocument: (document) => {
        const current = get().documentsByTripId[document.tripId] ?? [];
        if (current.some((entry) => entry.id === document.id)) return false;
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
      version: 1,
      migrate: (persistedState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        return { documentsByTripId: discardExpiredWebSessionDocuments(normalizeTravelDocumentsByTripId(source.documentsByTripId)) };
      },
      merge: (persistedState, currentState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        return { ...currentState, documentsByTripId: discardExpiredWebSessionDocuments(normalizeTravelDocumentsByTripId(source.documentsByTripId)) };
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
      partialize: (state) => ({ documentsByTripId: state.documentsByTripId }),
    },
  ),
);
