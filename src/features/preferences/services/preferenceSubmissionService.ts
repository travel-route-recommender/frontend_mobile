import type { DataSourceMode } from "../../../config/environment";
import { environment } from "../../../config/environment";
import { calculatePersonalPreferenceResult, PERSONAL_TEST_VERSION } from "../../../duri/preferences";
import { validatePreferenceAnswers } from "../logic/validatePreferenceAnswers";
import type { PreferenceSubmissionInput, PreferenceSubmissionResult } from "../types";

export interface PreferenceSubmissionService {
  submit(input: PreferenceSubmissionInput): Promise<PreferenceSubmissionResult>;
}

class LocalMockPreferenceSubmissionService implements PreferenceSubmissionService {
  async submit(input: PreferenceSubmissionInput): Promise<PreferenceSubmissionResult> {
    const validation = validatePreferenceAnswers(input.answers, PERSONAL_TEST_VERSION);
    if (!validation.valid) return { status: "error", code: validation.code === "empty-config" ? "empty-config" : "invalid-answers", message: validation.message };
    const { userId: _userId, ...result } = calculatePersonalPreferenceResult("", validation.answers, input.completedAt);
    return { status: "success", source: "local-mock", result };
  }
}

class UnavailableQuizSubmissionService implements PreferenceSubmissionService {
  async submit(): Promise<PreferenceSubmissionResult> {
    return { status: "error", code: "contract-unavailable", message: "백엔드 Quiz 계약 연결 전입니다. 답변은 기기에 그대로 보관했어요." };
  }
}

export function createPreferenceSubmissionService(mode: DataSourceMode): PreferenceSubmissionService {
  return mode === "mock" ? new LocalMockPreferenceSubmissionService() : new UnavailableQuizSubmissionService();
}

export const preferenceSubmissionService = createPreferenceSubmissionService(environment.dataSource);
