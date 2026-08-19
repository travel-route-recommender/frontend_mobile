import { Platform } from "react-native";
import { environment } from "../../../config/environment";
import { kakaoAuthErrorMessage } from "./kakaoAuthError";

import type KakaoCore from "@react-native-kakao/core";
import type * as KakaoUser from "@react-native-kakao/user";

// Kakao Native SDK는 Redirect URI를 쓰지 않는다.
// Kakao Developers에는 플랫폼(iOS 번들 ID / Android 패키지명)만 등록하면 된다.
//
// 두 패키지는 import 시점에 네이티브 모듈을 강제로 해석한다. top-level에서 부르면
// 재빌드 전 번들에서 앱 전체가 죽으므로, 카카오 로그인을 실제로 시도할 때 불러온다.
function loadKakaoSdk() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    core: require("@react-native-kakao/core") as typeof KakaoCore,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    user: require("@react-native-kakao/user") as typeof KakaoUser,
  };
}

let initialization: Promise<void> | undefined;

function kakaoNativeAppKey() {
  const nativeAppKey = environment.kakaoNativeAppKey?.trim();
  if (!nativeAppKey) {
    throw new Error("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 설정이 필요해요.");
  }
  return nativeAppKey;
}

function ensureKakaoSdk(core: typeof KakaoCore) {
  if (!initialization) {
    initialization = core.initializeKakaoSDK(kakaoNativeAppKey()).catch((error: unknown) => {
      // 실패한 초기화를 캐시하면 이후 시도가 전부 막힌다.
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export async function requestKakaoAccessToken() {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("카카오 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
  }
  let accessToken: string | undefined;
  try {
    const { core, user } = loadKakaoSdk();
    await ensureKakaoSdk(core);
    accessToken = (await user.login()).accessToken;
  } catch (error) {
    throw new Error(kakaoAuthErrorMessage(error));
  }
  if (!accessToken) throw new Error("카카오 Access Token을 발급받지 못했어요.");
  return accessToken;
}
