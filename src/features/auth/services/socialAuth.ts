import * as AuthSession from "expo-auth-session";
import { Platform } from "react-native";
import { environment } from "../../../config/environment";
import type { SocialChallenge, SocialProvider } from "../types";

const googleDiscovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const kakaoDiscovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
  tokenEndpoint: "https://kauth.kakao.com/oauth/token",
};

function providerConfiguration(provider: SocialProvider) {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("소셜 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
  }
  const clientId = provider === "google"
    ? (Platform.OS === "ios" ? environment.googleIosClientId : environment.googleAndroidClientId)
    : environment.kakaoRestApiKey;
  if (!clientId) {
    const key = provider === "google"
      ? (Platform.OS === "ios" ? "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID" : "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID")
      : "EXPO_PUBLIC_KAKAO_REST_API_KEY";
    throw new Error(`${key} 설정이 필요해요.`);
  }
  const configuredRedirectUri = provider === "google"
    ? (Platform.OS === "ios" ? environment.googleIosRedirectUri : environment.googleAndroidRedirectUri)
    : environment.kakaoRedirectUri;
  return {
    clientId,
    discovery: provider === "google" ? googleDiscovery : kakaoDiscovery,
    scopes: provider === "google" ? ["openid", "profile", "email"] : ["openid", "profile_nickname", "profile_image", "account_email"],
    redirectUri: configuredRedirectUri ?? AuthSession.makeRedirectUri({ scheme: "tripmatch", path: `auth/callback/${provider}` }),
  };
}

export async function requestProviderIdToken(provider: SocialProvider, challenge: SocialChallenge) {
  const configuration = providerConfiguration(provider);
  const request = new AuthSession.AuthRequest({
    clientId: configuration.clientId,
    redirectUri: configuration.redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: configuration.scopes,
    state: challenge.state,
    usePKCE: true,
    extraParams: {
      nonce: challenge.nonce,
      ...(provider === "google" ? { prompt: "select_account" } : {}),
    },
  });
  const result = await request.promptAsync(configuration.discovery);
  if (result.type === "cancel" || result.type === "dismiss") throw new Error("소셜 로그인이 취소됐어요.");
  if (result.type !== "success") throw new Error("소셜 로그인 응답을 받지 못했어요.");
  if (result.params.state !== challenge.state) throw new Error("소셜 로그인 state 검증에 실패했어요.");
  const code = result.params.code;
  if (!code || !request.codeVerifier) throw new Error("소셜 로그인 인가 코드를 확인하지 못했어요.");
  if (provider === "kakao") {
    return {
      kind: "authorization-code" as const,
      code,
      state: result.params.state,
      codeVerifier: request.codeVerifier,
      redirectUri: configuration.redirectUri,
    };
  }
  const token = await AuthSession.exchangeCodeAsync({
    clientId: configuration.clientId,
    code,
    redirectUri: configuration.redirectUri,
    extraParams: { code_verifier: request.codeVerifier },
  }, configuration.discovery);
  if (!token.idToken) throw new Error("소셜 제공자가 ID Token을 반환하지 않았어요.");
  return { kind: "id-token" as const, idToken: token.idToken };
}
