import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthProvider, AuthStatus, SessionKind } from "../types";

export const AUTH_SESSION_STORAGE_VERSION = 2;

type SessionInput = {
  userId: string;
  sessionKind: "member" | "guest";
  provider: AuthProvider;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
};

export interface AuthSessionState {
  sessionKind: SessionKind | null;
  authStatus: AuthStatus;
  currentSessionUserId: string | null;
  provider: AuthProvider | null;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
  isHydrated: boolean;
  errorMessage: string | null;
  startSession(input: SessionInput): void;
  restoreSession(): void;
  markStoredSessionReady(): void;
  setAuthLoading(): void;
  setProfileCompleted(completed: boolean): void;
  setOnboardingIntroSeen(seen: boolean): void;
  setPreferenceTestCompleted(completed: boolean): void;
  setAuthError(message: string): void;
  clearAuthError(): void;
  setHydrated(hydrated: boolean): void;
  clearSession(): void;
}

type PersistedSession = Pick<AuthSessionState, "sessionKind" | "authStatus" | "currentSessionUserId" | "provider" | "profileCompleted" | "onboardingIntroSeen" | "preferenceTestCompleted">;
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const initialSession = {
  sessionKind: null,
  authStatus: "unauthenticated",
  currentSessionUserId: null,
  provider: null,
  profileCompleted: false,
  onboardingIntroSeen: false,
  preferenceTestCompleted: false,
} satisfies PersistedSession;

export function normalizePersistedAuthSession(value: unknown): PersistedSession {
  if (!isRecord(value)) return initialSession;
  // v1의 anonymous 둘러보기 세션은 실제 인증 세션이 아니므로 마이그레이션하지 않는다.
  const sessionKind = value.sessionKind === "guest" || value.sessionKind === "member" ? value.sessionKind : null;
  const userId = typeof value.currentSessionUserId === "string" && value.currentSessionUserId ? value.currentSessionUserId : null;
  if (!sessionKind || !userId) return initialSession;
  const provider = value.provider === "email" || value.provider === "google" || value.provider === "kakao" || value.provider === "guest"
    ? value.provider
    : sessionKind === "guest" ? "guest" : "email";
  return {
    sessionKind,
    authStatus: "idle",
    currentSessionUserId: userId,
    provider,
    profileCompleted: Boolean(value.profileCompleted),
    onboardingIntroSeen: Boolean(value.onboardingIntroSeen),
    preferenceTestCompleted: Boolean(value.preferenceTestCompleted),
  };
}

export const useAuthSessionStore = create<AuthSessionState>()(
  persist(
    (set, get) => ({
      ...initialSession,
      isHydrated: false,
      errorMessage: null,
      startSession: (input) => set({ sessionKind: input.sessionKind, provider: input.provider, authStatus: "authenticated", currentSessionUserId: input.userId, profileCompleted: input.profileCompleted, onboardingIntroSeen: input.onboardingIntroSeen, preferenceTestCompleted: input.preferenceTestCompleted, errorMessage: null, isHydrated: true }),
      restoreSession: () => set((state) => ({ isHydrated: true, authStatus: state.sessionKind ? "idle" : "unauthenticated" })),
      markStoredSessionReady: () => set((state) => ({ authStatus: state.sessionKind ? "authenticated" : "unauthenticated", errorMessage: null })),
      setAuthLoading: () => set({ authStatus: "loading", errorMessage: null }),
      setProfileCompleted: (profileCompleted) => set({ profileCompleted }),
      setOnboardingIntroSeen: (onboardingIntroSeen) => set({ onboardingIntroSeen }),
      setPreferenceTestCompleted: (preferenceTestCompleted) => set({ preferenceTestCompleted }),
      setAuthError: (errorMessage) => set({ authStatus: "error", errorMessage }),
      clearAuthError: () => set({ errorMessage: null, authStatus: get().sessionKind ? "authenticated" : "unauthenticated" }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      clearSession: () => set({ ...initialSession, isHydrated: true, errorMessage: null }),
    }),
    {
      name: "duri-auth-session",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: AUTH_SESSION_STORAGE_VERSION,
      migrate: (persistedState) => normalizePersistedAuthSession(persistedState),
      merge: (persistedState, currentState) => ({ ...currentState, ...normalizePersistedAuthSession(persistedState) }),
      // This runs before storage is read. A persisted setter here can overwrite the saved session with initial state.
      onRehydrateStorage: (state) => {
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
        provider: state.provider,
        profileCompleted: state.profileCompleted,
        onboardingIntroSeen: state.onboardingIntroSeen,
        preferenceTestCompleted: state.preferenceTestCompleted,
      }),
    },
  ),
);
