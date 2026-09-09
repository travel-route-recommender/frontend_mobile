import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { requestAppleNativeCredential } from "./appleNativeAuth";

export function requestAppleProviderCredential() {
  return requestAppleNativeCredential(Crypto.randomUUID(), {
    signIn: ({ nonce }) => AppleAuthentication.signInAsync({
      nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    }),
  });
}
