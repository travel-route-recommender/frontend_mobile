type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" ? value as UnknownRecord : undefined;
}

function readString(record: UnknownRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Native SDK는 reject(code, message, NSError)로 실패를 알린다.
// code는 Kakao SDK의 실패 사유(Cancelled, AccessDenied 등)이거나 패키지 자체 코드다.
export function kakaoAuthErrorMessage(error: unknown) {
  const source = asRecord(error);
  const userInfo = asRecord(source?.userInfo);
  const code = readString(source, "code");
  const description = readString(source, "message")
    ?? readString(userInfo, "nativeErrorMessage")
    ?? (error instanceof Error ? error.message : undefined);

  if (code === "Cancelled" || code === "AccessDenied") {
    return "카카오 로그인이 취소됐어요.";
  }
  if (code === "Package-SDKNotInitialized") {
    return "카카오 SDK 초기화에 실패했어요. EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY를 확인한 뒤 네이티브 빌드를 다시 해 주세요.";
  }
  if (code === "Package-KakaoAppNotAvailable") {
    return "카카오톡이 설치되어 있지 않아요. 카카오계정으로 로그인해 주세요.";
  }
  if (code === "MisconfiguredAppKey" || code === "InvalidClient") {
    return "카카오 Native 앱 키가 올바르지 않아요. EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY를 확인해 주세요.";
  }
  if (userInfo?.isInvalidTokenError === true) {
    return "카카오 토큰이 만료됐어요. 카카오 로그인을 다시 시도해 주세요.";
  }

  return description ? `카카오 로그인에 실패했어요. (${description})` : "카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
}
