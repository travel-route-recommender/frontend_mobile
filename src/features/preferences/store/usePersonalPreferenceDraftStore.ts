import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PreferenceDimension, PreferenceScore } from "../../../domain";
import { PERSONAL_TEST_VERSION, personalTestQuestions } from "../../../duri/preferences";
import { normalizePreferenceDraftAnswers } from "../logic/validatePreferenceAnswers";
import type { PersonalPreferenceDraft, PreferenceDraftOwner, PreferencePreviewResult } from "../types";

export const PREFERENCE_DRAFT_STORAGE_VERSION = 1;
export const PREFERENCE_DRAFT_STORAGE_KEY = "duri-personal-preference-draft";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();

export function isSameDraftOwner(left: PreferenceDraftOwner, right: PreferenceDraftOwner) {
  return left.kind === right.kind && (left.kind === "anonymous" || (right.kind === "user" && left.userId === right.userId));
}

function normalizeOwner(value: unknown): PreferenceDraftOwner | null {
  if (!isRecord(value)) return null;
  if (value.kind === "anonymous") return { kind: "anonymous" };
  if (value.kind === "user" && typeof value.userId === "string" && value.userId) return { kind: "user", userId: value.userId };
  return null;
}

function normalizeDraft(value: unknown): { draft: PersonalPreferenceDraft | null; notice: string | null } {
  if (!isRecord(value)) return { draft: null, notice: null };
  if (value.configVersion !== PERSONAL_TEST_VERSION) return { draft: null, notice: "문항이 변경되어 이전 진행 내용은 안전하게 초기화했어요. 기존 완료 결과는 유지돼요." };
  const owner = normalizeOwner(value.owner);
  if (!owner || typeof value.startedAt !== "string" || typeof value.updatedAt !== "string") return { draft: null, notice: null };
  const maxIndex = Math.max(personalTestQuestions.length - 1, 0);
  const rawIndex = typeof value.currentQuestionIndex === "number" && Number.isInteger(value.currentQuestionIndex) ? value.currentQuestionIndex : 0;
  return {
    draft: {
      configVersion: PERSONAL_TEST_VERSION,
      owner,
      currentQuestionIndex: Math.max(0, Math.min(rawIndex, maxIndex)),
      answers: normalizePreferenceDraftAnswers(value.answers),
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
    },
    notice: null,
  };
}

export interface PersonalPreferenceDraftState {
  draft: PersonalPreferenceDraft | null;
  anonymousResult: PreferencePreviewResult | null;
  draftNotice: string | null;
  isHydrated: boolean;
  errorMessage: string | null;
  startTest(owner: PreferenceDraftOwner, startedAt?: string): void;
  selectAnswer(dimension: PreferenceDimension, value: PreferenceScore, updatedAt?: string): void;
  goNext(updatedAt?: string): void;
  goPrevious(updatedAt?: string): void;
  goToQuestion(index: number, updatedAt?: string): void;
  resetDraft(): void;
  setAnonymousResult(result: PreferencePreviewResult | null): void;
  acknowledgeDraftNotice(): void;
  setHydrated(hydrated: boolean): void;
  setError(message: string | null): void;
}

export const usePersonalPreferenceDraftStore = create<PersonalPreferenceDraftState>()(
  persist(
    (set) => ({
      draft: null,
      anonymousResult: null,
      draftNotice: null,
      isHydrated: false,
      errorMessage: null,
      startTest: (owner, startedAt = nowIso()) => set({ draft: { configVersion: PERSONAL_TEST_VERSION, owner, currentQuestionIndex: 0, answers: {}, startedAt, updatedAt: startedAt } }),
      selectAnswer: (dimension, value, updatedAt = nowIso()) => set((state) => {
        if (!state.draft) return state;
        const question = personalTestQuestions.find((entry) => entry.dimension === dimension);
        if (!question?.choices.some((choice) => choice.value === value)) return state;
        return { draft: { ...state.draft, answers: { ...state.draft.answers, [dimension]: value }, updatedAt } };
      }),
      goNext: (updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentQuestionIndex: Math.min(state.draft.currentQuestionIndex + 1, Math.max(personalTestQuestions.length - 1, 0)), updatedAt } } : state),
      goPrevious: (updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentQuestionIndex: Math.max(state.draft.currentQuestionIndex - 1, 0), updatedAt } } : state),
      goToQuestion: (index, updatedAt = nowIso()) => set((state) => state.draft ? { draft: { ...state.draft, currentQuestionIndex: Math.max(0, Math.min(index, Math.max(personalTestQuestions.length - 1, 0))), updatedAt } } : state),
      resetDraft: () => set({ draft: null }),
      setAnonymousResult: (anonymousResult) => set({ anonymousResult }),
      acknowledgeDraftNotice: () => set({ draftNotice: null }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      setError: (errorMessage) => set({ errorMessage }),
    }),
    {
      name: PREFERENCE_DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: PREFERENCE_DRAFT_STORAGE_VERSION,
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
        state.setHydrated(false); state.setError(null);
        return (hydratedState, error) => {
          if (error) hydratedState?.setError("진행 중인 여행 성향 테스트를 불러오지 못했어요.");
          hydratedState?.setHydrated(true);
        };
      },
      partialize: (state) => ({ draft: state.draft }),
    },
  ),
);
