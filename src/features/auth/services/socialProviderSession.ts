import type { AuthProvider } from "../types";
import { clearGoogleProviderSession } from "./googleNativeProvider";
import { clearKakaoProviderSession } from "./kakaoNativeProvider";

export async function clearSocialProviderSession(provider: AuthProvider | null | undefined) {
  if (provider === "google") {
    await clearGoogleProviderSession();
  }
  if (provider === "kakao") {
    await clearKakaoProviderSession();
  }
}
