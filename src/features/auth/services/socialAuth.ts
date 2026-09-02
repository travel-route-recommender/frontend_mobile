import { Platform } from "react-native";
import type { SocialChallenge, SocialProvider } from "../types";
import { requestGoogleProviderIdToken } from "./googleNativeProvider";
import { requestKakaoProviderAccessToken, requestKakaoProviderIdToken } from "./kakaoNativeProvider";

function requireNativeKakaoPlatform() {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("카카오 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
  }
}

export function requestKakaoAccessToken() {
  requireNativeKakaoPlatform();
  return requestKakaoProviderAccessToken();
}

export async function requestProviderIdToken(provider: SocialProvider, challenge: SocialChallenge) {
  if (provider === "kakao") {
    requireNativeKakaoPlatform();
    const idToken = await requestKakaoProviderIdToken(challenge.nonce);
    return { kind: "id-token" as const, idToken };
  }

  const idToken = await requestGoogleProviderIdToken(challenge.nonce);
  return { kind: "id-token" as const, idToken };
}
