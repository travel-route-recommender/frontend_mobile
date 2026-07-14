import { useEffect, useState } from "react";
import { useCreateTripDraftStore } from "../store/useCreateTripDraftStore";

export function useCreateTripDraftHydration() {
  const isHydrated = useCreateTripDraftStore((state) => state.isHydrated);
  const errorMessage = useCreateTripDraftStore((state) => state.errorMessage);
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);
  useEffect(() => {
    void Promise.resolve(useCreateTripDraftStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("진행 중인 여행방 초안을 불러오지 못했어요."));
      useCreateTripDraftStore.getState().setHydrated(true);
    });
  }, []);
  return { isHydrated, error: errorMessage ? new Error(errorMessage) : rehydrationError, retry: () => useCreateTripDraftStore.persist.rehydrate() };
}

