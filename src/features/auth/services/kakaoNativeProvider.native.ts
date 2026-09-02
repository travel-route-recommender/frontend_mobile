import { initializeKakaoSDK } from "@react-native-kakao/core";
import { login as loginWithKakao, logout as logoutFromKakao } from "@react-native-kakao/user";
import { environment } from "../../../config/environment";
import { requestKakaoNativeAccessToken, requestKakaoNativeIdToken } from "./kakaoNativeAuth";

const kakaoNativeClient = { initialize: initializeKakaoSDK, login: loginWithKakao };

export function requestKakaoProviderAccessToken() {
  return requestKakaoNativeAccessToken(environment.kakaoNativeAppKey, kakaoNativeClient);
}

export function requestKakaoProviderIdToken(nonce: string) {
  return requestKakaoNativeIdToken(
    environment.kakaoNativeAppKey,
    nonce,
    kakaoNativeClient,
  );
}

export function clearKakaoProviderSession() {
  return logoutFromKakao();
}
