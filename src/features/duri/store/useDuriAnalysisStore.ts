import { create } from "zustand";
import type { DuriAnalysisSession, DuriSuggestionApplyReceipt, DuriSuggestionEnvelope } from "../types";

type RunStatus = "idle" | "loading" | "error";

type DuriAnalysisFeatureState = {
  sessionsByTripId: Record<string, DuriAnalysisSession | undefined>;
  suggestionsByTripId: Record<string, DuriSuggestionEnvelope[] | undefined>;
  receiptsBySuggestionId: Record<string, DuriSuggestionApplyReceipt | undefined>;
  analysisStatusByTripId: Record<string, RunStatus | undefined>;
  suggestionStatusByTripId: Record<string, RunStatus | undefined>;
  analysisErrorByTripId: Record<string, string | undefined>;
  suggestionErrorByTripId: Record<string, string | undefined>;
  beginAnalysis: (tripId: string) => boolean;
  completeAnalysis: (session: DuriAnalysisSession) => void;
  failAnalysis: (tripId: string, message: string) => void;
  beginSuggestionGeneration: (tripId: string) => boolean;
  completeSuggestionGeneration: (tripId: string, baseFingerprint: string, suggestions: DuriSuggestionEnvelope[]) => boolean;
  failSuggestionGeneration: (tripId: string, message: string) => void;
  recordReceipt: (receipt: DuriSuggestionApplyReceipt) => void;
};

export const useDuriAnalysisStore = create<DuriAnalysisFeatureState>((set) => ({
  sessionsByTripId: {},
  suggestionsByTripId: {},
  receiptsBySuggestionId: {},
  analysisStatusByTripId: {},
  suggestionStatusByTripId: {},
  analysisErrorByTripId: {},
  suggestionErrorByTripId: {},
  beginAnalysis: (tripId) => {
    let started = false;
    set((state) => {
      if (state.analysisStatusByTripId[tripId] === "loading") return state;
      started = true;
      return {
        analysisStatusByTripId: { ...state.analysisStatusByTripId, [tripId]: "loading" },
        analysisErrorByTripId: { ...state.analysisErrorByTripId, [tripId]: undefined },
      };
    });
    return started;
  },
  completeAnalysis: (session) => set((state) => ({
    sessionsByTripId: { ...state.sessionsByTripId, [session.tripId]: session },
    suggestionsByTripId: { ...state.suggestionsByTripId, [session.tripId]: undefined },
    analysisStatusByTripId: { ...state.analysisStatusByTripId, [session.tripId]: "idle" },
    suggestionStatusByTripId: { ...state.suggestionStatusByTripId, [session.tripId]: "idle" },
    analysisErrorByTripId: { ...state.analysisErrorByTripId, [session.tripId]: undefined },
    suggestionErrorByTripId: { ...state.suggestionErrorByTripId, [session.tripId]: undefined },
  })),
  failAnalysis: (tripId, message) => set((state) => ({
    analysisStatusByTripId: { ...state.analysisStatusByTripId, [tripId]: "error" },
    analysisErrorByTripId: { ...state.analysisErrorByTripId, [tripId]: message },
  })),
  beginSuggestionGeneration: (tripId) => {
    let started = false;
    set((state) => {
      if (state.suggestionStatusByTripId[tripId] === "loading") return state;
      started = true;
      return {
        suggestionStatusByTripId: { ...state.suggestionStatusByTripId, [tripId]: "loading" },
        suggestionErrorByTripId: { ...state.suggestionErrorByTripId, [tripId]: undefined },
      };
    });
    return started;
  },
  completeSuggestionGeneration: (tripId, baseFingerprint, suggestions) => {
    let saved = false;
    set((state) => {
      if (state.sessionsByTripId[tripId]?.inputFingerprint !== baseFingerprint) return {
        suggestionStatusByTripId: { ...state.suggestionStatusByTripId, [tripId]: "error" },
        suggestionErrorByTripId: { ...state.suggestionErrorByTripId, [tripId]: "분석 입력이 달라져 제안을 저장하지 않았어요. 다시 분석해 주세요." },
      };
      saved = true;
      return {
        suggestionsByTripId: { ...state.suggestionsByTripId, [tripId]: suggestions },
        suggestionStatusByTripId: { ...state.suggestionStatusByTripId, [tripId]: "idle" },
        suggestionErrorByTripId: { ...state.suggestionErrorByTripId, [tripId]: undefined },
      };
    });
    return saved;
  },
  failSuggestionGeneration: (tripId, message) => set((state) => ({
    suggestionStatusByTripId: { ...state.suggestionStatusByTripId, [tripId]: "error" },
    suggestionErrorByTripId: { ...state.suggestionErrorByTripId, [tripId]: message },
  })),
  recordReceipt: (receipt) => set((state) => ({ receiptsBySuggestionId: { ...state.receiptsBySuggestionId, [receipt.suggestionId]: receipt } })),
}));
