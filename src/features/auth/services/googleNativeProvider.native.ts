export function requestGoogleProviderIdToken(_nonce: string): Promise<string> {
  throw new Error("현재 배포 버전은 Google 로그인을 지원하지 않아요.");
}

export function clearGoogleProviderSession(): Promise<void> {
  return Promise.resolve();
}
