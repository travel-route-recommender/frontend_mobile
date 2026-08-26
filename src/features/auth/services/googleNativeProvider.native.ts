import { GoogleOneTapSignIn } from "react-native-nitro-google-signin";
import { Platform } from "react-native";
import { environment } from "../../../config/environment";
import { requestGoogleNativeIdToken } from "./googleNativeAuth";

export function requestGoogleProviderIdToken(nonce: string) {
  if (Platform.OS === "ios" && !environment.googleIosClientId?.trim()) {
    throw new Error("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID 설정이 필요해요.");
  }
  return requestGoogleNativeIdToken(
    environment.googleWebClientId,
    Platform.OS === "ios" ? environment.googleIosClientId : undefined,
    nonce,
    GoogleOneTapSignIn,
  );
}

export function clearGoogleProviderSession() {
  return GoogleOneTapSignIn.signOut();
}
