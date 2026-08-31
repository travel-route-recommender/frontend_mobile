import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MOCK_FRIEND_IDS, NEW_MOCK_FRIEND_IDS } from "../config/mock-friends";
import { resolveSavedFriendIds } from "../logic/resolve-saved-friend-ids";
import type { FriendCompatibilityResult } from "../types";

const FRIEND_STORE_KEY = "duri-friend-compatibility";
const FRIEND_STORE_VERSION = 2;
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function normalizeSavedFriends(value: unknown, appendNewFriends = false) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([userId, ids]) => {
    const normalizedIds = Array.isArray(ids)
      ? [...new Set(ids.filter((id): id is string => typeof id === "string" && MOCK_FRIEND_IDS.includes(id as (typeof MOCK_FRIEND_IDS)[number])))]
      : [];
    return [userId, appendNewFriends ? [...new Set([...normalizedIds, ...NEW_MOCK_FRIEND_IDS])] : normalizedIds];
  }));
}

type FriendCompatibilityState = {
  savedFriendIdsByUserId: Record<string, string[]>;
  latestResult: FriendCompatibilityResult | null;
  isHydrated: boolean;
  errorMessage: string | null;
  toggleSavedFriend(userId: string, friendId: string): void;
  setLatestResult(result: FriendCompatibilityResult | null): void;
  setHydrated(hydrated: boolean): void;
  setError(message: string | null): void;
};

export const useFriendCompatibilityStore = create<FriendCompatibilityState>()(
  persist(
    (set) => ({
      savedFriendIdsByUserId: {},
      latestResult: null,
      isHydrated: false,
      errorMessage: null,
      toggleSavedFriend: (userId, friendId) => set((state) => {
        if (!userId || !MOCK_FRIEND_IDS.includes(friendId as (typeof MOCK_FRIEND_IDS)[number])) return state;
        const current = resolveSavedFriendIds(state.savedFriendIdsByUserId, userId);
        const next = current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId];
        return { savedFriendIdsByUserId: { ...state.savedFriendIdsByUserId, [userId]: next } };
      }),
      setLatestResult: (latestResult) => set({ latestResult }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      setError: (errorMessage) => set({ errorMessage }),
    }),
    {
      name: FRIEND_STORE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: FRIEND_STORE_VERSION,
      migrate: (persistedState, version) => {
        const source = isRecord(persistedState) ? persistedState : {};
        return { savedFriendIdsByUserId: normalizeSavedFriends(source.savedFriendIdsByUserId, version < FRIEND_STORE_VERSION) };
      },
      merge: (persistedState, currentState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        return { ...currentState, savedFriendIdsByUserId: normalizeSavedFriends(source.savedFriendIdsByUserId) };
      },
      onRehydrateStorage: (state) => {
        state.setHydrated(false);
        state.setError(null);
        return (hydratedState, error) => {
          if (error) hydratedState?.setError("저장한 친구 목록을 불러오지 못했어요.");
          hydratedState?.setHydrated(true);
        };
      },
      partialize: (state) => ({ savedFriendIdsByUserId: state.savedFriendIdsByUserId }),
    },
  ),
);

export function selectSavedFriendIds(state: FriendCompatibilityState, userId: string | null | undefined) {
  return resolveSavedFriendIds(state.savedFriendIdsByUserId, userId);
}
