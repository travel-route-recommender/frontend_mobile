interface KakaoNativeLoginToken {
  idToken?: string;
}

interface KakaoNativeAuthClient {
  initialize(appKey: string): Promise<void> | void;
  login(options: { nonce: string }): Promise<KakaoNativeLoginToken>;
}

export async function requestKakaoNativeIdToken(
  nativeAppKey: string | undefined,
  nonce: string,
  client: KakaoNativeAuthClient,
): Promise<string> {
  const appKey = nativeAppKey?.trim();
  if (!appKey) {
    throw new Error("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY 설정이 필요해요.");
  }

  await client.initialize(appKey);
  const token = await client.login({ nonce });
  if (!token.idToken) {
    throw new Error("카카오 OpenID Connect ID Token을 받지 못했어요.");
  }
  return token.idToken;
}
