import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import type { DuriAnalysisSession, DuriSuggestionEnvelope } from "../types";
import { createDuriAnalysisSession } from "../logic/analysisSession";
import { generateDuriSuggestions } from "../logic/suggestionGeneration";
import { enrichDuriAnalysisInput } from "./duriEvidenceService";

export interface DuriAnalysisService {
  readonly mode: "local";
  readonly available: boolean;
  readonly unavailableMessage?: string;
  analyze(input: DuriAnalysisInput, signal?: AbortSignal): Promise<DuriAnalysisSession>;
  generateSuggestions(session: DuriAnalysisSession): Promise<DuriSuggestionEnvelope[]>;
}

export const localDuriAnalysisService: DuriAnalysisService = {
  mode: "local",
  available: true,
  analyze: async (input, signal) => {
    const enriched = await enrichDuriAnalysisInput(
      input,
      new Date().toISOString(),
      undefined,
      { signal },
    );
    return createDuriAnalysisSession(enriched, new Date().toISOString());
  },
  generateSuggestions: async (session) => generateDuriSuggestions(session, new Date().toISOString()),
};

/**
 * API 여행방과 로컬 데모 모두 같은 검증된 프론트엔드 분석 엔진을 쓴다.
 * 데이터 원본이 달라도 분석 수식과 제안 의미가 달라지지 않는다.
 */
export const duriAnalysisService = localDuriAnalysisService;
