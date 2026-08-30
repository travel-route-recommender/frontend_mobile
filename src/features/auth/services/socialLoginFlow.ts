import type { ClientMetadata } from "../../../services/clientMetadata";
import type { ApiClient } from "../../../services/apiClient";
import type { SocialChallenge, SocialProvider } from "../types";

type SocialLoginFlowDependencies = {
  apiClient: ApiClient;
  getClientMetadata: () => Promise<ClientMetadata>;
  requestKakaoAccessToken: () => Promise<string>;
  requestProviderIdToken: (
    provider: SocialProvider,
    challenge: SocialChallenge,
  ) => Promise<{ kind: "id-token"; idToken: string }>;
};

export async function requestSocialLoginSession<Session>(
  provider: SocialProvider,
  dependencies: SocialLoginFlowDependencies,
): Promise<Session> {
  if (provider === "kakao") {
    const accessToken = await dependencies.requestKakaoAccessToken();
    return dependencies.apiClient.request<Session>({
      path: "/auth/oauth/kakao",
      method: "POST",
      auth: false,
      body: { accessToken },
    });
  }

  const metadata = await dependencies.getClientMetadata();
  const challenge = await dependencies.apiClient.request<SocialChallenge>({
    path: "/auth/social/challenge",
    method: "POST",
    auth: false,
    body: { provider, installationId: metadata.installationId },
  });
  const authorization = await dependencies.requestProviderIdToken(provider, challenge);
  return dependencies.apiClient.request<Session>({
    path: `/auth/social/${provider}`,
    method: "POST",
    auth: false,
    body: {
      idToken: authorization.idToken,
      challengeId: challenge.challengeId,
      ...metadata,
    },
  });
}
