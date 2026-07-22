import { useEffect, useState } from "react";
import { useFriendCompatibilityStore } from "../store/use-friend-compatibility-store";

export function useFriendCompatibilityHydration() {
  const isHydrated = useFriendCompatibilityStore((state) => state.isHydrated);
  const errorMessage = useFriendCompatibilityStore((state) => state.errorMessage);
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);
  useEffect(() => {
    void Promise.resolve(useFriendCompatibilityStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("저장한 친구 목록을 불러오지 못했어요."));
      useFriendCompatibilityStore.getState().setHydrated(true);
    });
  }, []);
  return {
    isHydrated,
    error: errorMessage ? new Error(errorMessage) : rehydrationError,
    retry: () => useFriendCompatibilityStore.persist.rehydrate(),
  };
}
