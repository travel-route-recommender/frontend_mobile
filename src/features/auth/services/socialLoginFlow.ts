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
    throw new Error("현재 백엔드는 Google 로그인을 지원하지 않아요.");
  }

  const accessToken = await dependencies.requestKakaoAccessToken();
  return dependencies.apiClient.request<Session>({
    path: "/auth/oauth/kakao",
    method: "POST",
    auth: false,
    body: { accessToken },
  });
}
