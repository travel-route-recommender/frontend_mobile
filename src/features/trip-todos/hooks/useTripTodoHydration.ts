import { useEffect } from "react";
import { useTripTodoHydrationState, useTripTodoStore } from "../store/useTripTodoStore";

let hydrationPromise: Promise<void> | undefined;

export function ensureTripTodoStoreHydrated() {
  if (useTripTodoStore.persist.hasHydrated() && useTripTodoHydrationState.getState().isHydrated) {
    useTripTodoHydrationState.getState().succeed();
    return Promise.resolve();
  }
  if (!hydrationPromise) {
    hydrationPromise = Promise.resolve(useTripTodoStore.persist.rehydrate())
      .then(() => {
        const hydration = useTripTodoHydrationState.getState();
        if (useTripTodoStore.persist.hasHydrated() && hydration.isHydrated) return;
        const message = hydration.hydrationError ?? "저장된 TODO를 불러오지 못했어요. 일정표는 그대로 사용할 수 있어요.";
        hydration.fail(message);
        throw new Error(message);
      })
      .catch((reason: unknown) => {
        useTripTodoHydrationState.getState().fail("저장된 TODO를 불러오지 못했어요. 일정표는 그대로 사용할 수 있어요.");
        throw reason;
      })
      .finally(() => { hydrationPromise = undefined; });
  }
  return hydrationPromise;
}

export function useTripTodoHydration() {
  const isHydrated = useTripTodoHydrationState((state) => state.isHydrated);
  const hydrationError = useTripTodoHydrationState((state) => state.hydrationError);
  useEffect(() => { void ensureTripTodoStoreHydrated().catch(() => undefined); }, []);
  return {
    isHydrated,
    error: hydrationError ? new Error(hydrationError) : null,
    retry: ensureTripTodoStoreHydrated,
  };
}
