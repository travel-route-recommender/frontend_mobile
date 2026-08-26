import { initializeKakaoSDK } from "@react-native-kakao/core";
import { login as loginWithKakao, logout as logoutFromKakao } from "@react-native-kakao/user";
import { environment } from "../../../config/environment";
import { requestKakaoNativeIdToken } from "./kakaoNativeAuth";

export function requestKakaoProviderIdToken(nonce: string) {
  return requestKakaoNativeIdToken(
    environment.kakaoNativeAppKey,
    nonce,
    { initialize: initializeKakaoSDK, login: loginWithKakao },
  );
}

export function clearKakaoProviderSession() {
  return logoutFromKakao();
}
