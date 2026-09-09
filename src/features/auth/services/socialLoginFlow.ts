import type { ApiClient } from "../../../services/apiClient";
import type { SocialProvider } from "../types";
import type { AppleOAuthCredential } from "./appleNativeAuth";
import { createSocialConsentRequestFields, socialProviderUnavailableMessage, supportsBackendSocialProvider } from "./backendAuthContract";

type SocialLoginFlowDependencies = {
  apiClient: ApiClient;
  requestKakaoAccessToken: () => Promise<string>;
  requestAppleCredential: () => Promise<AppleOAuthCredential>;
};

export async function requestSocialLoginSession<Session>(
  provider: SocialProvider,
  dependencies: SocialLoginFlowDependencies,
): Promise<Session> {
  if (!supportsBackendSocialProvider(provider)) {
    throw new Error(socialProviderUnavailableMessage(provider));
  }

  const consent = createSocialConsentRequestFields();
  if (provider === "kakao") {
    const accessToken = await dependencies.requestKakaoAccessToken();
    return dependencies.apiClient.request<Session>({
      path: "/auth/oauth/kakao",
      method: "POST",
      auth: false,
      body: { accessToken, ...consent },
    });
  }

  if (provider === "apple") {
    const credential = await dependencies.requestAppleCredential();
    return dependencies.apiClient.request<Session>({
      path: "/auth/oauth/apple",
      method: "POST",
      auth: false,
      body: { ...credential, ...consent },
    });
  }

  throw new Error(socialProviderUnavailableMessage(provider));
}
