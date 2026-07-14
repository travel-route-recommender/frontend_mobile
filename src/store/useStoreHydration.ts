import { useEffect, useState } from "react";
import { useDuriStore } from "./useDuriStore";

export function useStoreHydration() {
  const [isHydrated, setIsHydrated] = useState(useDuriStore.persist.hasHydrated());
  const [rehydrationError, setRehydrationError] = useState<Error | null>(null);
  const hydrationError = useDuriStore((state) => state.hydrationError);

  useEffect(() => {
    const unsubscribeHydrate = useDuriStore.persist.onHydrate(() => { setIsHydrated(false); setRehydrationError(null); });
    const unsubscribeFinish = useDuriStore.persist.onFinishHydration(() => setIsHydrated(true));
    void Promise.resolve(useDuriStore.persist.rehydrate()).catch((reason: unknown) => {
      setRehydrationError(reason instanceof Error ? reason : new Error("저장된 여행 정보를 불러오지 못했어요."));
    });
    return () => { unsubscribeHydrate(); unsubscribeFinish(); };
  }, []);

  const error = hydrationError ? new Error(hydrationError) : rehydrationError;
  return { isHydrated, error, retry: () => useDuriStore.persist.rehydrate() };
}
