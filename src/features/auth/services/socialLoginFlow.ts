import type { ApiClient } from "../../../services/apiClient";
import type { SocialProvider } from "../types";
import { socialProviderUnavailableMessage, supportsBackendSocialProvider } from "./backendAuthContract";

type SocialLoginFlowDependencies = {
  apiClient: ApiClient;
  requestKakaoAccessToken: () => Promise<string>;
};

export async function requestSocialLoginSession<Session>(
  provider: SocialProvider,
  dependencies: SocialLoginFlowDependencies,
): Promise<Session> {
  if (!supportsBackendSocialProvider(provider)) {
    throw new Error(socialProviderUnavailableMessage(provider));
  }

  const accessToken = await dependencies.requestKakaoAccessToken();
  return dependencies.apiClient.request<Session>({
    path: "/auth/oauth/kakao",
    method: "POST",
    auth: false,
    body: { accessToken },
  });
}
