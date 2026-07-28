import { useCallback } from "react";
import { queryClient } from "../../../query/queryClient";
import { useDuriStore } from "../../../store/useDuriStore";
import type { AuthSuccess } from "../types";
import { authService } from "../services/authService";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function applyAuthSuccessToStores(result: AuthSuccess) {
  const domain = useDuriStore.getState();
  domain.upsertUser(result.user);
  domain.setCurrentUser(result.user.id);
  if (result.invitedTripId && domain.tripsById[result.invitedTripId]) domain.addTripMember(result.invitedTripId, result.user.id);
  useAuthSessionStore.getState().startSession({
    userId: result.user.id,
    sessionKind: result.sessionKind,
    provider: result.provider,
    profileCompleted: result.profileCompleted,
    onboardingIntroSeen: result.onboardingIntroSeen,
    preferenceTestCompleted: result.preferenceTestCompleted,
  });
}

export function clearAuthStores() {
  useAuthSessionStore.getState().clearSession();
  useDuriStore.getState().setCurrentUser(null);
  queryClient.clear();
}

export function useAuthFlow() {
  const applyAuthSuccess = useCallback((result: AuthSuccess) => {
    applyAuthSuccessToStores(result);
  }, []);

  const logout = useCallback(async () => {
    useAuthSessionStore.getState().setAuthLoading();
    try { await authService.logout(); } finally { clearAuthStores(); }
  }, []);

  return { applyAuthSuccess, logout };
}
