import type { InviteJoinInput, LoginInput, SignupInput, SocialProvider } from "../types";
import { CURRENT_PRIVACY_CONSENT_VERSION, CURRENT_TERMS_VERSION } from "../legal/legalDocuments";
import { normalizeEmail, normalizeInviteCode } from "../validation";

/**
 * Authentication capabilities exposed by the backend main branch.
 * Keep unsupported client flows out of the network layer until matching
 * backend endpoints are added.
 */
export const backendAuthCapabilities = {
  socialProviders: ["kakao", "apple"] as const satisfies readonly SocialProvider[],
  socialIdentityLinking: false,
  guestUpgrade: false,
  accountDeletion: true,
} as const;

/** iOS exposes every social provider implemented by the current backend contract. */
export const iosReleaseAuthenticationPolicy = {
  primaryLogin: "email",
  guestAccess: true,
  thirdPartySocialLogin: true,
} as const;

export function supportsBackendSocialProvider(provider: SocialProvider) {
  return backendAuthCapabilities.socialProviders.some((supported) => supported === provider);
}

export function socialProviderUnavailableMessage(provider: SocialProvider) {
  const label = provider === "google" ? "Google" : provider === "apple" ? "Apple" : "카카오";
  return `현재 백엔드는 ${label} 로그인을 지원하지 않아요.`;
}

export function createSocialConsentRequestFields() {
  return {
    termsVersion: CURRENT_TERMS_VERSION,
    privacyConsentVersion: CURRENT_PRIVACY_CONSENT_VERSION,
    overFourteenConfirmed: true,
  } as const;
}

export function createLoginRequestBody(input: LoginInput) {
  return {
    email: normalizeEmail(input.email),
    password: input.password,
  };
}

export function createSignupRequestBody(input: SignupInput) {
  return {
    nickname: input.nickname.trim(),
    email: normalizeEmail(input.email),
    password: input.password,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyConsentVersion: CURRENT_PRIVACY_CONSENT_VERSION,
    overFourteenConfirmed: true,
  };
}

export function createInviteJoinRequestBody(input: InviteJoinInput) {
  return {
    inviteCode: normalizeInviteCode(input.code),
    nickname: input.nickname.trim(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyConsentVersion: CURRENT_PRIVACY_CONSENT_VERSION,
    overFourteenConfirmed: true,
  };
}

export function createRefreshRequestBody(refreshToken: string) {
  return { refreshToken };
}

export function createAccountDeletionRequestBody(password?: string) {
  const normalized = password?.trim();
  return normalized ? { password: normalized } : undefined;
}
