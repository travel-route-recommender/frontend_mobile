import { useCallback, useEffect, useState } from "react";
import { environment } from "../../../config/environment";
import { authService, setSessionInvalidatedHandler } from "../services/authService";
import { useAuthSessionStore } from "../store/useAuthSessionStore";
import { clearAuthStores } from "./useAuthFlow";

export function useAuthSessionBootstrap(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [isReady, setReady] = useState(environment.dataSource === "mock");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setSessionInvalidatedHandler(clearAuthStores);
    return () => setSessionInvalidatedHandler(undefined);
  }, []);

  useEffect(() => {
    if (!enabled || environment.dataSource === "mock") return;
    let cancelled = false;
    const bootstrap = async () => {
      await Promise.resolve();
      if (cancelled) return undefined;
      setReady(false);
      setError(null);
      useAuthSessionStore.getState().setAuthLoading();
      const hasStoredCredential = await authService.hasStoredSession();
      const state = useAuthSessionStore.getState();
      const hasStoredUiSession =
        (state.sessionKind === "member" || state.sessionKind === "guest") &&
        Boolean(state.currentSessionUserId);
      if (!hasStoredCredential || !hasStoredUiSession) {
        await authService.clearLocalCredentials();
        clearAuthStores();
        return;
      }
      // Access Token은 복원하지 않는다. 첫 보호 API가 필요할 때 Refresh한다.
      useAuthSessionStore.getState().markStoredSessionReady();
    };
    void bootstrap().then(() => {
      if (cancelled) return;
      setReady(true);
    }).catch((reason: unknown) => {
      if (cancelled) return;
      const next = reason instanceof Error ? reason : new Error("로그인 상태를 확인하지 못했어요.");
      useAuthSessionStore.getState().setAuthError(next.message);
      setError(next);
    });
    return () => { cancelled = true; };
  }, [attempt, enabled]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { isReady, error, retry };
}
