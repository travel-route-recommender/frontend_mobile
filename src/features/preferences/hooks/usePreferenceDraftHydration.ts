import { useEffect, useState } from "react";
import { usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";

export function usePreferenceDraftHydration() {
  const isHydrated = usePersonalPreferenceDraftStore((state) => state.isHydrated);
  const errorMessage = usePersonalPreferenceDraftStore((state) => state.errorMessage);
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);
  useEffect(() => {
    void Promise.resolve(usePersonalPreferenceDraftStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("진행 중인 테스트를 불러오지 못했어요."));
      usePersonalPreferenceDraftStore.getState().setHydrated(true);
    });
  }, []);
  return { isHydrated, error: errorMessage ? new Error(errorMessage) : rehydrationError, retry: () => usePersonalPreferenceDraftStore.persist.rehydrate() };
}
