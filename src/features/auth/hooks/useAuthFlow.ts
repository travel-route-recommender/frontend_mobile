import { useCallback } from "react";
import { useDuriStore } from "../../../store/useDuriStore";
import type { AuthSuccess } from "../types";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function useAuthFlow() {
  const upsertUser = useDuriStore((state) => state.upsertUser);
  const setCurrentUser = useDuriStore((state) => state.setCurrentUser);
  const addTripMember = useDuriStore((state) => state.addTripMember);
  const startAnonymousSession = useAuthSessionStore((state) => state.startAnonymousSession);
  const startMockMemberSession = useAuthSessionStore((state) => state.startMockMemberSession);
  const startMockGuestSession = useAuthSessionStore((state) => state.startMockGuestSession);
  const logoutSession = useAuthSessionStore((state) => state.logout);

  const applyAuthSuccess = useCallback((result: AuthSuccess) => {
    upsertUser(result.user);
    setCurrentUser(result.user.id);
    if (result.invitedTripId) addTripMember(result.invitedTripId, result.user.id);
    const input = { userId: result.user.id, profileCompleted: result.profileCompleted, onboardingIntroSeen: result.onboardingIntroSeen, preferenceTestCompleted: result.preferenceTestCompleted };
    if (result.sessionKind === "member") startMockMemberSession(input);
    else startMockGuestSession(input);
  }, [addTripMember, setCurrentUser, startMockGuestSession, startMockMemberSession, upsertUser]);

  const browseAnonymously = useCallback(() => {
    setCurrentUser(null);
    startAnonymousSession();
  }, [setCurrentUser, startAnonymousSession]);

  const logout = useCallback(async () => {
    await logoutSession();
    setCurrentUser(null);
  }, [logoutSession, setCurrentUser]);

  return { applyAuthSuccess, browseAnonymously, logout };
}
