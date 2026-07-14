import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nativeTokenStorage } from "../../../services/tokenStorage";
import type { AuthStatus, SessionKind } from "../types";

export const AUTH_SESSION_STORAGE_VERSION = 1;

type SessionInput = {
  userId: string;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
};

export interface AuthSessionState {
  sessionKind: SessionKind | null;
  authStatus: AuthStatus;
  currentSessionUserId: string | null;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
  isHydrated: boolean;
  errorMessage: string | null;
  startAnonymousSession(): void;
  startMockMemberSession(input: SessionInput): void;
  startMockGuestSession(input: SessionInput): void;
  restoreSession(): void;
  setProfileCompleted(completed: boolean): void;
  setOnboardingIntroSeen(seen: boolean): void;
  setPreferenceTestCompleted(completed: boolean): void;
  setAuthError(message: string): void;
  clearAuthError(): void;
  setHydrated(hydrated: boolean): void;
  logout(): Promise<void>;
}

type PersistedSession = Pick<AuthSessionState, "sessionKind" | "authStatus" | "currentSessionUserId" | "profileCompleted" | "onboardingIntroSeen" | "preferenceTestCompleted">;
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const initialSession = {
  sessionKind: null,
  authStatus: "unauthenticated",
  currentSessionUserId: null,
  profileCompleted: false,
  onboardingIntroSeen: false,
  preferenceTestCompleted: false,
} satisfies PersistedSession;

export function normalizePersistedAuthSession(value: unknown): PersistedSession {
  if (!isRecord(value)) return initialSession;
  const sessionKind = value.sessionKind === "anonymous" || value.sessionKind === "guest" || value.sessionKind === "member" ? value.sessionKind : null;
  const userId = typeof value.currentSessionUserId === "string" && value.currentSessionUserId ? value.currentSessionUserId : null;
  if (!sessionKind || ((sessionKind === "guest" || sessionKind === "member") && !userId)) return initialSession;
  return {
    sessionKind,
    authStatus: "authenticated",
    currentSessionUserId: sessionKind === "anonymous" ? null : userId,
    profileCompleted: sessionKind === "anonymous" ? false : Boolean(value.profileCompleted),
    onboardingIntroSeen: sessionKind === "anonymous" ? false : Boolean(value.onboardingIntroSeen),
    preferenceTestCompleted: sessionKind === "anonymous" ? false : Boolean(value.preferenceTestCompleted),
  };
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    (set, get) => ({
      ...initialSession,
      isHydrated: false,
      errorMessage: null,
      startAnonymousSession: () => set({ ...initialSession, sessionKind: "anonymous", authStatus: "authenticated", isHydrated: true }),
      startMockMemberSession: (input) => set({ sessionKind: "member", authStatus: "authenticated", currentSessionUserId: input.userId, profileCompleted: input.profileCompleted, onboardingIntroSeen: input.onboardingIntroSeen, preferenceTestCompleted: input.preferenceTestCompleted, errorMessage: null }),
      startMockGuestSession: (input) => set({ sessionKind: "guest", authStatus: "authenticated", currentSessionUserId: input.userId, profileCompleted: input.profileCompleted, onboardingIntroSeen: input.onboardingIntroSeen, preferenceTestCompleted: input.preferenceTestCompleted, errorMessage: null }),
      restoreSession: () => set((state) => ({ isHydrated: true, authStatus: state.sessionKind ? "authenticated" : "unauthenticated" })),
      setProfileCompleted: (profileCompleted) => set({ profileCompleted }),
      setOnboardingIntroSeen: (onboardingIntroSeen) => set({ onboardingIntroSeen }),
      setPreferenceTestCompleted: (preferenceTestCompleted) => set({ preferenceTestCompleted }),
      setAuthError: (errorMessage) => set({ authStatus: "error", errorMessage }),
      clearAuthError: () => set({ errorMessage: null, authStatus: get().sessionKind ? "authenticated" : "unauthenticated" }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      logout: async () => {
        set({ authStatus: "loading" });
        try { await nativeTokenStorage.clearTokens(); } finally { set({ ...initialSession, isHydrated: true, errorMessage: null }); }
      },
    }),
    {
      name: "duri-auth-session",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: AUTH_SESSION_STORAGE_VERSION,
      migrate: (persistedState) => normalizePersistedAuthSession(persistedState),
      merge: (persistedState, currentState) => ({ ...currentState, ...normalizePersistedAuthSession(persistedState) }),
      onRehydrateStorage: (state) => {
        state.setHydrated(false);
        return (hydratedState, error) => {
          if (error) {
            state.setAuthError("저장된 로그인 상태를 불러오지 못했어요.");
            state.setHydrated(true);
            return;
          }
          hydratedState?.restoreSession();
        };
      },
      partialize: (state) => ({
        sessionKind: state.sessionKind,
        authStatus: state.authStatus,
        currentSessionUserId: state.currentSessionUserId,
        profileCompleted: state.profileCompleted,
        onboardingIntroSeen: state.onboardingIntroSeen,
        preferenceTestCompleted: state.preferenceTestCompleted,
      }),
    },
  ),
);
