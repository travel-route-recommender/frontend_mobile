import type { DataSourceMode } from "../../../config/environment";
import { environment } from "../../../config/environment";
import type { TravelPreferenceSurveyResult } from "../../preferences/types";
import { calculateFriendCompatibility } from "../logic/calculate-friend-compatibility";
import type { FriendCompatibilityResult } from "../types";

type CompatibilityCalculationInput = {
  requester: TravelPreferenceSurveyResult;
  friends: TravelPreferenceSurveyResult[];
  calculatedAt?: string;
};

type CompatibilityCalculationOutcome =
  | { status: "success"; source: "local-mock"; result: FriendCompatibilityResult }
  | { status: "error"; code: "invalid-participants" | "contract-unavailable"; message: string };

export interface CompatibilityCalculationService {
  calculate(input: CompatibilityCalculationInput): Promise<CompatibilityCalculationOutcome>;
}

const waitForResultPresentation = () => new Promise<void>((resolve) => setTimeout(resolve, 650));

class LocalCompatibilityCalculationService implements CompatibilityCalculationService {
  async calculate(input: CompatibilityCalculationInput): Promise<CompatibilityCalculationOutcome> {
    if (!input.friends.length) return { status: "error", code: "invalid-participants", message: "궁합을 계산할 친구를 한 명 이상 선택해 주세요." };
    const result = calculateFriendCompatibility(input.requester, input.friends, input.calculatedAt);
    await waitForResultPresentation();
    return { status: "success", source: "local-mock", result };
  }
}

class UnavailableCompatibilityCalculationService implements CompatibilityCalculationService {
  async calculate(): Promise<CompatibilityCalculationOutcome> {
    return { status: "error", code: "contract-unavailable", message: "백엔드 궁합도 계산 계약 연결 전입니다. 선택한 친구 정보는 기기에 그대로 있어요." };
  }
}

export function createCompatibilityCalculationService(mode: DataSourceMode): CompatibilityCalculationService {
  return mode === "mock" ? new LocalCompatibilityCalculationService() : new UnavailableCompatibilityCalculationService();
}

export const compatibilityCalculationService = createCompatibilityCalculationService(environment.dataSource);
