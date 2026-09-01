import { useCallback } from "react";
import { queryClient } from "../../../query/queryClient";
import { useDuriStore } from "../../../store/useDuriStore";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";
import type { AuthSuccess } from "../types";
import { authService } from "../services/authService";
import { activateLocalPrivateDataForUser, deactivateLocalPrivateData, transferLocalPrivateDataForVerifiedUpgrade } from "../services/localPrivateData";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export async function applyAuthSuccessToStores(
  result: AuthSuccess,
  options?: { verifiedGuestUpgrade?: boolean },
) {
  const previousUserId = useAuthSessionStore.getState().currentSessionUserId;
  // 같은 ID의 guest→member 전환도 응답 권한과 사용자별 overlay가 달라질 수 있다.
  queryClient.removeQueries({ queryKey: ["trips"] });
  useDuriAnalysisStore.getState().clearAll();
  if (options?.verifiedGuestUpgrade && previousUserId) {
    await transferLocalPrivateDataForVerifiedUpgrade(previousUserId, result.user.id);
  } else {
    await activateLocalPrivateDataForUser(result.user.id);
  }
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
  deactivateLocalPrivateData();
  useAuthSessionStore.getState().clearSession();
  useDuriStore.getState().setCurrentUser(null);
  useDuriAnalysisStore.getState().clearAll();
  queryClient.clear();
}

export function useAuthFlow() {
  const applyAuthSuccess = useCallback(async (result: AuthSuccess, options?: { verifiedGuestUpgrade?: boolean }) => {
    await applyAuthSuccessToStores(result, options);
  }, []);

  const logout = useCallback(async () => {
    useAuthSessionStore.getState().setAuthLoading();
    try { await authService.logout(); } finally { clearAuthStores(); }
  }, []);

  return { applyAuthSuccess, logout };
}
