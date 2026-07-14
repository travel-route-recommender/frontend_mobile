import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import { CREATE_TRIP_DRAFT_VERSION, CREATE_TRIP_STEP_COUNT } from "../types";
import type { CreateTripDraft, CreateTripDraftPatch, CreateTripStep } from "../types";

export const CREATE_TRIP_DRAFT_STORAGE_KEY = "duri-create-trip-draft";
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();

function defaultDateRange(now = new Date()) {
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  return { startDate: dateToDateOnly(now), endDate: dateToDateOnly(end) };
}

export function createEmptyTripDraft(ownerUserId: string, startedAt = nowIso()): CreateTripDraft {
  const dates = defaultDateRange();
  return {
    configVersion: CREATE_TRIP_DRAFT_VERSION,
    ownerUserId,
    currentStep: 0,
    regionId: "",
    ...dates,
    transport: "public",
    budgetLevel: "standard",
    intensity: "balanced",
    selectedMemberUserIds: [],
    title: "",
    startedAt,
    updatedAt: startedAt,
  };
}

function normalizeDraft(value: unknown): { draft: CreateTripDraft | null; notice: string | null } {
  if (!isRecord(value)) return { draft: null, notice: null };
  if (value.configVersion !== CREATE_TRIP_DRAFT_VERSION) return { draft: null, notice: "여행방 생성 방식이 변경되어 이전 초안을 초기화했어요." };
  if (typeof value.ownerUserId !== "string" || !value.ownerUserId || typeof value.startedAt !== "string" || typeof value.updatedAt !== "string") return { draft: null, notice: null };
  const rawStep = typeof value.currentStep === "number" && Number.isInteger(value.currentStep) ? value.currentStep : 0;
  return {
    draft: {
      configVersion: CREATE_TRIP_DRAFT_VERSION,
      ownerUserId: value.ownerUserId,
      currentStep: Math.max(0, Math.min(rawStep, CREATE_TRIP_STEP_COUNT - 1)) as CreateTripStep,
      regionId: typeof value.regionId === "string" ? value.regionId : "",
      startDate: typeof value.startDate === "string" ? value.startDate : "",
      endDate: typeof value.endDate === "string" ? value.endDate : "",
      transport: value.transport === "car" || value.transport === "walking" ? value.transport : "public",
      budgetLevel: value.budgetLevel === "budget" || value.budgetLevel === "premium" ? value.budgetLevel : "standard",
      intensity: value.intensity === "relaxed" || value.intensity === "packed" ? value.intensity : "balanced",
      selectedMemberUserIds: Array.isArray(value.selectedMemberUserIds) ? [...new Set(value.selectedMemberUserIds.filter((item): item is string => typeof item === "string" && Boolean(item)))] : [],
      title: typeof value.title === "string" ? value.title.slice(0, 40) : "",
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
    },
    notice: null,
  };
}

interface CreateTripDraftState {
  draft: CreateTripDraft | null;
  draftNotice: string | null;
  isHydrated: boolean;
  errorMessage: string | null;
  startDraft(ownerUserId: string, startedAt?: string): void;
  updateDraft(patch: CreateTripDraftPatch, updatedAt?: string): void;
  toggleMember(userId: string, updatedAt?: string): void;
  goNext(updatedAt?: string): void;
  goPrevious(updatedAt?: string): void;
  goToStep(step: CreateTripStep, updatedAt?: string): void;
  resetDraft(): void;
  acknowledgeDraftNotice(): void;
  setHydrated(value: boolean): void;
  setError(message: string | null): void;
}

export const useCreateTripDraftStore = create<CreateTripDraftState>()(
  persist(
    (set) => ({
      draft: null,
      draftNotice: null,
      isHydrated: false,
      errorMessage: null,
      startDraft: (ownerUserId, startedAt = nowIso()) => set({ draft: createEmptyTripDraft(ownerUserId, startedAt) }),
      updateDraft: (patch, updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, ...patch, updatedAt } } : state),
      toggleMember: (userId, updatedAt = nowIso()) => set((state) => {
        if (!state.draft || userId === state.draft.ownerUserId) return state;
        const selected = state.draft.selectedMemberUserIds.includes(userId)
          ? state.draft.selectedMemberUserIds.filter((id) => id !== userId)
          : [...state.draft.selectedMemberUserIds, userId];
        return { draft: { ...state.draft, selectedMemberUserIds: selected, updatedAt } };
      }),
      goNext: (updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentStep: Math.min(state.draft.currentStep + 1, CREATE_TRIP_STEP_COUNT - 1) as CreateTripStep, updatedAt } } : state),
      goPrevious: (updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentStep: Math.max(state.draft.currentStep - 1, 0) as CreateTripStep, updatedAt } } : state),
      goToStep: (step, updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentStep: Math.max(0, Math.min(step, CREATE_TRIP_STEP_COUNT - 1)) as CreateTripStep, updatedAt } } : state),
      resetDraft: () => set({ draft: null }),
      acknowledgeDraftNotice: () => set({ draftNotice: null }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      setError: (errorMessage) => set({ errorMessage }),
    }),
    {
      name: CREATE_TRIP_DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: CREATE_TRIP_DRAFT_VERSION,
      migrate: (persistedState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        const normalized = normalizeDraft(source.draft);
        return { draft: normalized.draft, draftNotice: normalized.notice };
      },
      merge: (persistedState, currentState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        const normalized = normalizeDraft(source.draft);
        return { ...currentState, draft: normalized.draft, draftNotice: normalized.notice };
      },
      onRehydrateStorage: (state) => {
        state.setHydrated(false);
        state.setError(null);
        return (hydratedState, error) => {
          if (error) hydratedState?.setError("진행 중인 여행방 초안을 불러오지 못했어요.");
          hydratedState?.setHydrated(true);
        };
      },
      partialize: (state) => ({ draft: state.draft }),
    },
  ),
);

