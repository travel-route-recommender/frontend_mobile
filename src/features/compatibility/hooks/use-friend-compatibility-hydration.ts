import { useEffect, useState } from "react";
import { environment } from "../../../config/environment";
import { useFriendCompatibilityStore } from "../store/use-friend-compatibility-store";

export function useFriendCompatibilityHydration() {
  const enabled = environment.dataSource === "mock";
  const isHydrated = useFriendCompatibilityStore((state) => state.isHydrated);
  const errorMessage = useFriendCompatibilityStore((state) => state.errorMessage);
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);
  useEffect(() => {
    if (!enabled) return;
    void Promise.resolve(useFriendCompatibilityStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("저장한 친구 목록을 불러오지 못했어요."));
      useFriendCompatibilityStore.getState().setHydrated(true);
    });
  }, [enabled]);
  return {
    isHydrated: enabled ? isHydrated : true,
    error: enabled && errorMessage ? new Error(errorMessage) : enabled ? rehydrationError : null,
    retry: () => enabled ? useFriendCompatibilityStore.persist.rehydrate() : Promise.resolve(),
  };
}
