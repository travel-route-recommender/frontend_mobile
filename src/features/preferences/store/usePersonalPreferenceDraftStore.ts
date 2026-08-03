import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PERSONAL_SURVEY_DRAFT_VERSION, preferenceSteps } from "../config/travel-preference-test-config";
import { normalizeTravelPreferenceSurveyAnswers, validateTravelPreferenceSurvey } from "../logic/travel-preference-survey";
import type {
  CompletedPreferenceSurvey,
  PersonalPreferenceDraft,
  PersonalPreferenceDraftAnswers,
  PreferenceDraftOwner,
} from "../types";

export const PREFERENCE_DRAFT_STORAGE_VERSION = 8;
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
  if (value.configVersion !== PERSONAL_SURVEY_DRAFT_VERSION) {
    return { draft: null, notice: "테스트 구성이 새로워져 이전 진행 내용은 안전하게 초기화했어요. 기존 완료 결과는 유지돼요." };
  }
  const owner = normalizeOwner(value.owner);
  if (!owner || typeof value.startedAt !== "string" || typeof value.updatedAt !== "string") return { draft: null, notice: null };
  const maxIndex = Math.max(preferenceSteps.length - 1, 0);
  const rawIndex = typeof value.currentQuestionIndex === "number" && Number.isInteger(value.currentQuestionIndex) ? value.currentQuestionIndex : 0;
  return {
    draft: {
      configVersion: PERSONAL_SURVEY_DRAFT_VERSION,
      owner,
      currentQuestionIndex: Math.max(0, Math.min(rawIndex, maxIndex)),
      answers: normalizeTravelPreferenceSurveyAnswers(value.answers),
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
    },
    notice: null,
  };
}

function normalizeCompletedSurvey(value: unknown): CompletedPreferenceSurvey | null {
  if (!isRecord(value)) return null;
  const owner = normalizeOwner(value.owner);
  if (!owner || typeof value.completedAt !== "string") return null;
  const answers = normalizeTravelPreferenceSurveyAnswers(value.answers);
  if (!validateTravelPreferenceSurvey(answers).valid) return null;
  return { owner, answers, completedAt: value.completedAt };
}

export interface PersonalPreferenceDraftState {
  draft: PersonalPreferenceDraft | null;
  completedSurvey: CompletedPreferenceSurvey | null;
  draftNotice: string | null;
  isHydrated: boolean;
  errorMessage: string | null;
  startTest(owner: PreferenceDraftOwner, startedAt?: string): void;
  updateAnswers(patch: Partial<PersonalPreferenceDraftAnswers>, updatedAt?: string): void;
  goNext(updatedAt?: string): void;
  goPrevious(updatedAt?: string): void;
  goToQuestion(index: number, updatedAt?: string): void;
  resetDraft(): void;
  setCompletedSurvey(result: CompletedPreferenceSurvey | null): void;
  acknowledgeDraftNotice(): void;
  setHydrated(hydrated: boolean): void;
  setError(message: string | null): void;
}

export const usePersonalPreferenceDraftStore = create<PersonalPreferenceDraftState>()(
  persist(
    (set) => ({
      draft: null,
      completedSurvey: null,
      draftNotice: null,
      isHydrated: false,
      errorMessage: null,
      startTest: (owner, startedAt = nowIso()) => set({
        draft: {
          configVersion: PERSONAL_SURVEY_DRAFT_VERSION,
          owner,
          currentQuestionIndex: 0,
          answers: {},
          startedAt,
          updatedAt: startedAt,
        },
      }),
      updateAnswers: (patch, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: {
          ...state.draft,
          answers: { ...state.draft.answers, ...patch },
          updatedAt,
        },
      } : state),
      goNext: (updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: {
          ...state.draft,
          currentQuestionIndex: Math.min(state.draft.currentQuestionIndex + 1, Math.max(preferenceSteps.length - 1, 0)),
          updatedAt,
        },
      } : state),
      goPrevious: (updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: { ...state.draft, currentQuestionIndex: Math.max(state.draft.currentQuestionIndex - 1, 0), updatedAt },
      } : state),
      goToQuestion: (index, updatedAt = nowIso()) => set((state) => state.draft ? {
        draft: {
          ...state.draft,
          currentQuestionIndex: Math.max(0, Math.min(index, Math.max(preferenceSteps.length - 1, 0))),
          updatedAt,
        },
      } : state),
      resetDraft: () => set({ draft: null }),
      setCompletedSurvey: (completedSurvey) => set({ completedSurvey }),
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
        const completedSurvey = normalizeCompletedSurvey(source.completedSurvey);
        return {
          draft: normalized.draft,
          completedSurvey,
          draftNotice: normalized.notice,
        };
      },
      merge: (persistedState, currentState) => {
        const source = isRecord(persistedState) ? persistedState : {};
        const normalized = normalizeDraft(source.draft);
        const completedSurvey = normalizeCompletedSurvey(source.completedSurvey);
        return {
          ...currentState,
          draft: normalized.draft,
          completedSurvey,
          draftNotice: normalized.notice,
        };
      },
      onRehydrateStorage: (state) => {
        state.setHydrated(false);
        state.setError(null);
        return (hydratedState, error) => {
          if (error) hydratedState?.setError("진행 중인 여행 성향 테스트를 불러오지 못했어요.");
          hydratedState?.setHydrated(true);
        };
      },
      partialize: (state) => ({
        draft: state.draft,
        completedSurvey: state.completedSurvey?.owner.kind === "user" ? state.completedSurvey : null,
      }),
    },
  ),
);
