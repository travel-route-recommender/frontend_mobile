import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createPersistHydrationStore } from "../../../store/createPersistHydrationStore";
import { CREATE_TRIP_DRAFT_VERSION, CREATE_TRIP_STEP_COUNT } from "../types";
import type { CreateTripDraft, CreateTripDraftPatch, CreateTripEndConditionDraft, CreateTripStep, TripCompanionType } from "../types";
import { getRegionSelectionPatch } from "../logic/tripDraftEditing";

export const CREATE_TRIP_DRAFT_STORAGE_KEY = "duri-create-trip-draft";
type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();
const endConditionTypes: CreateTripEndConditionDraft["type"][] = ["train", "intercity-bus", "rental-car-return", "other"];
const asLimitedString = (value: unknown, maxLength: number) => typeof value === "string" ? value.slice(0, maxLength) : "";

function normalizeEndCondition(value: unknown): CreateTripEndConditionDraft | null {
  if (!isRecord(value) || !endConditionTypes.includes(value.type as CreateTripEndConditionDraft["type"])) return null;
  return {
    type: value.type as CreateTripEndConditionDraft["type"],
    location: asLimitedString(value.location, 100),
    deadline: asLimitedString(value.deadline, 5),
    travelMinutes: asLimitedString(value.travelMinutes, 4),
    serviceBufferMinutes: asLimitedString(value.serviceBufferMinutes, 3),
    note: asLimitedString(value.note, 300),
  };
}

export function createEmptyTripDraft(ownerUserId: string, startedAt = nowIso()): CreateTripDraft {
  return {
    configVersion: CREATE_TRIP_DRAFT_VERSION,
    ownerUserId,
    currentStep: 0,
    regionId: "",
    startDate: null,
    endDate: null,
    dateUndecided: false,
    transport: null,
    accommodationLocation: "",
    endCondition: null,
    companionType: null,
    expectedMemberCount: null,
    selectedMemberUserIds: [],
    roomName: "",
    isRoomNameCustomized: false,
    startedAt,
    updatedAt: startedAt,
  };
}

export function normalizeCreateTripDraft(value: unknown): { draft: CreateTripDraft | null; notice: string | null } {
  if (!isRecord(value)) return { draft: null, notice: null };
  if (value.configVersion !== 1 && value.configVersion !== 2 && value.configVersion !== CREATE_TRIP_DRAFT_VERSION) return { draft: null, notice: "여행방 생성 방식이 변경되어 이전 초안을 초기화했어요." };
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
  const legacyDraft = value.configVersion !== CREATE_TRIP_DRAFT_VERSION;
  const transport = value.transport === "car"
    ? "car"
    : value.transport === "public" || value.transport === "walking"
      ? "public"
      : legacyDraft
        ? "public"
        : null;
  const endCondition = dateUndecided ? null : normalizeEndCondition(value.endCondition);
  return {
    draft: {
      configVersion: CREATE_TRIP_DRAFT_VERSION,
      ownerUserId: value.ownerUserId,
      currentStep: Math.max(0, Math.min(rawStep, CREATE_TRIP_STEP_COUNT - 1)) as CreateTripStep,
      regionId: typeof value.regionId === "string" ? value.regionId : "",
      startDate: dateUndecided ? null : typeof value.startDate === "string" && value.startDate ? value.startDate : null,
      endDate: dateUndecided ? null : typeof value.endDate === "string" && value.endDate ? value.endDate : null,
      dateUndecided,
      transport,
      accommodationLocation: asLimitedString(value.accommodationLocation, 100),
      endCondition,
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
}

export const useCreateTripDraftHydrationState = createPersistHydrationStore();

export const useCreateTripDraftStore = create<CreateTripDraftState>()(
  persist(
    (set) => ({
      draft: null,
      draftNotice: null,
      startDraft: (ownerUserId, startedAt = nowIso()) => set({ draft: createEmptyTripDraft(ownerUserId, startedAt) }),
      updateDraft: (patch, updatedAt = nowIso()) => set((state) => {
        if (!state.draft) return state;
        const draft = { ...state.draft, ...patch, updatedAt };
        return { draft: draft.dateUndecided ? { ...draft, endCondition: null } : draft };
      }),
      setRegion: (regionId, regionName, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, ...getRegionSelectionPatch(state.draft, regionId, regionName), updatedAt },
      } : state),
      setDateRange: (startDate, endDate, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, startDate, endDate, dateUndecided: false, updatedAt },
      } : state),
      setDateUndecided: (value, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, dateUndecided: value, ...(value ? { startDate: null, endDate: null, endCondition: null } : {}), updatedAt },
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
    }),
    {
      name: CREATE_TRIP_DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: CREATE_TRIP_DRAFT_VERSION,
      migrate: (persistedState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        const normalized = normalizeCreateTripDraft(source.draft);
        return { draft: normalized.draft, draftNotice: normalized.notice };
      },
      merge: (persistedState, currentState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        const normalized = normalizeCreateTripDraft(source.draft);
        return { ...currentState, draft: normalized.draft, draftNotice: normalized.notice };
      },
      onRehydrateStorage: () => {
        useCreateTripDraftHydrationState.getState().begin();
        return (_hydratedState, error) => {
          if (error) {
            useCreateTripDraftHydrationState.getState().fail("진행 중인 여행방 초안을 불러오지 못했어요.");
            return;
          }
          useCreateTripDraftHydrationState.getState().succeed();
        };
      },
      partialize: (state) => ({ draft: state.draft }),
    },
  ),
);
