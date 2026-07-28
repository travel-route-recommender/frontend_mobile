import { useEffect } from "react";
import { useCreateTripDraftHydrationState, useCreateTripDraftStore } from "../store/useCreateTripDraftStore";

export function useCreateTripDraftHydration() {
  const isHydrated = useCreateTripDraftHydrationState((state) => state.isHydrated);
  const hydrationError = useCreateTripDraftHydrationState((state) => state.hydrationError);
  useEffect(() => {
    void Promise.resolve(useCreateTripDraftStore.persist.rehydrate()).catch(() => {
      useCreateTripDraftHydrationState.getState().fail("진행 중인 여행방 초안을 불러오지 못했어요.");
    });
  }, []);
  return { isHydrated, error: hydrationError ? new Error(hydrationError) : null, retry: () => useCreateTripDraftStore.persist.rehydrate() };
}
