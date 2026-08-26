import { Platform } from "react-native";
import type { SocialChallenge, SocialProvider } from "../types";
import { requestGoogleProviderIdToken } from "./googleNativeProvider";
import { requestKakaoProviderIdToken } from "./kakaoNativeProvider";

export async function requestProviderIdToken(provider: SocialProvider, challenge: SocialChallenge) {
  if (provider === "kakao") {
    if (Platform.OS !== "android" && Platform.OS !== "ios") {
      throw new Error("카카오 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
    }
    const idToken = await requestKakaoProviderIdToken(challenge.nonce);
    return { kind: "id-token" as const, idToken };
  }

  const idToken = await requestGoogleProviderIdToken(challenge.nonce);
  return { kind: "id-token" as const, idToken };
}
