import type { AppleOAuthCredential } from "./appleNativeAuth";

export function requestAppleProviderCredential(): Promise<AppleOAuthCredential> {
  throw new Error("Apple 로그인은 iOS 앱에서만 사용할 수 있어요.");
}
