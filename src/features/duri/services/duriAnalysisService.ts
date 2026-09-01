import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import type { DuriAnalysisSession, DuriSuggestionEnvelope } from "../types";
import { createDuriAnalysisSession } from "../logic/analysisSession";
import { generateDuriSuggestions } from "../logic/suggestionGeneration";
import { enrichDuriAnalysisInput } from "./duriEvidenceService";

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
  analyze: async (input) => {
    const enriched = await enrichDuriAnalysisInput(input);
    return createDuriAnalysisSession(enriched, new Date().toISOString());
  },
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

/**
 * API 데이터 모드와 분석 실행 위치는 서로 다른 선택이다. Backend Duri
 * 엔드포인트는 아직 고정 휴리스틱 응답이므로, 서버 여행방도 검증된
 * frontend 수학 엔진으로만 분석한다. 서버 엔진이 정밀 계약을 갖추기
 * 전까지 환경변수 하나로 분석 의미가 바뀌지 않게 한다.
 */
export const duriAnalysisService = localDuriAnalysisService;
