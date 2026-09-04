export function requestKakaoProviderAccessToken(): Promise<string> {
  throw new Error("현재 iOS 배포 버전은 카카오 로그인을 지원하지 않아요.");
}

export function requestKakaoProviderIdToken(_nonce: string): Promise<string> {
  throw new Error("현재 iOS 배포 버전은 카카오 로그인을 지원하지 않아요.");
}

export function clearKakaoProviderSession(): Promise<void> {
  return Promise.resolve();
}
