import type { ApiClient } from "../../../services/apiClient";
import type { SocialProvider } from "../types";
import { supportsBackendSocialProvider } from "./backendAuthContract";

type SocialLoginFlowDependencies = {
  apiClient: ApiClient;
  requestKakaoAccessToken: () => Promise<string>;
};

export async function requestSocialLoginSession<Session>(
  provider: SocialProvider,
  dependencies: SocialLoginFlowDependencies,
): Promise<Session> {
  if (!supportsBackendSocialProvider(provider)) {
    throw new Error("현재 Google 로그인을 이용할 수 없어요. 다른 로그인 방법을 선택해 주세요.");
  }

  const accessToken = await dependencies.requestKakaoAccessToken();
  return dependencies.apiClient.request<Session>({
    path: "/auth/oauth/kakao",
    method: "POST",
    auth: false,
    body: { accessToken },
  });
}
