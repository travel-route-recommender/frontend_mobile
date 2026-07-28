import { useEffect } from "react";
import { usePersonalPreferenceDraftStore, usePreferenceDraftHydrationState } from "../store/usePersonalPreferenceDraftStore";

export function usePreferenceDraftHydration() {
  const isHydrated = usePreferenceDraftHydrationState((state) => state.isHydrated);
  const hydrationError = usePreferenceDraftHydrationState((state) => state.hydrationError);
  useEffect(() => {
    void Promise.resolve(usePersonalPreferenceDraftStore.persist.rehydrate()).catch(() => {
      usePreferenceDraftHydrationState.getState().fail("진행 중인 테스트를 불러오지 못했어요.");
    });
  }, []);
  return { isHydrated, error: hydrationError ? new Error(hydrationError) : null, retry: () => usePersonalPreferenceDraftStore.persist.rehydrate() };
}
