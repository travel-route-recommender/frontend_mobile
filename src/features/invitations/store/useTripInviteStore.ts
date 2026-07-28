import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { EntityId } from "../../../domain";
import { createPersistHydrationStore } from "../../../store/createPersistHydrationStore";
import { createMockTripInviteCode, createTripInviteRecord } from "../logic/tripInviteLinks";
import type { TripInviteLinkRecord } from "../types";

export const TRIP_INVITE_STORAGE_VERSION = 1;

type TripInviteState = {
  linksByTripId: Record<EntityId, TripInviteLinkRecord>;
  ensureInviteLink(tripId: EntityId): TripInviteLinkRecord;
  rotateInviteLink(tripId: EntityId): TripInviteLinkRecord;
  disableInviteLink(tripId: EntityId): TripInviteLinkRecord | undefined;
};

export const useTripInviteHydrationState = createPersistHydrationStore();

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function normalizePersistedTripInviteLinks(value: unknown) {
  if (!isRecord(value) || !isRecord(value.linksByTripId)) return {} as Record<EntityId, TripInviteLinkRecord>;
  return Object.fromEntries(Object.entries(value.linksByTripId).flatMap(([key, candidate]) => {
    if (!isRecord(candidate)) return [];
    const tripId = typeof candidate.tripId === "string" && candidate.tripId ? candidate.tripId : key;
    const revision = typeof candidate.revision === "number" && Number.isInteger(candidate.revision) && candidate.revision > 0 ? candidate.revision : 1;
    const status = candidate.status === "disabled" ? "disabled" : "active";
    return [[tripId, { tripId, revision, status, code: createMockTripInviteCode(tripId, revision) } satisfies TripInviteLinkRecord]];
  }));
}

export const useTripInviteStore = create<TripInviteState>()(
  persist(
    (set) => ({
      linksByTripId: {},
      ensureInviteLink: (tripId) => {
        let resolved = createTripInviteRecord(tripId);
        set((state) => {
          const current = state.linksByTripId[tripId];
          if (current?.status === "active") {
            resolved = current;
            return state;
          }
          resolved = createTripInviteRecord(tripId, (current?.revision ?? 0) + 1);
          return { linksByTripId: { ...state.linksByTripId, [tripId]: resolved } };
        });
        return resolved;
      },
      rotateInviteLink: (tripId) => {
        let rotated = createTripInviteRecord(tripId);
        set((state) => {
          rotated = createTripInviteRecord(tripId, (state.linksByTripId[tripId]?.revision ?? 0) + 1);
          return { linksByTripId: { ...state.linksByTripId, [tripId]: rotated } };
        });
        return rotated;
      },
      disableInviteLink: (tripId) => {
        let disabled: TripInviteLinkRecord | undefined;
        set((state) => {
          const current = state.linksByTripId[tripId];
          if (!current) return state;
          disabled = { ...current, status: "disabled" };
          return { linksByTripId: { ...state.linksByTripId, [tripId]: disabled } };
        });
        return disabled;
      },
    }),
    {
      name: "duri-trip-invites",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: TRIP_INVITE_STORAGE_VERSION,
      partialize: (state) => ({ linksByTripId: state.linksByTripId }),
      migrate: (persistedState) => ({ linksByTripId: normalizePersistedTripInviteLinks(persistedState) }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        linksByTripId: normalizePersistedTripInviteLinks(persistedState),
      }),
      onRehydrateStorage: () => {
        useTripInviteHydrationState.getState().begin();
        return (_hydratedState, error) => {
          if (error) {
            useTripInviteHydrationState.getState().fail("저장된 초대 링크를 불러오지 못했어요.");
            return;
          }
          useTripInviteHydrationState.getState().succeed();
        };
      },
    },
  ),
);
