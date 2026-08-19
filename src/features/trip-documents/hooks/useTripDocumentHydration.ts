import { useEffect } from "react";
import { useTripDocumentHydrationState, useTripDocumentStore } from "../store/useTripDocumentStore";

let hydrationPromise: Promise<void> | undefined;

export function ensureTripDocumentStoreHydrated() {
  if (useTripDocumentStore.persist.hasHydrated() && useTripDocumentHydrationState.getState().isHydrated) {
    useTripDocumentHydrationState.getState().succeed();
    return Promise.resolve();
  }
  if (!hydrationPromise) {
    hydrationPromise = Promise.resolve(useTripDocumentStore.persist.rehydrate())
      .then(() => {
        const hydration = useTripDocumentHydrationState.getState();
        if (useTripDocumentStore.persist.hasHydrated() && hydration.isHydrated) return;
        const message = hydration.hydrationError ?? "저장된 여행 문서 목록을 불러오지 못했어요.";
        hydration.fail(message);
        throw new Error(message);
      })
      .catch((reason: unknown) => {
        useTripDocumentHydrationState.getState().fail("저장된 여행 문서 목록을 불러오지 못했어요.");
        throw reason;
      })
      .finally(() => { hydrationPromise = undefined; });
  }
  return hydrationPromise;
}

export function useTripDocumentHydration() {
  const isHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const hydrationError = useTripDocumentHydrationState((state) => state.hydrationError);

  useEffect(() => {
    void ensureTripDocumentStoreHydrated().catch(() => undefined);
  }, []);

  return {
    isHydrated,
    error: hydrationError ? new Error(hydrationError) : null,
    retry: ensureTripDocumentStoreHydrated,
  };
}
