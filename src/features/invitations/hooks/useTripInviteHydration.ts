import { useEffect } from "react";
import { useTripInviteHydrationState, useTripInviteStore } from "../store/useTripInviteStore";

export function useTripInviteHydration() {
  const isHydrated = useTripInviteHydrationState((state) => state.isHydrated);
  const hydrationError = useTripInviteHydrationState((state) => state.hydrationError);

  useEffect(() => {
    void Promise.resolve(useTripInviteStore.persist.rehydrate()).catch(() => {
      useTripInviteHydrationState.getState().fail("저장된 초대 링크를 불러오지 못했어요.");
    });
  }, []);

  return {
    isHydrated,
    error: hydrationError ? new Error(hydrationError) : null,
    retry: () => useTripInviteStore.persist.rehydrate(),
  };
}
