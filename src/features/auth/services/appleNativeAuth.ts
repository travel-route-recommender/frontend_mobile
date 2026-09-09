export type AppleOAuthCredential = {
  identityToken: string;
  authorizationCode: string;
  nonce: string;
  fullName?: {
    givenName?: string;
    familyName?: string;
  };
};

type AppleNativeCredential = {
  identityToken?: string | null;
  authorizationCode?: string | null;
  fullName?: {
    givenName?: string | null;
    familyName?: string | null;
  } | null;
};

type AppleNativeAuthClient = {
  signIn(options: { nonce: string }): Promise<AppleNativeCredential>;
};

export async function requestAppleNativeCredential(
  nonceValue: string,
  client: AppleNativeAuthClient,
): Promise<AppleOAuthCredential> {
  const nonce = nonceValue.trim();
  if (!nonce) throw new Error("Apple 로그인 보안값을 만들지 못했어요.");

  const credential = await client.signIn({ nonce });
  const identityToken = credential.identityToken?.trim();
  const authorizationCode = credential.authorizationCode?.trim();
  if (!identityToken || !authorizationCode) {
    throw new Error("Apple 로그인 정보를 받지 못했어요.");
  }

  const givenName = credential.fullName?.givenName?.trim();
  const familyName = credential.fullName?.familyName?.trim();
  const fullName = givenName || familyName
    ? { ...(givenName ? { givenName } : {}), ...(familyName ? { familyName } : {}) }
    : undefined;

  return {
    identityToken,
    authorizationCode,
    nonce,
    ...(fullName ? { fullName } : {}),
  };
}
