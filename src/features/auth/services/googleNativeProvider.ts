export function requestGoogleProviderIdToken(_nonce: string): Promise<string> {
  throw new Error("Google 로그인은 Android/iOS 개발 빌드에서 확인해 주세요.");
}

export function clearGoogleProviderSession(): Promise<void> {
  return Promise.resolve();
}
