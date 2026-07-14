import { environment } from "../../../config/environment";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import type { DuriAnalysisSession, DuriSuggestionEnvelope } from "../types";
import { createDuriAnalysisSession } from "../logic/analysisSession";
import { generateDuriSuggestions } from "../logic/suggestionGeneration";

export interface DuriAnalysisService {
  readonly mode: "local" | "server";
  readonly available: boolean;
  readonly unavailableMessage?: string;
  analyze(input: DuriAnalysisInput): Promise<DuriAnalysisSession>;
  generateSuggestions(session: DuriAnalysisSession): Promise<DuriSuggestionEnvelope[]>;
}

export class DuriEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuriEngineUnavailableError";
  }
}

export const localDuriAnalysisService: DuriAnalysisService = {
  mode: "local",
  available: true,
  analyze: async (input) => createDuriAnalysisSession(input, new Date().toISOString()),
  generateSuggestions: async (session) => generateDuriSuggestions(session, new Date().toISOString()),
};

const serverUnavailableMessage = "Duri server 분석·제안·원자 적용 API 계약이 확인되지 않았어요. local 엔진으로 자동 전환하지 않습니다.";

export const unavailableServerDuriAnalysisService: DuriAnalysisService = {
  mode: "server",
  available: false,
  unavailableMessage: serverUnavailableMessage,
  analyze: async () => { throw new DuriEngineUnavailableError(serverUnavailableMessage); },
  generateSuggestions: async () => { throw new DuriEngineUnavailableError(serverUnavailableMessage); },
};

export const duriAnalysisService = environment.duriEngine === "server"
  ? unavailableServerDuriAnalysisService
  : localDuriAnalysisService;
