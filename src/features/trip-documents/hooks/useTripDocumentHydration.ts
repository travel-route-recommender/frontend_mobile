import { useEffect } from "react";
import { useTripDocumentHydrationState, useTripDocumentStore } from "../store/useTripDocumentStore";

export function useTripDocumentHydration() {
  const isHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const hydrationError = useTripDocumentHydrationState((state) => state.hydrationError);

  useEffect(() => {
    void Promise.resolve(useTripDocumentStore.persist.rehydrate()).catch(() => {
      useTripDocumentHydrationState.getState().fail("저장된 여행 문서 목록을 불러오지 못했어요.");
    });
  }, []);

  return {
    isHydrated,
    error: hydrationError ? new Error(hydrationError) : null,
    retry: () => useTripDocumentStore.persist.rehydrate(),
  };
}
