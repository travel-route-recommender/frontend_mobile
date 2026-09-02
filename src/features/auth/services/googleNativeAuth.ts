type GoogleSignInResponse = {
  type: "success" | "noSavedCredentialFound" | "cancelled";
  data: { idToken: string | null } | null;
};

type GoogleNativeDependencies = {
  configure(options: {
    webClientId: string;
    iosClientId?: string;
    nonce: string;
    autoSelectOnSignIn: boolean;
  }): void;
  checkPlayServices(): Promise<void>;
  signIn(): Promise<GoogleSignInResponse>;
  createAccount(): Promise<GoogleSignInResponse>;
  presentExplicitSignIn(): Promise<GoogleSignInResponse>;
};

export async function requestGoogleNativeIdToken(
  webClientId: string | undefined,
  iosClientId: string | undefined,
  nonce: string,
  dependencies: GoogleNativeDependencies,
) {
  const normalizedWebClientId = webClientId?.trim();
  if (!normalizedWebClientId) {
    throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 설정이 필요해요.");
  }

  dependencies.configure({
    webClientId: normalizedWebClientId,
    ...(iosClientId?.trim() ? { iosClientId: iosClientId.trim() } : {}),
    nonce,
    autoSelectOnSignIn: false,
  });
  await dependencies.checkPlayServices();

  let response = await dependencies.signIn();
  if (response.type === "noSavedCredentialFound") {
    response = await dependencies.createAccount();
  }
  if (response.type === "noSavedCredentialFound") {
    response = await dependencies.presentExplicitSignIn();
  }
  if (response.type === "cancelled") {
    throw new Error("Google 로그인이 취소됐어요.");
  }
  if (response.type !== "success" || !response.data?.idToken) {
    throw new Error("Google에서 ID Token을 받지 못했어요.");
  }
  return response.data.idToken;
}
