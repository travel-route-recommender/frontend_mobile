import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CREATE_TRIP_DRAFT_VERSION, CREATE_TRIP_STEP_COUNT } from "../types";
import type { CreateTripDraft, CreateTripDraftPatch, CreateTripStep, TripCompanionType } from "../types";
import { getRegionSelectionPatch } from "../logic/tripDraftEditing";

export const CREATE_TRIP_DRAFT_STORAGE_KEY = "duri-create-trip-draft";
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();

export function createEmptyTripDraft(ownerUserId: string, startedAt = nowIso()): CreateTripDraft {
  return {
    configVersion: CREATE_TRIP_DRAFT_VERSION,
    ownerUserId,
    currentStep: 0,
    regionId: "",
    startDate: null,
    endDate: null,
    dateUndecided: false,
    transport: "public",
    budgetLevel: "standard",
    intensity: "balanced",
    companionType: null,
    expectedMemberCount: null,
    selectedMemberUserIds: [],
    roomName: "",
    isRoomNameCustomized: false,
    startedAt,
    updatedAt: startedAt,
  };
}

function normalizeDraft(value: unknown): { draft: CreateTripDraft | null; notice: string | null } {
  if (!isRecord(value)) return { draft: null, notice: null };
  if (value.configVersion !== 1 && value.configVersion !== CREATE_TRIP_DRAFT_VERSION) return { draft: null, notice: "여행방 생성 방식이 변경되어 이전 초안을 초기화했어요." };
  if (typeof value.ownerUserId !== "string" || !value.ownerUserId || typeof value.startedAt !== "string" || typeof value.updatedAt !== "string") return { draft: null, notice: null };
  const rawStep = typeof value.currentStep === "number" && Number.isInteger(value.currentStep) ? value.currentStep : 0;
  const dateUndecided = value.dateUndecided === true;
  const legacyRoomName = typeof value.title === "string" ? value.title : "";
  const roomName = (typeof value.roomName === "string" ? value.roomName : legacyRoomName).slice(0, 40);
  const companionTypes: TripCompanionType[] = ["friends", "family", "couple", "group", "undecided"];
  const companionType = companionTypes.includes(value.companionType as TripCompanionType) ? value.companionType as TripCompanionType : null;
  const expectedMemberCount = typeof value.expectedMemberCount === "number" && Number.isInteger(value.expectedMemberCount) && value.expectedMemberCount > 0
    ? value.expectedMemberCount
    : null;
  return {
    draft: {
      configVersion: CREATE_TRIP_DRAFT_VERSION,
      ownerUserId: value.ownerUserId,
      currentStep: Math.max(0, Math.min(rawStep, CREATE_TRIP_STEP_COUNT - 1)) as CreateTripStep,
      regionId: typeof value.regionId === "string" ? value.regionId : "",
      startDate: dateUndecided ? null : typeof value.startDate === "string" && value.startDate ? value.startDate : null,
      endDate: dateUndecided ? null : typeof value.endDate === "string" && value.endDate ? value.endDate : null,
      dateUndecided,
      transport: value.transport === "car" || value.transport === "walking" ? value.transport : "public",
      budgetLevel: value.budgetLevel === "budget" || value.budgetLevel === "premium" ? value.budgetLevel : "standard",
      intensity: value.intensity === "relaxed" || value.intensity === "packed" ? value.intensity : "balanced",
      companionType,
      expectedMemberCount,
      selectedMemberUserIds: Array.isArray(value.selectedMemberUserIds) ? [...new Set(value.selectedMemberUserIds.filter((item): item is string => typeof item === "string" && Boolean(item)))] : [],
      roomName,
      isRoomNameCustomized: typeof value.isRoomNameCustomized === "boolean" ? value.isRoomNameCustomized : Boolean(legacyRoomName),
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
  setRegion(regionId: string, regionName: string, updatedAt?: string): void;
  setDateRange(startDate: string | null, endDate: string | null, updatedAt?: string): void;
  setDateUndecided(value: boolean, updatedAt?: string): void;
  setCompanionType(value: TripCompanionType, updatedAt?: string): void;
  setExpectedMemberCount(value: number | null, updatedAt?: string): void;
  setRoomName(value: string, updatedAt?: string): void;
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
      setRegion: (regionId, regionName, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, ...getRegionSelectionPatch(state.draft, regionId, regionName), updatedAt },
      } : state),
      setDateRange: (startDate, endDate, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, startDate, endDate, dateUndecided: false, updatedAt },
      } : state),
      setDateUndecided: (value, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, dateUndecided: value, ...(value ? { startDate: null, endDate: null } : {}), updatedAt },
      } : state),
      setCompanionType: (companionType, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, companionType, updatedAt },
      } : state),
      setExpectedMemberCount: (expectedMemberCount, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, expectedMemberCount, updatedAt },
      } : state),
      setRoomName: (roomName, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, roomName: roomName.slice(0, 40), isRoomNameCustomized: true, updatedAt },
      } : state),
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
