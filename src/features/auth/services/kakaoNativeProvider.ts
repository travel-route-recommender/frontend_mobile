export function requestKakaoProviderAccessToken(): Promise<string> {
  throw new Error("카카오 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
}

export function requestKakaoProviderIdToken(_nonce: string): Promise<string> {
  throw new Error("카카오 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
}

export function clearKakaoProviderSession(): Promise<void> {
  return Promise.resolve();
}
