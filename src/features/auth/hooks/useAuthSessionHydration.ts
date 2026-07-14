import { useEffect, useState } from "react";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function useAuthSessionHydration() {
  const isHydrated = useAuthSessionStore((state) => state.isHydrated);
  const errorMessage = useAuthSessionStore((state) => state.errorMessage);
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);

  useEffect(() => {
    void Promise.resolve(useAuthSessionStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("로그인 상태를 불러오지 못했어요."));
      useAuthSessionStore.getState().setHydrated(true);
    });
  }, []);

  return {
    isHydrated,
    error: errorMessage ? new Error(errorMessage) : rehydrationError,
    retry: () => useAuthSessionStore.persist.rehydrate(),
  };
}
