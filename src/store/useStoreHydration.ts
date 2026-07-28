import { useEffect } from "react";
import { useDuriHydrationState, useDuriStore } from "./useDuriStore";

export function useStoreHydration() {
  const isHydrated = useDuriHydrationState((state) => state.isHydrated);
  const hydrationError = useDuriHydrationState((state) => state.hydrationError);

  useEffect(() => {
    void Promise.resolve(useDuriStore.persist.rehydrate()).catch(() => {
      useDuriHydrationState.getState().fail("저장된 여행 정보를 불러오지 못했어요.");
    });
  }, []);

  const error = hydrationError ? new Error(hydrationError) : null;
  return { isHydrated, error, retry: () => useDuriStore.persist.rehydrate() };
}
