import { create } from "zustand";

export type PersistHydrationState = {
  isHydrated: boolean;
  hydrationError: string | null;
  begin(): void;
  succeed(): void;
  fail(message: string): void;
};

/**
 * Persist 대상과 hydration 진행 상태를 분리한다.
 * rehydrate 전에 flag를 바꿔 빈 도메인 상태가 storage에 저장되는 일을 막는다.
 */
export function createPersistHydrationStore() {
  return create<PersistHydrationState>((set) => ({
    isHydrated: false,
    hydrationError: null,
    begin: () => set({ isHydrated: false, hydrationError: null }),
    succeed: () => set({ isHydrated: true, hydrationError: null }),
    fail: (hydrationError) => set({ isHydrated: false, hydrationError }),
  }));
}
